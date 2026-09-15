import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { Db } from "@/db";
import {
  bankTransactions,
  cashAccounts,
  cashEntries,
  customerCredits,
  customers,
  expensePayments,
  expenses,
  invoices,
  payments,
  type BankTransaction,
  type CashAccount,
  type CashEntry,
} from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";
import { invoiceDisplayNumber } from "./invoice-display";

export type AccountKind = "bank" | "cash" | "card" | "other";
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = { bank: "Τραπεζικός λογαριασμός", cash: "Ταμείο (μετρητά)", card: "Κάρτα / POS", other: "Άλλο" };

export type EntryKind = "transfer" | "fee" | "interest" | "other_in" | "other_out" | "owner_in" | "owner_out" | "tax";
export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  transfer: "Μεταφορά",
  fee: "Προμήθεια / έξοδα τράπεζας",
  interest: "Τόκοι",
  other_in: "Λοιπή είσπραξη",
  other_out: "Λοιπή πληρωμή",
  owner_in: "Κατάθεση επιχειρηματία",
  owner_out: "Ανάληψη επιχειρηματία",
  tax: "Φόροι / εισφορές",
};

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ λογαριασμοί */

export async function listAccounts(db: Db, orgId: string, opts: { includeInactive?: boolean } = {}) {
  const conds = [eq(cashAccounts.orgId, orgId)];
  if (!opts.includeInactive) conds.push(eq(cashAccounts.active, true));
  return db.select().from(cashAccounts).where(and(...conds)).orderBy(desc(cashAccounts.isDefault), asc(cashAccounts.kind), asc(cashAccounts.name));
}

export async function getAccount(db: Db, orgId: string, id: string) {
  return (await db.query.cashAccounts.findFirst({ where: and(eq(cashAccounts.id, id), eq(cashAccounts.orgId, orgId)) })) ?? null;
}

export interface AccountInput {
  name: string;
  kind: AccountKind;
  iban: string;
  bankName: string;
  currency: string;
  openingBalance: number;
  openingDate: string | null;
  isDefault: boolean;
  active: boolean;
}

export async function saveAccount(db: Db, orgId: string, input: AccountInput, id?: string) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Το όνομα λογαριασμού είναι υποχρεωτικό.");
  const all = await listAccounts(db, orgId, { includeInactive: true });
  if (all.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== id)) throw new Error("Υπάρχει ήδη λογαριασμός με αυτό το όνομα.");
  const makeDefault = input.isDefault || all.filter((a) => a.id !== id && a.active).length === 0;
  if (makeDefault) await db.update(cashAccounts).set({ isDefault: false }).where(eq(cashAccounts.orgId, orgId));
  const record = {
    name,
    kind: input.kind,
    iban: input.iban.replace(/\s+/g, "").toUpperCase(),
    bankName: input.bankName.trim(),
    currency: (input.currency || "EUR").toUpperCase(),
    openingBalance: round2(input.openingBalance || 0),
    openingDate: input.openingDate,
    isDefault: makeDefault,
    active: input.active || makeDefault,
  };
  if (id) {
    await db.update(cashAccounts).set(record).where(and(eq(cashAccounts.id, id), eq(cashAccounts.orgId, orgId)));
    return id;
  }
  const newId = randomUUID();
  await db.insert(cashAccounts).values({ id: newId, orgId, ...record, createdAt: now() });
  return newId;
}

export async function deleteAccount(db: Db, orgId: string, id: string) {
  const acc = await getAccount(db, orgId, id);
  if (!acc) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
  const [p, ep, en, tx, cc] = await Promise.all([
    db.query.payments.findFirst({ where: eq(payments.accountId, id), columns: { id: true } }),
    db.query.expensePayments.findFirst({ where: eq(expensePayments.accountId, id), columns: { id: true } }),
    db.query.cashEntries.findFirst({ where: eq(cashEntries.accountId, id), columns: { id: true } }),
    db.query.bankTransactions.findFirst({ where: eq(bankTransactions.accountId, id), columns: { id: true } }),
    db.query.customerCredits.findFirst({ where: eq(customerCredits.accountId, id), columns: { id: true } }),
  ]);
  if (p || ep || en || tx || cc) throw new Error("Ο λογαριασμός έχει κινήσεις – απενεργοποιήστε τον αντί για διαγραφή.");
  await db.delete(cashAccounts).where(eq(cashAccounts.id, id));
  if (acc.isDefault) {
    const next = (await listAccounts(db, orgId))[0];
    if (next) await db.update(cashAccounts).set({ isDefault: true }).where(eq(cashAccounts.id, next.id));
  }
}

