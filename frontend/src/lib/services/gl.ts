import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { expenses, firmLinks, glAccounts, glEntries, glLines, invoices, memberships, organizations, payments, type Organization } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";
import { assertPeriodOpen } from "@/lib/services/periods";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type Plan = "elp" | "egls";

interface ChartRow {
  code: string;
  name: string;
  type: AccountType;
}

/** Πρότυπο σχέδιο ΕΛΠ (Ν.4308/2014) — βασικοί λογαριασμοί ανά ομάδα. */
const ELP: ChartRow[] = [
  { code: "10", name: "Ενσώματα πάγια", type: "asset" },
  { code: "12", name: "Μηχανολογικός εξοπλισμός", type: "asset" },
  { code: "13", name: "Μεταφορικά μέσα & έπιπλα", type: "asset" },
  { code: "16", name: "Άυλα πάγια & λογισμικό", type: "asset" },
  { code: "20", name: "Εμπορεύματα", type: "asset" },
  { code: "24", name: "Πρώτες ύλες & υλικά", type: "asset" },
  { code: "30", name: "Εμπορικές απαιτήσεις (Πελάτες)", type: "asset" },
  { code: "33", name: "Λοιπές απαιτήσεις", type: "asset" },
  { code: "38.00", name: "Ταμείο", type: "asset" },
  { code: "38.03", name: "Καταθέσεις όψεως", type: "asset" },
  { code: "40", name: "Κεφάλαιο", type: "equity" },
  { code: "41", name: "Αποθεματικά & διαφορές", type: "equity" },
  { code: "42", name: "Αποτελέσματα εις νέο", type: "equity" },
  { code: "45", name: "Μακροπρόθεσμες υποχρεώσεις (δάνεια)", type: "liability" },
  { code: "50", name: "Εμπορικές υποχρεώσεις (Προμηθευτές)", type: "liability" },
  { code: "54.00", name: "ΦΠΑ", type: "liability" },
  { code: "54.03", name: "Φόρος μισθωτών υπηρεσιών (ΦΜΥ)", type: "liability" },
  { code: "54.09", name: "Λοιποί φόροι & παρακρατήσεις", type: "liability" },
  { code: "55", name: "Ασφαλιστικοί οργανισμοί (ΕΦΚΑ)", type: "liability" },
  { code: "53", name: "Λοιπές υποχρεώσεις", type: "liability" },
  { code: "60", name: "Αμοιβές & έξοδα προσωπικού", type: "expense" },
  { code: "61", name: "Αμοιβές & έξοδα τρίτων", type: "expense" },
  { code: "62", name: "Παροχές τρίτων (ΔΕΚΟ, ενοίκια)", type: "expense" },
  { code: "63", name: "Φόροι & τέλη", type: "expense" },
  { code: "64", name: "Διάφορα έξοδα", type: "expense" },
  { code: "65", name: "Τόκοι & συναφή έξοδα", type: "expense" },
  { code: "66", name: "Αποσβέσεις", type: "expense" },
  { code: "70", name: "Πωλήσεις εμπορευμάτων", type: "income" },
  { code: "71", name: "Πωλήσεις προϊόντων", type: "income" },
  { code: "73", name: "Έσοδα από παροχή υπηρεσιών", type: "income" },
  { code: "74", name: "Επιχορηγήσεις & λοιπά έσοδα", type: "income" },
  { code: "76", name: "Έσοδα κεφαλαίων (τόκοι)", type: "income" },
  { code: "80", name: "Αποτελέσματα χρήσης", type: "equity" },
];

