import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { bankTransactions, customerCredits, customers, invoices, payments, type CustomerCredit, type Invoice } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import { invoiceDisplayNumber } from "./invoice-display";
import { defaultAccountFor } from "./banking";
import { audit } from "./audit";
import { resolveActor } from "./actor";
import { dispatchWebhooks } from "./webhooks";

export type CreditKind = "advance" | "manual" | "applied" | "refund";
export const CREDIT_KIND_LABELS: Record<CreditKind, string> = {
  advance: "Προκαταβολή",
  manual: "Πίστωση / διόρθωση",
  applied: "Συμψηφισμός",
  refund: "Επιστροφή χρημάτων",
};

const now = () => new Date().toISOString();

/** Ανοιχτό πιστωτικό τιμολόγιο: εκδομένο, χωρίς επιστροφή/συμψηφισμό ολόκληρου του ποσού. */
export interface OpenCreditNote {
  id: string;
  label: string;
  issueDate: string;
  total: number;
  remaining: number;
}

export interface CreditSummary {
  ledgerBalance: number;
  creditNotes: OpenCreditNote[];
  creditNotesTotal: number;
  available: number;
}

const isCreditNote = (inv: Pick<Invoice, "invoiceType">) => {
  const dt = getDocumentType(inv.invoiceType);
  return dt.kind === "invoice" && dt.credit === true;
};
const isPayableInvoice = (inv: Pick<Invoice, "invoiceType">) => {
  const dt = getDocumentType(inv.invoiceType);
  return dt.kind === "invoice" && !dt.credit && !dt.expenseSide;
};

export async function listCredits(db: Db, orgId: string, customerId: string) {
  return db
    .select()
    .from(customerCredits)
    .where(and(eq(customerCredits.orgId, orgId), eq(customerCredits.customerId, customerId)))
    .orderBy(desc(customerCredits.movedAt), desc(customerCredits.createdAt));
}

export async function openCreditNotes(db: Db, orgId: string, customerId: string): Promise<OpenCreditNote[]> {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId), inArray(invoices.status, ["issued", "partially_paid"])))
    .orderBy(invoices.issueDate);
  return rows
    .filter(isCreditNote)
    .map((i) => ({ id: i.id, label: invoiceDisplayNumber(i), issueDate: i.issueDate, total: i.totalGrossValue, remaining: round2(i.totalGrossValue - i.paidAmount) }))
    .filter((c) => c.remaining > 0.005);
}

export async function creditSummary(db: Db, orgId: string, customerId: string): Promise<CreditSummary> {
  const [[row], creditNotes] = await Promise.all([
    db
      .select({ total: sql<number>`coalesce(sum(${customerCredits.amount}),0)` })
      .from(customerCredits)
      .where(and(eq(customerCredits.orgId, orgId), eq(customerCredits.customerId, customerId))),
    openCreditNotes(db, orgId, customerId),
  ]);
  const ledgerBalance = round2(Number(row?.total ?? 0));
  const creditNotesTotal = round2(creditNotes.reduce((s, c) => s + c.remaining, 0));
  return { ledgerBalance, creditNotes, creditNotesTotal, available: round2(ledgerBalance + creditNotesTotal) };
}

/** Διαθέσιμο πιστωτικό ανά πελάτη (για λίστες). */
export async function creditBalancesByCustomer(db: Db, orgId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ledger = await db
    .select({ customerId: customerCredits.customerId, total: sql<number>`sum(${customerCredits.amount})` })
    .from(customerCredits)
    .where(eq(customerCredits.orgId, orgId))
    .groupBy(customerCredits.customerId);
  for (const r of ledger) map.set(r.customerId, round2(Number(r.total)));
  const notes = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, ["issued", "partially_paid"]), sql`${invoices.customerId} is not null`));
  for (const i of notes) {
    if (!isCreditNote(i) || !i.customerId) continue;
    const remaining = round2(i.totalGrossValue - i.paidAmount);
    if (remaining > 0.005) map.set(i.customerId, round2((map.get(i.customerId) ?? 0) + remaining));
  }
  return map;
}

/** Ανοιχτά παραστατικά πελάτη που μπορούν να συμψηφιστούν. */
export async function offsetTargets(db: Db, orgId: string, customerId: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId), inArray(invoices.status, ["issued", "partially_paid"])))
    .orderBy(invoices.issueDate);
  return rows
    .filter(isPayableInvoice)
    .map((i) => ({ id: i.id, label: invoiceDisplayNumber(i), issueDate: i.issueDate, dueDate: i.dueDate, total: i.totalGrossValue, remaining: round2(i.totalGrossValue - i.paidAmount), currency: i.currency }))
    .filter((t) => t.remaining > 0.005);
}