/** Προεπιλεγμένος λογαριασμός ανά τρόπο πληρωμής myDATA: μετρητά → ταμείο, αλλιώς ο προεπιλεγμένος. */
export async function defaultAccountFor(db: Db, orgId: string, paymentMethod: number): Promise<string | null> {
  const accounts = await listAccounts(db, orgId);
  if (accounts.length === 0) return null;
  if (paymentMethod === 3) return accounts.find((a) => a.kind === "cash")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  if (paymentMethod === 7) return accounts.find((a) => a.kind === "card")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  return accounts.find((a) => a.isDefault && a.kind !== "cash")?.id ?? accounts.find((a) => a.kind === "bank")?.id ?? accounts[0].id;
}

/* ------------------------------------------------------------------ υπόλοιπα & ledger */

export interface AccountBalance {
  accountId: string;
  balance: number;
  inflow: number;
  outflow: number;
  unmatched: number;
}

export async function accountBalances(db: Db, orgId: string): Promise<Map<string, AccountBalance>> {
  const accounts = await listAccounts(db, orgId, { includeInactive: true });
  const map = new Map<string, AccountBalance>();
  for (const a of accounts) map.set(a.id, { accountId: a.id, balance: a.openingBalance, inflow: 0, outflow: 0, unmatched: 0 });
  const [payRows, outRows, entryRows, txRows, creditRows] = await Promise.all([
    db
      .select({ accountId: payments.accountId, amount: payments.amount, invoiceType: invoices.invoiceType })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, orgId), sql`${payments.accountId} is not null`)),
    db
      .select({ accountId: expensePayments.accountId, total: sql<number>`sum(${expensePayments.amount})` })
      .from(expensePayments)
      .where(and(eq(expensePayments.orgId, orgId), sql`${expensePayments.accountId} is not null`))
      .groupBy(expensePayments.accountId),
    db
      .select({ accountId: cashEntries.accountId, inflow: sql<number>`sum(case when ${cashEntries.amount} > 0 then ${cashEntries.amount} else 0 end)`, outflow: sql<number>`sum(case when ${cashEntries.amount} < 0 then -${cashEntries.amount} else 0 end)` })
      .from(cashEntries)
      .where(eq(cashEntries.orgId, orgId))
      .groupBy(cashEntries.accountId),
    db.select({ accountId: bankTransactions.accountId, n: sql<number>`count(*)` }).from(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.status, "unmatched"))).groupBy(bankTransactions.accountId),
    db.select({ accountId: customerCredits.accountId, amount: customerCredits.amount }).from(customerCredits).where(and(eq(customerCredits.orgId, orgId), sql`${customerCredits.accountId} is not null`)),
  ]);
  for (const r of payRows) {
    const b = map.get(r.accountId!);
    if (!b) continue;
    // Είσπραξη σε πιστωτικό τιμολόγιο = επιστροφή χρημάτων (εκροή).
    if (getDocumentType(r.invoiceType).credit) b.outflow = round2(b.outflow + r.amount);
    else b.inflow = round2(b.inflow + r.amount);
  }
  for (const r of creditRows) {
    const b = map.get(r.accountId!);
    if (!b) continue;
    if (r.amount > 0) b.inflow = round2(b.inflow + r.amount);
    else b.outflow = round2(b.outflow - r.amount);
  }
  for (const r of outRows) {
    const b = map.get(r.accountId!);
    if (b) b.outflow = round2(b.outflow + Number(r.total));
  }
  for (const r of entryRows) {
    const b = map.get(r.accountId);
    if (b) {
      b.inflow = round2(b.inflow + Number(r.inflow));
      b.outflow = round2(b.outflow + Number(r.outflow));
    }
  }
  for (const r of txRows) {
    const b = map.get(r.accountId);
    if (b) b.unmatched = Number(r.n);
  }
  for (const b of map.values()) b.balance = round2(b.balance + b.inflow - b.outflow);
  return map;
}

export interface LedgerRow {
  id: string;
  date: string;
  amount: number;
  kind: "payment" | "expense_payment" | "entry" | "credit";
  entryKind?: EntryKind;
  label: string;
  detail: string;
  link?: string;
  method?: number;
  reference?: string;
}