/** Πρότυπο σχέδιο ΕΓΛΣ (Π.Δ.1123/1980) — βασικοί πρωτοβάθμιοι. */
const EGLS: ChartRow[] = [
  { code: "10", name: "Εδαφικές εκτάσεις", type: "asset" },
  { code: "11", name: "Κτίρια & τεχνικά έργα", type: "asset" },
  { code: "12", name: "Μηχανήματα & τεχνικές εγκαταστάσεις", type: "asset" },
  { code: "13", name: "Μεταφορικά μέσα", type: "asset" },
  { code: "14", name: "Έπιπλα & λοιπός εξοπλισμός", type: "asset" },
  { code: "16", name: "Ασώματες ακινητοποιήσεις", type: "asset" },
  { code: "20", name: "Εμπορεύματα", type: "asset" },
  { code: "24", name: "Πρώτες & βοηθητικές ύλες", type: "asset" },
  { code: "30", name: "Πελάτες", type: "asset" },
  { code: "33", name: "Χρεώστες διάφοροι", type: "asset" },
  { code: "38.00", name: "Ταμείο", type: "asset" },
  { code: "38.03", name: "Καταθέσεις όψεως", type: "asset" },
  { code: "40", name: "Κεφάλαιο", type: "equity" },
  { code: "41", name: "Αποθεματικά - διαφορές αναπροσαρμογής", type: "equity" },
  { code: "42", name: "Αποτελέσματα εις νέο", type: "equity" },
  { code: "45", name: "Μακροπρόθεσμες υποχρεώσεις", type: "liability" },
  { code: "50", name: "Προμηθευτές", type: "liability" },
  { code: "54.00", name: "Φόρος προστιθέμενης αξίας", type: "liability" },
  { code: "54.03", name: "Φόροι - τέλη αμοιβών προσωπικού (ΦΜΥ)", type: "liability" },
  { code: "54.09", name: "Λοιποί φόροι - τέλη", type: "liability" },
  { code: "55", name: "Ασφαλιστικοί οργανισμοί", type: "liability" },
  { code: "53", name: "Πιστωτές διάφοροι", type: "liability" },
  { code: "60", name: "Αμοιβές & έξοδα προσωπικού", type: "expense" },
  { code: "61", name: "Αμοιβές & έξοδα τρίτων", type: "expense" },
  { code: "62", name: "Παροχές τρίτων", type: "expense" },
  { code: "63", name: "Φόροι - τέλη", type: "expense" },
  { code: "64", name: "Διάφορα έξοδα", type: "expense" },
  { code: "65", name: "Τόκοι & συναφή έξοδα", type: "expense" },
  { code: "66", name: "Αποσβέσεις παγίων", type: "expense" },
  { code: "70", name: "Πωλήσεις εμπορευμάτων", type: "income" },
  { code: "71", name: "Πωλήσεις προϊόντων έτοιμων", type: "income" },
  { code: "73", name: "Πωλήσεις υπηρεσιών", type: "income" },
  { code: "74", name: "Επιχορηγήσεις & διάφορα έσοδα", type: "income" },
  { code: "76", name: "Έσοδα κεφαλαίων", type: "income" },
  { code: "80", name: "Γενική εκμετάλλευση", type: "equity" },
];

export const CHARTS: Record<Plan, ChartRow[]> = { elp: ELP, egls: EGLS };
/** Ποιος μπορεί να διαχειρίζεται τα ευαίσθητα λογιστικά: κατά κανόνα ΜΟΝΟ ο λογιστής. */
export async function canManageBooks(db: Db, orgId: string, userId: string) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return false;
  const link = await db.query.firmLinks.findFirst({ where: and(eq(firmLinks.orgId, orgId), eq(firmLinks.accountantUserId, userId), eq(firmLinks.status, "active")) });
  if (link && (link.accessLevel === "manager" || link.accessLevel === "full")) return true;
  if (!org.booksSelfManage) return false;
  const membership = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)) });
  return membership?.role === "owner" || membership?.role === "admin";
}

/** Ποιος βλέπει τα ευαίσθητα λογιστικά (owner/admin της επιχείρησης ή συνδεδεμένος λογιστής). */
export async function canViewBooks(db: Db, orgId: string, userId: string) {
  if (await canManageBooks(db, orgId, userId)) return true;
  const membership = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)) });
  return membership?.role === "owner" || membership?.role === "admin" || membership?.role === "accountant";
}

export const PLAN_LABELS: Record<Plan, string> = { elp: "ΕΛΠ (Ν.4308/2014)", egls: "ΕΓΛΣ (Π.Δ.1123/1980)" };

const now = () => new Date().toISOString();

/** Δημιουργεί/συμπληρώνει το λογιστικό σχέδιο του πελάτη. */
export async function seedChart(db: Db, orgId: string, plan: Plan) {
  const existing = await db.select({ code: glAccounts.code }).from(glAccounts).where(eq(glAccounts.orgId, orgId));
  const have = new Set(existing.map((e) => e.code));
  const rows = CHARTS[plan].filter((r) => !have.has(r.code));
  for (const r of rows) {
    await db.insert(glAccounts).values({ id: randomUUID(), orgId, code: r.code, name: r.name, type: r.type, parentCode: r.code.includes(".") ? r.code.split(".")[0] : "", plan, active: true, createdAt: now() });
  }
  return rows.length;
}