async function requireCustomer(db: Db, orgId: string, customerId: string) {
  const c = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.orgId, orgId)) });
  if (!c) throw new Error("Ο πελάτης δεν βρέθηκε.");
  return c;
}

export interface AdvanceInput {
  customerId: string;
  amount: number;
  movedAt: string;
  method: number;
  accountId?: string | null;
  reference?: string;
  note?: string;
}

/** Προκαταβολή: χρήματα που εισπράχθηκαν χωρίς παραστατικό – πιστώνονται στον πελάτη και μπαίνουν στο ταμείο/τράπεζα. */
export async function addAdvance(db: Db, orgId: string, input: AdvanceInput) {
  const customer = await requireCustomer(db, orgId, input.customerId);
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Το ποσό πρέπει να είναι θετικό.");
  const accountId = input.accountId ?? (await defaultAccountFor(db, orgId, input.method));
  const entry: CustomerCredit = {
    id: randomUUID(),
    orgId,
    customerId: customer.id,
    kind: "advance",
    amount,
    accountId,
    method: input.method,
    reference: (input.reference ?? "").trim(),
    note: (input.note ?? "").trim(),
    refType: null,
    refId: null,
    movedAt: input.movedAt,
    actor: (await resolveActor(db))?.name ?? "",
    createdAt: now(),
  };
  await db.insert(customerCredits).values(entry);
  await audit(db, orgId, "customer", customer.id, "advance_received", `${amount.toFixed(2)} €`, await resolveActor(db));
  return entry;
}

/** Χειροκίνητη πίστωση (+) ή διόρθωση (−) πιστωτικού υπολοίπου, χωρίς κίνηση χρημάτων. */
export async function addManualCredit(db: Db, orgId: string, input: { customerId: string; amount: number; movedAt: string; note?: string }) {
  const customer = await requireCustomer(db, orgId, input.customerId);
  const amount = round2(input.amount);
  if (!amount) throw new Error("Το ποσό δεν μπορεί να είναι 0.");
  if (amount < 0) {
    const s = await creditSummary(db, orgId, customer.id);
    if (s.ledgerBalance + amount < -0.005) throw new Error(`Η διόρθωση υπερβαίνει το πιστωτικό υπόλοιπο (${s.ledgerBalance.toFixed(2)} €).`);
  }
  const entry: CustomerCredit = {
    id: randomUUID(),
    orgId,
    customerId: customer.id,
    kind: "manual",
    amount,
    accountId: null,
    method: null,
    reference: "",
    note: (input.note ?? "").trim(),
    refType: null,
    refId: null,
    movedAt: input.movedAt,
    actor: (await resolveActor(db))?.name ?? "",
    createdAt: now(),
  };
  await db.insert(customerCredits).values(entry);
  await audit(db, orgId, "customer", customer.id, "credit_adjusted", `${amount.toFixed(2)} €`, await resolveActor(db));
  return entry;
}

/** Επιστροφή χρημάτων από το πιστωτικό υπόλοιπο (προκαταβολές). Για πιστωτικά τιμολόγια η επιστροφή καταχωρείται ως είσπραξη στο ίδιο το πιστωτικό. */
export async function refundCredit(db: Db, orgId: string, input: AdvanceInput) {
  const customer = await requireCustomer(db, orgId, input.customerId);
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Το ποσό πρέπει να είναι θετικό.");
  const s = await creditSummary(db, orgId, customer.id);
  if (amount > s.ledgerBalance + 0.005) throw new Error(`Το ποσό υπερβαίνει το επιστρεπτέο πιστωτικό υπόλοιπο (${s.ledgerBalance.toFixed(2)} €). Τα πιστωτικά τιμολόγια επιστρέφονται από τη σελίδα τους.`);
  const accountId = input.accountId ?? (await defaultAccountFor(db, orgId, input.method));
  const entry: CustomerCredit = {
    id: randomUUID(),
    orgId,
    customerId: customer.id,
    kind: "refund",
    amount: -amount,
    accountId,
    method: input.method,
    reference: (input.reference ?? "").trim(),
    note: (input.note ?? "").trim(),
    refType: null,
    refId: null,
    movedAt: input.movedAt,
    actor: (await resolveActor(db))?.name ?? "",
    createdAt: now(),
  };
  await db.insert(customerCredits).values(entry);
  await audit(db, orgId, "customer", customer.id, "credit_refunded", `${amount.toFixed(2)} €`, await resolveActor(db));
  return entry;
}