/** Ενοποιημένο ledger λογαριασμού: εισπράξεις, πληρωμές προμηθευτών και λοιπές κινήσεις, με τρέχον υπόλοιπο. */
export async function accountLedger(db: Db, orgId: string, accountId: string, opts: { from?: string; to?: string } = {}) {
  const acc = await getAccount(db, orgId, accountId);
  if (!acc) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
  const [ins, outs, ents, creds] = await Promise.all([
    db
      .select({ p: payments, inv: { id: invoices.id, seriesCode: invoices.seriesCode, number: invoices.number, status: invoices.status, invoiceType: invoices.invoiceType, customerName: invoices.customerName } })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, orgId), eq(payments.accountId, accountId))),
    db
      .select({ p: expensePayments, e: { id: expenses.id, supplierName: expenses.supplierName, number: expenses.number, series: expenses.series, supplierId: expenses.supplierId } })
      .from(expensePayments)
      .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
      .where(and(eq(expensePayments.orgId, orgId), eq(expensePayments.accountId, accountId))),
    db.select().from(cashEntries).where(and(eq(cashEntries.orgId, orgId), eq(cashEntries.accountId, accountId))),
    db
      .select({ c: customerCredits, customerName: customers.name })
      .from(customerCredits)
      .innerJoin(customers, eq(customers.id, customerCredits.customerId))
      .where(and(eq(customerCredits.orgId, orgId), eq(customerCredits.accountId, accountId))),
  ]);
  const rows: LedgerRow[] = [
    ...ins.map(({ p, inv }) => {
      const refund = getDocumentType(inv.invoiceType).credit;
      return {
        id: p.id,
        date: p.paidAt,
        amount: refund ? -p.amount : p.amount,
        kind: "payment" as const,
        label: `${refund ? "Επιστροφή" : "Είσπραξη"} ${invoiceDisplayNumber(inv)}`,
        detail: inv.customerName || "",
        link: `/invoices/${inv.id}`,
        method: p.method,
        reference: p.reference ?? "",
      };
    }),
    ...creds.map(({ c, customerName }) => ({
      id: c.id,
      date: c.movedAt,
      amount: c.amount,
      kind: "credit" as const,
      label: c.amount > 0 ? `Προκαταβολή ${customerName}` : `Επιστροφή προκαταβολής ${customerName}`,
      detail: c.note || c.reference,
      link: `/customers/${c.customerId}`,
      method: c.method ?? undefined,
      reference: c.reference,
    })),
    ...outs.map(({ p, e }) => ({
      id: p.id,
      date: p.paidAt,
      amount: -p.amount,
      kind: "expense_payment" as const,
      label: `Πληρωμή ${e.supplierName}`,
      detail: `${e.series ? `${e.series}-` : ""}${e.number}`.trim(),
      link: e.supplierId ? `/suppliers/${e.supplierId}` : "/expenses",
      method: p.method,
      reference: p.reference,
    })),
    ...ents.map((en) => ({
      id: en.id,
      date: en.movedAt,
      amount: en.amount,
      kind: "entry" as const,
      entryKind: en.kind as EntryKind,
      label: ENTRY_KIND_LABELS[en.kind as EntryKind] ?? en.kind,
      detail: en.note,
    })),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  let running = acc.openingBalance;
  const withBalance = rows.map((r) => {
    running = round2(running + r.amount);
    return { ...r, balance: running };
  });
  const filtered = withBalance.filter((r) => (!opts.from || r.date >= opts.from) && (!opts.to || r.date <= opts.to)).reverse();
  return { account: acc, rows: filtered, closingBalance: running };
}

/* ------------------------------------------------------------------ λοιπές κινήσεις */

export async function addEntry(db: Db, orgId: string, input: { accountId: string; amount: number; kind: EntryKind; note?: string; movedAt: string }) {
  const acc = await getAccount(db, orgId, input.accountId);
  if (!acc) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
  if (!input.amount) throw new Error("Το ποσό δεν μπορεί να είναι 0.");
  const outflowKinds: EntryKind[] = ["fee", "other_out", "owner_out", "tax"];
  const sign = outflowKinds.includes(input.kind) ? -1 : input.kind === "transfer" ? Math.sign(input.amount) : 1;
  const entry: CashEntry = { id: randomUUID(), orgId, accountId: acc.id, amount: round2(sign * Math.abs(input.amount)), kind: input.kind, note: input.note ?? "", transferId: null, movedAt: input.movedAt, createdAt: now() };
  await db.insert(cashEntries).values(entry);
  return entry;
}

export async function transferBetweenAccounts(db: Db, orgId: string, input: { fromAccountId: string; toAccountId: string; amount: number; movedAt: string; note?: string }) {
  if (input.fromAccountId === input.toAccountId) throw new Error("Επιλέξτε διαφορετικό λογαριασμό προορισμού.");
  if (!(input.amount > 0)) throw new Error("Το ποσό πρέπει να είναι θετικό.");
  const [from, to] = await Promise.all([getAccount(db, orgId, input.fromAccountId), getAccount(db, orgId, input.toAccountId)]);
  if (!from || !to) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
  const transferId = randomUUID();
  const amount = round2(input.amount);
  await db.insert(cashEntries).values([
    { id: randomUUID(), orgId, accountId: from.id, amount: -amount, kind: "transfer", note: input.note || `Προς ${to.name}`, transferId, movedAt: input.movedAt, createdAt: now() },
    { id: randomUUID(), orgId, accountId: to.id, amount, kind: "transfer", note: input.note || `Από ${from.name}`, transferId, movedAt: input.movedAt, createdAt: now() },
  ]);
  return transferId;
}