export async function chart(db: Db, orgId: string) {
  return db.select().from(glAccounts).where(eq(glAccounts.orgId, orgId)).orderBy(asc(glAccounts.code));
}

interface LineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
}

/** Καταχώρηση άρθρου με έλεγχο ισοζυγίου (χρέωση = πίστωση). */
export async function postEntry(
  db: Db,
  orgId: string,
  input: { date: string; description: string; lines: LineInput[]; sourceType?: string; sourceId?: string; createdBy?: string },
) {
  await assertPeriodOpen(db, orgId, input.date);
  const lines = input.lines.filter((l) => l.accountCode && (round2(l.debit ?? 0) !== 0 || round2(l.credit ?? 0) !== 0));
  if (lines.length < 2) throw new Error("Το άρθρο χρειάζεται τουλάχιστον δύο γραμμές.");
  const debit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const credit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (Math.abs(debit - credit) > 0.01) throw new Error(`Το άρθρο δεν ισοσκελίζει: χρέωση ${debit} € / πίστωση ${credit} €.`);

  const accounts = await db.select().from(glAccounts).where(eq(glAccounts.orgId, orgId));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const [{ maxNo }] = await db.select({ maxNo: sql<number>`coalesce(max(${glEntries.entryNo}), 0)` }).from(glEntries).where(eq(glEntries.orgId, orgId));

  const entryId = randomUUID();
  await db.insert(glEntries).values({
    id: entryId,
    orgId,
    entryNo: Number(maxNo) + 1,
    entryDate: input.date,
    description: input.description.slice(0, 300),
    sourceType: input.sourceType ?? "manual",
    sourceId: input.sourceId ?? "",
    status: "posted",
    fiscalYear: Number(input.date.slice(0, 4)),
    createdBy: input.createdBy ?? "",
    createdAt: now(),
  });
  let i = 0;
  for (const l of lines) {
    await db.insert(glLines).values({
      id: randomUUID(),
      orgId,
      entryId,
      accountCode: l.accountCode,
      accountName: byCode.get(l.accountCode)?.name ?? "",
      debit: round2(l.debit ?? 0),
      credit: round2(l.credit ?? 0),
      description: (l.description ?? "").slice(0, 200),
      sortOrder: i++,
    });
  }
  return entryId;
}

export async function deleteEntry(db: Db, orgId: string, entryId: string) {
  const entry = await db.query.glEntries.findFirst({ where: and(eq(glEntries.orgId, orgId), eq(glEntries.id, entryId)), columns: { entryDate: true } });
  if (entry) await assertPeriodOpen(db, orgId, entry.entryDate);
  await db.delete(glLines).where(and(eq(glLines.orgId, orgId), eq(glLines.entryId, entryId)));
  await db.delete(glEntries).where(and(eq(glEntries.orgId, orgId), eq(glEntries.id, entryId)));
}

/** Αντιλογισμός άρθρων που προήλθαν από συγκεκριμένο παραστατικό/δαπάνη (π.χ. σε ακύρωση). Ισόποσο αντίστροφο άρθρο με ημερομηνία ακύρωσης. */
export async function reverseEntriesForSource(db: Db, orgId: string, sourceType: "invoice" | "expense", sourceId: string, date: string, createdBy = "") {
  const src = await db.select().from(glEntries).where(and(eq(glEntries.orgId, orgId), eq(glEntries.sourceType, sourceType), eq(glEntries.sourceId, sourceId)));
  let reversed = 0;
  for (const e of src) {
    if (e.description.startsWith("Αντιλογισμός")) continue;
    const already = src.some((x) => x.description === `Αντιλογισμός #${e.entryNo}`);
    if (already) continue;
    const lines = await db.select().from(glLines).where(and(eq(glLines.orgId, orgId), eq(glLines.entryId, e.id)));
    await postEntry(db, orgId, {
      date,
      description: `Αντιλογισμός #${e.entryNo}`,
      lines: lines.map((l) => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit, description: l.description ?? "" })),
      sourceType,
      sourceId,
      createdBy,
    });
    reversed++;
  }
  return reversed;
}

/** Λογαριασμός εσόδου με βάση τον τύπο παραστατικού/χαρακτηρισμό. */
function incomeAccount(invoiceType: string) {
  return invoiceType.startsWith("2.") ? "73" : "70";
}