export interface ApplyCreditInput {
  customerId: string;
  invoiceId: string;
  amount: number;
  movedAt: string;
  /** Συγκεκριμένο πιστωτικό τιμολόγιο ως πηγή (αλλιώς FIFO: πιστωτικά τιμολόγια → προκαταβολές). */
  sourceCreditNoteId?: string | null;
  note?: string;
}

export interface ApplyCreditResult {
  applied: number;
  parts: { source: "credit_note" | "advance"; label: string; amount: number }[];
  invoiceStatus: string;
}

/**
 * Συμψηφισμός: εξοφλεί (μερικώς ή ολικώς) ένα ανοιχτό παραστατικό από το διαθέσιμο πιστωτικό του πελάτη.
 * Δημιουργεί είσπραξη στο παραστατικό-στόχο με offsetSource (δεν μετρά ως εισροή στο ταμείο), καταναλώνει τα
 * πιστωτικά τιμολόγια (είσπραξη-συμψηφισμός στο ίδιο το πιστωτικό) και έπειτα το ledger προκαταβολών.
 */
export async function applyCredit(db: Db, orgId: string, input: ApplyCreditInput): Promise<ApplyCreditResult> {
  const customer = await requireCustomer(db, orgId, input.customerId);
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, orgId)) });
  if (!inv || inv.customerId !== customer.id) throw new Error("Το παραστατικό δεν βρέθηκε για αυτόν τον πελάτη.");
  if (!isPayableInvoice(inv)) throw new Error("Συμψηφισμός επιτρέπεται μόνο σε φορολογικά παραστατικά εσόδων.");
  if (inv.status !== "issued" && inv.status !== "partially_paid") throw new Error("Το παραστατικό δεν είναι ανοιχτό προς εξόφληση.");
  const remaining = round2(inv.totalGrossValue - inv.paidAmount);
  const requested = round2(input.amount);
  if (!(requested > 0)) throw new Error("Το ποσό πρέπει να είναι θετικό.");
  if (requested > remaining + 0.005) throw new Error(`Το ποσό υπερβαίνει το υπόλοιπο του παραστατικού (${remaining.toFixed(2)} €).`);
  const summary = await creditSummary(db, orgId, customer.id);
  if (requested > summary.available + 0.005) throw new Error(`Το διαθέσιμο πιστωτικό είναι ${summary.available.toFixed(2)} €.`);

  let left = requested;
  const parts: ApplyCreditResult["parts"] = [];
  const actor = (await resolveActor(db))?.name ?? "";
  const ts = now();
  const sources = input.sourceCreditNoteId ? summary.creditNotes.filter((c) => c.id === input.sourceCreditNoteId) : summary.creditNotes;
  if (input.sourceCreditNoteId && sources.length === 0) throw new Error("Το πιστωτικό τιμολόγιο δεν έχει διαθέσιμο υπόλοιπο.");

  for (const cn of sources) {
    if (left <= 0.005) break;
    const take = round2(Math.min(left, cn.remaining));
    const targetPaymentId = randomUUID();
    await db.insert(payments).values({
      id: targetPaymentId,
      orgId,
      invoiceId: inv.id,
      amount: take,
      paidAt: input.movedAt,
      method: inv.paymentMethod === 5 ? 1 : inv.paymentMethod,
      reference: `Συμψηφισμός με ${cn.label}`,
      accountId: null,
      offsetSource: "credit_note",
      offsetRefId: cn.id,
      createdAt: ts,
    });
    await db.insert(payments).values({
      id: randomUUID(),
      orgId,
      invoiceId: cn.id,
      amount: take,
      paidAt: input.movedAt,
      method: inv.paymentMethod === 5 ? 1 : inv.paymentMethod,
      reference: `Συμψηφισμός με ${invoiceDisplayNumber(inv)}`,
      accountId: null,
      offsetSource: "applied_to",
      offsetRefId: inv.id,
      createdAt: ts,
    });
    const cnPaid = round2(cn.total - cn.remaining + take);
    await db.update(invoices).set({ paidAmount: cnPaid, status: cnPaid >= cn.total - 0.005 ? "paid" : "partially_paid", updatedAt: ts }).where(eq(invoices.id, cn.id));
    parts.push({ source: "credit_note", label: cn.label, amount: take });
    left = round2(left - take);
  }

  if (left > 0.005 && !input.sourceCreditNoteId) {
    const take = round2(Math.min(left, summary.ledgerBalance));
    if (take > 0.005) {
      const targetPaymentId = randomUUID();
      const entryId = randomUUID();
      await db.insert(payments).values({
        id: targetPaymentId,
        orgId,
        invoiceId: inv.id,
        amount: take,
        paidAt: input.movedAt,
        method: inv.paymentMethod === 5 ? 1 : inv.paymentMethod,
        reference: "Συμψηφισμός με προκαταβολή",
        accountId: null,
        offsetSource: "advance",
        offsetRefId: entryId,
        createdAt: ts,
      });
      await db.insert(customerCredits).values({
        id: entryId,
        orgId,
        customerId: customer.id,
        kind: "applied",
        amount: -take,
        accountId: null,
        method: null,
        reference: invoiceDisplayNumber(inv),
        note: (input.note ?? "").trim() || `Συμψηφισμός με ${invoiceDisplayNumber(inv)}`,
        refType: "payment",
        refId: targetPaymentId,
        movedAt: input.movedAt,
        actor,
        createdAt: ts,
      });
      parts.push({ source: "advance", label: "Προκαταβολές / πιστωτικό υπόλοιπο", amount: take });
      left = round2(left - take);
    }
  }

  const applied = round2(requested - left);
  if (applied <= 0.005) throw new Error("Δεν υπήρχε διαθέσιμο πιστωτικό για συμψηφισμό.");
  const paid = round2(inv.paidAmount + applied);
  const status = paid >= inv.totalGrossValue - 0.005 ? "paid" : "partially_paid";
  await db.update(invoices).set({ paidAmount: paid, status, updatedAt: ts }).where(eq(invoices.id, inv.id));
  await audit(db, orgId, "invoice", inv.id, "credit_applied", parts.map((p) => `${p.label}: ${p.amount.toFixed(2)} €`).join(" · "), await resolveActor(db));
  await dispatchWebhooks(db, orgId, "payment.recorded", { invoiceId: inv.id, amount: applied, paidAt: input.movedAt, status, offset: true });
  return { applied, parts, invoiceStatus: status };
}