export async function deleteEntry(db: Db, orgId: string, id: string) {
  const en = await db.query.cashEntries.findFirst({ where: and(eq(cashEntries.id, id), eq(cashEntries.orgId, orgId)) });
  if (!en) throw new Error("Η κίνηση δεν βρέθηκε.");
  const ids = en.transferId ? (await db.select({ id: cashEntries.id }).from(cashEntries).where(eq(cashEntries.transferId, en.transferId))).map((r) => r.id) : [id];
  await db.update(bankTransactions).set({ status: "unmatched", matchedType: null, matchedId: null, matchNote: "" }).where(and(eq(bankTransactions.matchedType, "entry"), inArray(bankTransactions.matchedId, ids)));
  await db.delete(cashEntries).where(inArray(cashEntries.id, ids));
}

/* ------------------------------------------------------------------ εισαγωγή extrait */

export interface StatementRow {
  bookedAt: string;
  amount: number;
  description: string;
  counterparty?: string;
  reference?: string;
  balanceAfter?: number | null;
}

const fingerprint = (accountId: string, r: StatementRow) => createHash("sha1").update(`${accountId}|${r.bookedAt}|${r.amount.toFixed(2)}|${r.description.trim().toLowerCase()}|${(r.reference ?? "").trim()}`).digest("hex");

/** Εισαγωγή γραμμών extrait – οι διπλές (ίδιο αποτύπωμα) παραλείπονται. */
export async function importStatement(db: Db, orgId: string, accountId: string, rows: StatementRow[]) {
  const acc = await getAccount(db, orgId, accountId);
  if (!acc) throw new Error("Ο λογαριασμός δεν βρέθηκε.");
  const valid = rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.bookedAt) && Number.isFinite(r.amount) && r.amount !== 0);
  if (valid.length === 0) throw new Error("Δεν βρέθηκαν έγκυρες γραμμές (ημερομηνία + ποσό).");
  const fps = valid.map((r) => fingerprint(accountId, r));
  const existing = new Set((await db.select({ fp: bankTransactions.fingerprint }).from(bankTransactions).where(and(eq(bankTransactions.accountId, accountId), inArray(bankTransactions.fingerprint, fps)))).map((r) => r.fp));
  const batchId = randomUUID();
  const seen = new Set<string>();
  const fresh = valid.filter((r, i) => {
    const fp = fps[i];
    if (existing.has(fp) || seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
  if (fresh.length) {
    await db.insert(bankTransactions).values(
      fresh.map((r) => ({
        id: randomUUID(),
        orgId,
        accountId,
        bookedAt: r.bookedAt,
        amount: round2(r.amount),
        description: r.description.trim().slice(0, 500),
        counterparty: (r.counterparty ?? "").trim().slice(0, 200),
        reference: (r.reference ?? "").trim().slice(0, 100),
        balanceAfter: r.balanceAfter ?? null,
        fingerprint: fingerprint(accountId, r),
        importBatchId: batchId,
        status: "unmatched",
        matchedType: null,
        matchedId: null,
        matchNote: "",
        createdAt: now(),
      })),
    );
  }
  return { imported: fresh.length, skipped: valid.length - fresh.length, invalid: rows.length - valid.length, batchId };
}

export async function listTransactions(db: Db, orgId: string, accountId: string, opts: { status?: string; limit?: number } = {}) {
  const conds = [eq(bankTransactions.orgId, orgId), eq(bankTransactions.accountId, accountId)];
  if (opts.status) conds.push(eq(bankTransactions.status, opts.status));
  return db
    .select()
    .from(bankTransactions)
    .where(and(...conds))
    .orderBy(desc(bankTransactions.bookedAt), desc(bankTransactions.createdAt))
    .limit(opts.limit ?? 500);
}

/* ------------------------------------------------------------------ συμφωνία */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .trim();

function daysApart(a: string, b: string) {
  return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000));
}

export interface MatchCandidate {
  type: "invoice" | "expense";
  id: string;
  label: string;
  counterparty: string;
  remaining: number;
  date: string;
  score: number;
}