/** Λογαριασμός εξόδου με βάση τον χαρακτηρισμό myDATA. */
function expenseAccount(category: string, type: string) {
  if (category === "category2_1") return "20";
  if (category === "category2_2") return "24";
  if (category === "category2_3" || category === "category2_4") return "61";
  if (category === "category2_6") return "60";
  if (category === "category2_7") return "62";
  if (type.startsWith("E3_581")) return "62";
  if (type.startsWith("E3_582") || type.startsWith("E3_583")) return "65";
  if (type.startsWith("E3_584") || type.startsWith("E3_587")) return "66";
  if (type.startsWith("E3_102") || type.startsWith("E3_202")) return "20";
  return "64";
}

/**
 * Δημιουργεί αυτόματα άρθρα για παραστατικά, έξοδα και πληρωμές της περιόδου
 * που δεν έχουν ακόμη λογιστική εγγραφή. Επιστρέφει πόσα άρθρα δημιουργήθηκαν.
 */
export async function generateEntries(db: Db, org: Organization, period: { from: string; to: string }, createdBy = "") {
  const existing = await db.select({ sourceType: glEntries.sourceType, sourceId: glEntries.sourceId }).from(glEntries).where(eq(glEntries.orgId, org.id));
  const have = new Set(existing.map((e) => `${e.sourceType}:${e.sourceId}`));
  let created = 0;

  const inv = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, org.id), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to)));
  for (const i of inv) {
    if (i.status === "draft" || i.status === "cancelled" || have.has(`invoice:${i.id}`)) continue;
    const dt = getDocumentType(i.invoiceType);
    if (dt.kind === "quote" || dt.kind === "delivery" || dt.expenseSide) continue;
    const net = round2(i.totalNetValue);
    const vat = round2(i.totalVatAmount);
    const withheld = round2(i.totalWithheldAmount ?? 0);
    const stamp = round2(i.totalStampDutyAmount ?? 0);
    const receivable = round2(net + vat + stamp - withheld);
    const sign = dt.credit ? -1 : 1;
    const lines: LineInput[] = sign > 0
        ? [
            { accountCode: "30", debit: receivable, description: i.customerName ?? "" },
            ...(withheld ? [{ accountCode: "33", debit: withheld, description: "Παρακρατούμενος φόρος" }] : []),
            { accountCode: incomeAccount(i.invoiceType), credit: net },
            ...(vat ? [{ accountCode: "54.00", credit: vat, description: "ΦΠΑ εκροών" }] : []),
            ...(stamp ? [{ accountCode: "54.09", credit: stamp, description: "Χαρτόσημο" }] : []),
          ]
        : [
            { accountCode: incomeAccount(i.invoiceType), debit: net },
            ...(vat ? [{ accountCode: "54.00", debit: vat, description: "ΦΠΑ εκροών (πιστωτικό)" }] : []),
            ...(stamp ? [{ accountCode: "54.09", debit: stamp, description: "Χαρτόσημο (πιστωτικό)" }] : []),
            { accountCode: "30", credit: receivable, description: i.customerName ?? "" },
            ...(withheld ? [{ accountCode: "33", credit: withheld, description: "Παρακρατούμενος φόρος (πιστωτικό)" }] : []),
          ];
    await postEntry(db, org.id, { date: i.issueDate, description: `${dt.short} ${i.seriesCode}-${i.number} · ${i.customerName}`, lines, sourceType: "invoice", sourceId: i.id, createdBy });
    created += 1;
  }

  const exp = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to)));
  for (const e of exp) {
    if (have.has(`expense:${e.id}`)) continue;
    const net = round2(e.netValue);
    const vat = round2(e.vatAmount);
    const withheld = round2(e.withheldAmount ?? 0);
    const payable = round2(net + vat - withheld);
    await postEntry(db, org.id, {
      date: e.issueDate,
      description: `Δαπάνη ${e.series ? `${e.series}-` : ""}${e.number || "—"} · ${e.supplierName}`,
      lines: [
        { accountCode: expenseAccount(e.classificationCategory ?? "", e.classificationType ?? ""), debit: net, description: e.description || e.supplierName },
        ...(vat ? [{ accountCode: "54.00", debit: vat, description: "ΦΠΑ εισροών" }] : []),
        { accountCode: "50", credit: payable, description: e.supplierName },
        ...(withheld ? [{ accountCode: "54.09", credit: withheld, description: "Παρακράτηση φόρου προμηθευτή" }] : []),
      ],
      sourceType: "expense",
      sourceId: e.id,
      createdBy,
    });
    created += 1;
  }

  const pays = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, org.id), gte(payments.paidAt, period.from), lte(payments.paidAt, period.to)));
  for (const p of pays) {
    if (have.has(`payment:${p.id}`)) continue;
    const cash = p.method === 3 ? "38.00" : "38.03";
    const amount = round2(Math.abs(p.amount));
    const incoming = p.amount >= 0;
    await postEntry(db, org.id, {
      date: p.paidAt,
      description: incoming ? "Είσπραξη πελάτη" : "Πληρωμή",
      lines: incoming
        ? [
            { accountCode: cash, debit: amount },
            { accountCode: "30", credit: amount },
          ]
        : [
            { accountCode: "50", debit: amount },
            { accountCode: cash, credit: amount },
          ],
      sourceType: "payment",
      sourceId: p.id,
      createdBy,
    });
    created += 1;
  }

  return created;
}