/** Διαγραφή προκαταβολής / πίστωσης / επιστροφής (όχι συμψηφισμών – αυτοί αναιρούνται μόνο μαζί με την είσπραξη). */
export async function deleteCreditEntry(db: Db, orgId: string, id: string) {
  const en = await db.query.customerCredits.findFirst({ where: and(eq(customerCredits.id, id), eq(customerCredits.orgId, orgId)) });
  if (!en) throw new Error("Η κίνηση δεν βρέθηκε.");
  if (en.kind === "applied") throw new Error("Ο συμψηφισμός δεν διαγράφεται απευθείας – αναιρέστε την είσπραξη από το παραστατικό.");
  const s = await creditSummary(db, orgId, en.customerId);
  if (s.ledgerBalance - en.amount < -0.005) throw new Error("Η διαγραφή θα άφηνε αρνητικό πιστωτικό υπόλοιπο (έχει ήδη συμψηφιστεί).");
  await db.update(bankTransactions).set({ status: "unmatched", matchedType: null, matchedId: null, matchNote: "" }).where(and(eq(bankTransactions.matchedType, "credit"), eq(bankTransactions.matchedId, id)));
  await db.delete(customerCredits).where(eq(customerCredits.id, id));
  await audit(db, orgId, "customer", en.customerId, "deleted", `${CREDIT_KIND_LABELS[en.kind as CreditKind]} ${Math.abs(en.amount).toFixed(2)} €`, await resolveActor(db));
  return en;
}

/** Υπόλοιπο πελάτη με σωστό πρόσημο: μόνο φορολογικά παραστατικά, τα πιστωτικά αφαιρούν. */
export function customerOutstanding(invs: Pick<Invoice, "invoiceType" | "status" | "totalGrossValue" | "paidAmount">[]) {
  return round2(
    invs.reduce((s, i) => {
      if (i.status === "draft" || i.status === "cancelled") return s;
      const dt = getDocumentType(i.invoiceType);
      if (dt.kind !== "invoice" || dt.expenseSide) return s;
      return s + (dt.credit ? -1 : 1) * (i.totalGrossValue - i.paidAmount);
    }, 0),
  );
}

export type { CustomerCredit };