/** Υποψήφια παραστατικά για μια γραμμή extrait: ανοιχτά τιμολόγια (εισροή) ή ανοιχτά έξοδα (εκροή). */
export async function matchCandidates(db: Db, orgId: string, tx: BankTransaction, limit = 8): Promise<MatchCandidate[]> {
  const amount = Math.abs(tx.amount);
  const text = norm(`${tx.description} ${tx.counterparty} ${tx.reference}`);
  const tokens = text.split(" ").filter((t) => t.length >= 3);
  const out: MatchCandidate[] = [];
  if (tx.amount > 0) {
    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, ["issued", "partially_paid"]), ne(invoices.number, 0)))
      .orderBy(desc(invoices.issueDate))
      .limit(400);
    for (const inv of rows) {
      const dt = getDocumentType(inv.invoiceType);
      if (dt.kind !== "invoice" || dt.credit) continue;
      const remaining = round2(inv.totalGrossValue - inv.paidAmount);
      if (remaining <= 0) continue;
      let score = 0;
      if (Math.abs(remaining - amount) < 0.005) score += 60;
      else if (remaining > amount) score += 10;
      const num = invoiceDisplayNumber(inv);
      if (num && text.includes(norm(num))) score += 40;
      else if (text.includes(` ${inv.number} `) || text.endsWith(` ${inv.number}`)) score += 15;
      const name = norm(inv.customerName ?? "");
      const nameTokens = name.split(" ").filter((t) => t.length >= 3);
      const hits = nameTokens.filter((t) => tokens.includes(t)).length;
      if (nameTokens.length && hits) score += Math.min(30, Math.round((hits / nameTokens.length) * 30));
      const gap = daysApart(inv.issueDate, tx.bookedAt);
      if (gap <= 45) score += 10 - Math.min(10, Math.floor(gap / 5));
      if (score > 0) out.push({ type: "invoice", id: inv.id, label: num, counterparty: inv.customerName ?? "", remaining, date: inv.issueDate, score });
    }
  } else {
    const rows = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.orgId, orgId), sql`${expenses.status} not in ('paid','rejected')`, sql`${expenses.grossValue} - ${expenses.paidAmount} > 0.005`))
      .orderBy(desc(expenses.issueDate))
      .limit(400);
    for (const e of rows) {
      const remaining = round2(e.grossValue - e.paidAmount);
      let score = 0;
      if (Math.abs(remaining - amount) < 0.005) score += 60;
      else if (remaining > amount) score += 10;
      const name = norm(e.supplierName);
      const nameTokens = name.split(" ").filter((t) => t.length >= 3);
      const hits = nameTokens.filter((t) => tokens.includes(t)).length;
      if (nameTokens.length && hits) score += Math.min(30, Math.round((hits / nameTokens.length) * 30));
      if (e.number && text.includes(norm(e.number))) score += 15;
      const gap = daysApart(e.issueDate, tx.bookedAt);
      if (gap <= 60) score += 10 - Math.min(10, Math.floor(gap / 6));
      if (score > 0) out.push({ type: "expense", id: e.id, label: `${e.series ? `${e.series}-` : ""}${e.number || "—"} · ${e.supplierName}`, counterparty: e.supplierName, remaining, date: e.issueDate, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface ReconcileResult {
  linkedExisting: number;
  autoCreated: number;
  transfers: number;
  suggestions: number;
  remaining: number;
}

/**
 * Αυτόματη συμφωνία extrait:
 * 1. σύνδεση με ήδη καταχωρημένες εισπράξεις/πληρωμές ίδιου ποσού (±4 ημέρες),
 * 2. ταύτιση μεταφορών μεταξύ λογαριασμών (κίνηση ίδιου ποσού/αντίθετου πρόσημου),
 * 3. δημιουργία είσπραξης/πληρωμής όταν ένα μόνο ανοιχτό παραστατικό ταιριάζει με βεβαιότητα (ποσό + αριθμός/όνομα).
 */
export async function autoReconcile(db: Db, orgId: string, accountId: string, opts: { createPayments?: boolean } = {}): Promise<ReconcileResult> {
  const txs = await listTransactions(db, orgId, accountId, { status: "unmatched", limit: 2000 });
  const result: ReconcileResult = { linkedExisting: 0, autoCreated: 0, transfers: 0, suggestions: 0, remaining: 0 };
  if (txs.length === 0) return result;
  const from = txs.reduce((m, t) => (t.bookedAt < m ? t.bookedAt : m), txs[0].bookedAt);
  const to = txs.reduce((m, t) => (t.bookedAt > m ? t.bookedAt : m), txs[0].bookedAt);
  const lo = new Date(new Date(from).getTime() - 5 * 86_400_000).toISOString().slice(0, 10);
  const hi = new Date(new Date(to).getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
  const matchedPaymentIds = new Set((await db.select({ id: bankTransactions.matchedId }).from(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.matchedType, "payment")))).map((r) => r.id!));
  const matchedExpPayIds = new Set((await db.select({ id: bankTransactions.matchedId }).from(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.matchedType, "expense_payment")))).map((r) => r.id!));
  const matchedEntryIds = new Set((await db.select({ id: bankTransactions.matchedId }).from(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.matchedType, "entry")))).map((r) => r.id!));

  const matchedCreditIds = new Set((await db.select({ id: bankTransactions.matchedId }).from(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.matchedType, "credit")))).map((r) => r.id!));
  const [pays, expPays, entries, creds] = await Promise.all([
    db
      .select({ p: payments, invoiceType: invoices.invoiceType })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, orgId), isNull(payments.offsetSource), gte(payments.paidAt, lo), lte(payments.paidAt, hi), or(eq(payments.accountId, accountId), isNull(payments.accountId)))),
    db
      .select()
      .from(expensePayments)
      .where(and(eq(expensePayments.orgId, orgId), gte(expensePayments.paidAt, lo), lte(expensePayments.paidAt, hi), or(eq(expensePayments.accountId, accountId), isNull(expensePayments.accountId)))),
    db.select().from(cashEntries).where(and(eq(cashEntries.orgId, orgId), eq(cashEntries.accountId, accountId), gte(cashEntries.movedAt, lo), lte(cashEntries.movedAt, hi))),
    db
      .select()
      .from(customerCredits)
      .where(and(eq(customerCredits.orgId, orgId), inArray(customerCredits.kind, ["advance", "refund"]), gte(customerCredits.movedAt, lo), lte(customerCredits.movedAt, hi), or(eq(customerCredits.accountId, accountId), isNull(customerCredits.accountId)))),
  ]);
  // Είσπραξη σε πιστωτικό = εκροή (επιστροφή χρημάτων).
  const signedPays = pays.map(({ p, invoiceType }) => ({ ...p, signed: getDocumentType(invoiceType).credit ? -p.amount : p.amount }));
  const usedPay = new Set<string>();
  const usedExp = new Set<string>();
  const usedEntry = new Set<string>();
  const usedCredit = new Set<string>();

  for (const tx of txs) {
    const amount = Math.abs(tx.amount);
    // 1. Υπάρχουσα είσπραξη / πληρωμή / επιστροφή
    {
      const cands = signedPays.filter((p) => !usedPay.has(p.id) && !matchedPaymentIds.has(p.id) && Math.abs(p.signed - tx.amount) < 0.005 && daysApart(p.paidAt, tx.bookedAt) <= 4).sort((a, b) => daysApart(a.paidAt, tx.bookedAt) - daysApart(b.paidAt, tx.bookedAt));
      const hit = cands[0];
      if (hit) {
        usedPay.add(hit.id);
        if (!hit.accountId) await db.update(payments).set({ accountId }).where(eq(payments.id, hit.id));
        await db.update(bankTransactions).set({ status: "matched", matchedType: "payment", matchedId: hit.id, matchNote: hit.signed > 0 ? "Αυτόματη ταύτιση με καταχωρημένη είσπραξη" : "Αυτόματη ταύτιση με επιστροφή χρημάτων" }).where(eq(bankTransactions.id, tx.id));
        result.linkedExisting += 1;
        continue;
      }
      const credit = creds.find((c) => !usedCredit.has(c.id) && !matchedCreditIds.has(c.id) && Math.abs(c.amount - tx.amount) < 0.005 && daysApart(c.movedAt, tx.bookedAt) <= 4);
      if (credit) {
        usedCredit.add(credit.id);
        if (!credit.accountId) await db.update(customerCredits).set({ accountId }).where(eq(customerCredits.id, credit.id));
        await db.update(bankTransactions).set({ status: "matched", matchedType: "credit", matchedId: credit.id, matchNote: credit.amount > 0 ? "Αυτόματη ταύτιση με προκαταβολή πελάτη" : "Αυτόματη ταύτιση με επιστροφή προκαταβολής" }).where(eq(bankTransactions.id, tx.id));
        result.linkedExisting += 1;
        continue;
      }
    }
    if (tx.amount < 0) {
      const cands = expPays.filter((p) => !usedExp.has(p.id) && !matchedExpPayIds.has(p.id) && Math.abs(p.amount - amount) < 0.005 && daysApart(p.paidAt, tx.bookedAt) <= 4).sort((a, b) => daysApart(a.paidAt, tx.bookedAt) - daysApart(b.paidAt, tx.bookedAt));
      const hit = cands[0];
      if (hit) {
        usedExp.add(hit.id);
        if (!hit.accountId) await db.update(expensePayments).set({ accountId }).where(eq(expensePayments.id, hit.id));
        await db.update(bankTransactions).set({ status: "matched", matchedType: "expense_payment", matchedId: hit.id, matchNote: "Αυτόματη ταύτιση με καταχωρημένη πληρωμή προμηθευτή" }).where(eq(bankTransactions.id, tx.id));
        result.linkedExisting += 1;
        continue;
      }
    }
    // 2. Λοιπές κινήσεις / μεταφορές ήδη καταχωρημένες
    const en = entries.find((e) => !usedEntry.has(e.id) && !matchedEntryIds.has(e.id) && Math.abs(e.amount - tx.amount) < 0.005 && daysApart(e.movedAt, tx.bookedAt) <= 4);
    if (en) {
      usedEntry.add(en.id);
      await db.update(bankTransactions).set({ status: "matched", matchedType: "entry", matchedId: en.id, matchNote: en.kind === "transfer" ? "Ταύτιση με μεταφορά μεταξύ λογαριασμών" : "Ταύτιση με καταχωρημένη κίνηση" }).where(eq(bankTransactions.id, tx.id));
      result.transfers += 1;
      continue;
    }
    // 3. Νέα είσπραξη/πληρωμή από ανοιχτό παραστατικό με υψηλή βεβαιότητα
    const cands = await matchCandidates(db, orgId, tx, 3);
    const best = cands[0];
    const confident = best && best.score >= 85 && (!cands[1] || cands[1].score < best.score - 15) && Math.abs(best.remaining - amount) < 0.005;
    if (confident && opts.createPayments !== false) {
      await applyMatch(db, orgId, tx.id, best.type, best.id, amount, "Αυτόματη συμφωνία (ποσό + στοιχεία παραστατικού)");
      result.autoCreated += 1;
      continue;
    }
    if (best) result.suggestions += 1;
    result.remaining += 1;
  }
  return result;
}