export interface TrialRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

/** Ισοζύγιο περιόδου. */
export async function trialBalance(db: Db, orgId: string, period: { from: string; to: string }): Promise<TrialRow[]> {
  const entries = await db
    .select({ id: glEntries.id })
    .from(glEntries)
    .where(and(eq(glEntries.orgId, orgId), gte(glEntries.entryDate, period.from), lte(glEntries.entryDate, period.to)));
  const ids = entries.map((e) => e.id);
  const lines = ids.length ? await db.select().from(glLines).where(inArray(glLines.entryId, ids)) : [];
  const accounts = await chart(db, orgId);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const map = new Map<string, TrialRow>();
  for (const l of lines) {
    const acc = byCode.get(l.accountCode);
    const row = map.get(l.accountCode) ?? { code: l.accountCode, name: acc?.name ?? l.accountName, type: (acc?.type as AccountType) ?? "expense", debit: 0, credit: 0, balance: 0 };
    row.debit = round2(row.debit + l.debit);
    row.credit = round2(row.credit + l.credit);
    row.balance = round2(row.debit - row.credit);
    map.set(l.accountCode, row);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, "el"));
}

/** Καθολικό λογαριασμού. */
export async function accountLedgerGl(db: Db, orgId: string, code: string, period: { from: string; to: string }) {
  const entries = await db
    .select()
    .from(glEntries)
    .where(and(eq(glEntries.orgId, orgId), gte(glEntries.entryDate, period.from), lte(glEntries.entryDate, period.to)))
    .orderBy(asc(glEntries.entryDate), asc(glEntries.entryNo));
  const ids = entries.map((e) => e.id);
  const lines = ids.length ? await db.select().from(glLines).where(and(inArray(glLines.entryId, ids), eq(glLines.accountCode, code))) : [];
  const byEntry = new Map(entries.map((e) => [e.id, e]));
  let running = 0;
  return lines
    .map((l) => ({ line: l, entry: byEntry.get(l.entryId)! }))
    .sort((a, b) => (a.entry.entryDate === b.entry.entryDate ? a.entry.entryNo - b.entry.entryNo : a.entry.entryDate.localeCompare(b.entry.entryDate)))
    .map(({ line, entry }) => {
      running = round2(running + line.debit - line.credit);
      return { date: entry.entryDate, entryNo: entry.entryNo, description: entry.description || line.description, debit: line.debit, credit: line.credit, balance: running };
    });
}

/** Κατάσταση Αποτελεσμάτων (ΕΛΠ Β.2.1, συνοπτική). */
export async function incomeStatement(db: Db, orgId: string, period: { from: string; to: string }) {
  const tb = await trialBalance(db, orgId, period);
  const sum = (prefixes: string[], kind: "income" | "expense") =>
    round2(
      tb
        .filter((r) => prefixes.some((p) => r.code.startsWith(p)))
        .reduce((s, r) => s + (kind === "income" ? r.credit - r.debit : r.debit - r.credit), 0),
    );
  const revenue = sum(["70", "71", "73"], "income");
  const otherIncome = sum(["74", "76"], "income");
  const cogs = sum(["20", "24"], "expense");
  const payroll = sum(["60"], "expense");
  const services = sum(["61", "62"], "expense");
  const taxes = sum(["63"], "expense");
  const other = sum(["64"], "expense");
  const interest = sum(["65"], "expense");
  const depreciation = sum(["66"], "expense");
  const operating = round2(revenue + otherIncome - cogs - payroll - services - taxes - other - depreciation);
  return { revenue, otherIncome, cogs, payroll, services, taxes, other, interest, depreciation, operating, net: round2(operating - interest) };
}

/** Ισολογισμός (ΕΛΠ Β.1.1, συνοπτικός). */
export async function balanceSheet(db: Db, orgId: string, period: { from: string; to: string }) {
  const tb = await trialBalance(db, orgId, { from: "0000-01-01", to: period.to });
  const pick = (prefixes: string[]) => round2(tb.filter((r) => prefixes.some((p) => r.code.startsWith(p))).reduce((s, r) => s + r.balance, 0));
  const fixed = pick(["10", "11", "12", "13", "14", "16"]);
  const inventory = pick(["20", "24"]);
  const receivables = pick(["30", "33"]);
  const cash = pick(["38"]);
  const assets = round2(fixed + inventory + receivables + cash);
  const equityAccounts = round2(-pick(["40", "41", "42"]));
  const longTerm = round2(-pick(["45"]));
  const suppliers = round2(-pick(["50"]));
  const taxesDue = round2(-pick(["54"]));
  const social = round2(-pick(["55"]));
  const otherLiab = round2(-pick(["53"]));
  const result = (await incomeStatement(db, orgId, { from: `${period.to.slice(0, 4)}-01-01`, to: period.to })).net;
  const equity = round2(equityAccounts + result);
  const liabilities = round2(longTerm + suppliers + taxesDue + social + otherLiab);
  return {
    assets: { fixed, inventory, receivables, cash, total: assets },
    equity: { capital: equityAccounts, result, total: equity },
    liabilities: { longTerm, suppliers, taxesDue, social, other: otherLiab, total: liabilities },
    difference: round2(assets - equity - liabilities),
  };
}

/** Κλείσιμο χρήσης: μεταφορά αποτελέσματος στα «Αποτελέσματα εις νέο». */
export async function closeFiscalYear(db: Db, orgId: string, year: number, createdBy = "") {
  const period = { from: `${year}-01-01`, to: `${year}-12-31` };
  const already = await db
    .select()
    .from(glEntries)
    .where(and(eq(glEntries.orgId, orgId), eq(glEntries.sourceType, "closing"), eq(glEntries.sourceId, String(year))));
  if (already.length) throw new Error(`Η χρήση ${year} έχει ήδη κλείσει.`);
  const is = await incomeStatement(db, orgId, period);
  const profit = is.net;
  const tb = await trialBalance(db, orgId, period);
  const lines: LineInput[] = [];
  for (const r of tb) {
    if (r.type === "income" && Math.abs(r.credit - r.debit) > 0.005) lines.push({ accountCode: r.code, debit: round2(r.credit - r.debit), description: `Κλείσιμο ${year}` });
    if (r.type === "expense" && Math.abs(r.debit - r.credit) > 0.005) lines.push({ accountCode: r.code, credit: round2(r.debit - r.credit), description: `Κλείσιμο ${year}` });
  }
  if (!lines.length) throw new Error("Δεν υπάρχουν λογαριασμοί εσόδων/εξόδων προς κλείσιμο.");
  if (profit > 0) lines.push({ accountCode: "42", credit: round2(profit), description: "Μεταφορά κερδών εις νέο" });
  else if (profit < 0) lines.push({ accountCode: "42", debit: round2(-profit), description: "Μεταφορά ζημιών εις νέο" });
  await postEntry(db, orgId, { date: `${year}-12-31`, description: `Κλείσιμο χρήσης ${year}`, lines, sourceType: "closing", sourceId: String(year), createdBy });
  return profit;
}

export async function listEntries(db: Db, orgId: string, period: { from: string; to: string }, limit = 200) {
  const entries = await db
    .select()
    .from(glEntries)
    .where(and(eq(glEntries.orgId, orgId), gte(glEntries.entryDate, period.from), lte(glEntries.entryDate, period.to)))
    .orderBy(desc(glEntries.entryDate), desc(glEntries.entryNo))
    .limit(limit);
  const ids = entries.map((e) => e.id);
  const lines = ids.length ? await db.select().from(glLines).where(inArray(glLines.entryId, ids)).orderBy(asc(glLines.sortOrder)) : [];
  return entries.map((e) => ({ entry: e, lines: lines.filter((l) => l.entryId === e.id) }));
}