/** Χειροκίνητη/αυτόματη σύνδεση γραμμής extrait με παραστατικό: δημιουργεί την είσπραξη ή πληρωμή. */
export async function applyMatch(db: Db, orgId: string, txId: string, type: "invoice" | "expense", targetId: string, amount: number, note = "Χειροκίνητη σύνδεση") {
  const tx = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.id, txId), eq(bankTransactions.orgId, orgId)) });
  if (!tx) throw new Error("Η κίνηση extrait δεν βρέθηκε.");
  if (tx.status === "matched") throw new Error("Η κίνηση έχει ήδη συμφωνηθεί.");
  const amt = round2(Math.min(Math.abs(tx.amount), amount));
  if (type === "invoice") {
    if (tx.amount <= 0) throw new Error("Μια εκροή δεν μπορεί να συνδεθεί με είσπραξη.");
    const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, targetId), eq(invoices.orgId, orgId)) });
    if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
    if (inv.status === "draft" || inv.status === "cancelled") throw new Error("Δεν επιτρέπεται είσπραξη σε πρόχειρο ή ακυρωμένο παραστατικό.");
    if (getDocumentType(inv.invoiceType).kind !== "invoice") throw new Error("Εισπράξεις καταχωρούνται μόνο σε φορολογικά παραστατικά.");
    const remaining = round2(inv.totalGrossValue - inv.paidAmount);
    const pay = round2(Math.min(amt, remaining));
    if (pay <= 0) throw new Error("Το παραστατικό είναι ήδη εξοφλημένο.");
    const id = randomUUID();
    await db.insert(payments).values({ id, orgId, invoiceId: inv.id, amount: pay, paidAt: tx.bookedAt, method: 1, reference: tx.reference || tx.description.slice(0, 80), accountId: tx.accountId, createdAt: now() });
    const paid = round2(inv.paidAmount + pay);
    await db.update(invoices).set({ paidAmount: paid, status: paid >= inv.totalGrossValue - 0.005 ? "paid" : "partially_paid", updatedAt: now() }).where(eq(invoices.id, inv.id));
    await db.update(bankTransactions).set({ status: "matched", matchedType: "payment", matchedId: id, matchNote: note }).where(eq(bankTransactions.id, tx.id));
    return { paymentId: id, amount: pay, target: invoiceDisplayNumber(inv) };
  }
  if (tx.amount >= 0) throw new Error("Μια εισροή δεν μπορεί να συνδεθεί με πληρωμή προμηθευτή.");
  const e = await db.query.expenses.findFirst({ where: and(eq(expenses.id, targetId), eq(expenses.orgId, orgId)) });
  if (!e) throw new Error("Το τιμολόγιο αγοράς δεν βρέθηκε.");
  const remaining = round2(e.grossValue - e.paidAmount);
  const pay = round2(Math.min(amt, remaining));
  if (pay <= 0) throw new Error("Το τιμολόγιο αγοράς είναι ήδη εξοφλημένο.");
  const id = randomUUID();
  await db.insert(expensePayments).values({ id, orgId, expenseId: e.id, amount: pay, paidAt: tx.bookedAt, method: 1, reference: tx.reference || tx.description.slice(0, 80), accountId: tx.accountId, createdAt: now() });
  const paid = round2(e.paidAmount + pay);
  const fullyPaid = paid >= e.grossValue - 0.005;
  await db.update(expenses).set({ paidAmount: paid, status: fullyPaid ? "paid" : e.status, paidAt: fullyPaid ? tx.bookedAt : null }).where(eq(expenses.id, e.id));
  await db.update(bankTransactions).set({ status: "matched", matchedType: "expense_payment", matchedId: id, matchNote: note }).where(eq(bankTransactions.id, tx.id));
  return { paymentId: id, amount: pay, target: e.supplierName };
}

/** Καταχώρηση γραμμής extrait ως λοιπή κίνηση (προμήθεια, τόκοι, ανάληψη κ.λπ.). */
export async function bookTransactionAsEntry(db: Db, orgId: string, txId: string, kind: EntryKind, note?: string) {
  const tx = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.id, txId), eq(bankTransactions.orgId, orgId)) });
  if (!tx) throw new Error("Η κίνηση extrait δεν βρέθηκε.");
  if (tx.status === "matched") throw new Error("Η κίνηση έχει ήδη συμφωνηθεί.");
  const entry: CashEntry = { id: randomUUID(), orgId, accountId: tx.accountId, amount: tx.amount, kind, note: note || tx.description.slice(0, 200), transferId: null, movedAt: tx.bookedAt, createdAt: now() };
  await db.insert(cashEntries).values(entry);
  await db.update(bankTransactions).set({ status: "matched", matchedType: "entry", matchedId: entry.id, matchNote: "Καταχωρήθηκε ως " + ENTRY_KIND_LABELS[kind] }).where(eq(bankTransactions.id, tx.id));
  return entry.id;
}

export async function setTransactionStatus(db: Db, orgId: string, txId: string, status: "unmatched" | "ignored") {
  const tx = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.id, txId), eq(bankTransactions.orgId, orgId)) });
  if (!tx) throw new Error("Η κίνηση extrait δεν βρέθηκε.");
  if (tx.status === "matched" && status === "unmatched") {
    // Αποσύνδεση: η είσπραξη/πληρωμή παραμένει, χάνει μόνο τη σύνδεση με το extrait.
    await db.update(bankTransactions).set({ status, matchedType: null, matchedId: null, matchNote: "" }).where(eq(bankTransactions.id, txId));
    return;
  }
  await db.update(bankTransactions).set({ status }).where(eq(bankTransactions.id, txId));
}

export async function deleteImportBatch(db: Db, orgId: string, batchId: string) {
  const rows = await db.select({ id: bankTransactions.id, status: bankTransactions.status }).from(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.importBatchId, batchId)));
  if (rows.some((r) => r.status === "matched")) throw new Error("Η εισαγωγή περιέχει συμφωνημένες κινήσεις – αποσυνδέστε τις πρώτα.");
  await db.delete(bankTransactions).where(and(eq(bankTransactions.orgId, orgId), eq(bankTransactions.importBatchId, batchId)));
  return rows.length;
}

/* ------------------------------------------------------------------ ταμειακή ροή */

export async function cashflowSummary(db: Db, orgId: string, period: { from: string; to: string }) {
  const [payRows, outs, ents, credRows] = await Promise.all([
    db
      .select({ amount: payments.amount, invoiceType: invoices.invoiceType })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, orgId), isNull(payments.offsetSource), gte(payments.paidAt, period.from), lte(payments.paidAt, period.to))),
    db.select({ total: sql<number>`coalesce(sum(${expensePayments.amount}),0)` }).from(expensePayments).where(and(eq(expensePayments.orgId, orgId), gte(expensePayments.paidAt, period.from), lte(expensePayments.paidAt, period.to))),
    db
      .select({ inflow: sql<number>`coalesce(sum(case when ${cashEntries.amount} > 0 then ${cashEntries.amount} else 0 end),0)`, outflow: sql<number>`coalesce(sum(case when ${cashEntries.amount} < 0 then -${cashEntries.amount} else 0 end),0)` })
      .from(cashEntries)
      .where(and(eq(cashEntries.orgId, orgId), ne(cashEntries.kind, "transfer"), gte(cashEntries.movedAt, period.from), lte(cashEntries.movedAt, period.to))),
    db
      .select({ amount: customerCredits.amount })
      .from(customerCredits)
      .where(and(eq(customerCredits.orgId, orgId), inArray(customerCredits.kind, ["advance", "refund"]), gte(customerCredits.movedAt, period.from), lte(customerCredits.movedAt, period.to))),
  ]);
  const collections = round2(payRows.reduce((s, r) => s + (getDocumentType(r.invoiceType).credit ? 0 : r.amount), 0) + credRows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0));
  const refunds = round2(payRows.reduce((s, r) => s + (getDocumentType(r.invoiceType).credit ? r.amount : 0), 0) + credRows.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0));
  const inflow = round2(collections + Number(ents[0]?.inflow ?? 0));
  const outflow = round2(Number(outs[0]?.total ?? 0) + refunds + Number(ents[0]?.outflow ?? 0));
  return { inflow, outflow, net: round2(inflow - outflow), collections, supplierPayments: round2(Number(outs[0]?.total ?? 0)) };
}

export type { CashAccount, CashEntry, BankTransaction };
