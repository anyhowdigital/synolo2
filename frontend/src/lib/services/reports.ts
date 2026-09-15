import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { customerCredits, customers, expenses, invoiceLines, invoices, payments, type Invoice, type InvoiceLine } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { getVatCategory } from "@/lib/greek/vat";
import { classificationCategoryLabel, classificationTypeLabel } from "@/lib/greek/classifications";
import { buildF2, type F2InputLine, type F2OutputLine } from "@/lib/greek/f2";
import { round2 } from "@/lib/invoice/totals";

export interface ReportPeriod {
  from: string;
  to: string;
}

export function quarterPeriod(date = new Date()): ReportPeriod {
  const q = Math.floor(date.getMonth() / 3);
  const from = new Date(date.getFullYear(), q * 3, 1);
  const to = new Date(date.getFullYear(), q * 3 + 3, 0);
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: f(from), to: f(to) };
}

async function loadPeriod(db: Db, orgId: string, period: ReportPeriod) {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        gte(invoices.issueDate, period.from),
        lte(invoices.issueDate, period.to),
        inArray(invoices.status, ["issued", "partially_paid", "paid"]),
      ),
    );
  const lines = rows.length
    ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, rows.map((r) => r.id)))
    : [];
  return { rows, lines };
}

/** Μόνο φορολογικά παραστατικά εσόδων: εξαιρούνται δελτία, προσφορές και παραστατικά εξόδων (τίτλοι κτήσης κ.λπ.). */
export function isIncomeDocument(inv: Pick<Invoice, "invoiceType">) {
  const dt = getDocumentType(inv.invoiceType);
  return dt.kind === "invoice" && !dt.expenseSide;
}

/** Παραστατικά εξόδων που εκδίδει η ίδια η οντότητα (3.x, 13.x, 17.x) – συμπεριλαμβάνονται στις εισροές. */
export function isSelfIssuedExpense(inv: Pick<Invoice, "invoiceType">) {
  const dt = getDocumentType(inv.invoiceType);
  return dt.kind === "invoice" && dt.expenseSide === true;
}

export async function listIncomeDocuments(db: Db, orgId: string, period: ReportPeriod) {
  return loadIncomePeriod(db, orgId, period);
}

async function loadIncomePeriod(db: Db, orgId: string, period: ReportPeriod) {
  const { rows, lines } = await loadPeriod(db, orgId, period);
  const income = rows.filter(isIncomeDocument);
  const ids = new Set(income.map((r) => r.id));
  return { rows: income, lines: lines.filter((l) => ids.has(l.invoiceId)) };
}

const sign = (inv: Invoice) => (getDocumentType(inv.invoiceType).credit ? -1 : 1);

export async function vatReport(db: Db, orgId: string, period: ReportPeriod) {
  const { rows, lines } = await loadIncomePeriod(db, orgId, period);
  const byInvoice = new Map(rows.map((r) => [r.id, r]));
  const buckets = new Map<number, { rate: number; net: number; vat: number; count: number }>();
  for (const l of lines) {
    const inv = byInvoice.get(l.invoiceId)!;
    const rate = getVatCategory(l.vatCategory).rate;
    const key = l.vatCategory === 8 ? -1 : rate;
    const b = buckets.get(key) ?? { rate: key, net: 0, vat: 0, count: 0 };
    b.net = round2(b.net + sign(inv) * l.netValue);
    b.vat = round2(b.vat + sign(inv) * l.vatAmount);
    b.count += 1;
    buckets.set(key, b);
  }
  const list = [...buckets.values()].sort((a, b) => b.rate - a.rate);
  return {
    rows: list,
    totalNet: round2(list.reduce((s, b) => s + b.net, 0)),
    totalVat: round2(list.reduce((s, b) => s + b.vat, 0)),
    invoiceCount: rows.length,
    withheld: round2(rows.reduce((s, r) => s + sign(r) * r.totalWithheldAmount, 0)),
    stampDuty: round2(rows.reduce((s, r) => s + sign(r) * r.totalStampDutyAmount, 0)),
  };
}

export async function classificationReport(db: Db, orgId: string, period: ReportPeriod) {
  const { rows, lines } = await loadIncomePeriod(db, orgId, period);
  const byInvoice = new Map(rows.map((r) => [r.id, r]));
  const map = new Map<string, { type: string; category: string; typeLabel: string; categoryLabel: string; amount: number }>();
  for (const l of lines as InvoiceLine[]) {
    const inv = byInvoice.get(l.invoiceId)!;
    const key = `${l.classificationType}|${l.classificationCategory}`;
    const e = map.get(key) ?? {
      type: l.classificationType,
      category: l.classificationCategory,
      typeLabel: classificationTypeLabel(l.classificationType),
      categoryLabel: classificationCategoryLabel(l.classificationCategory),
      amount: 0,
    };
    e.amount = round2(e.amount + sign(inv) * l.netValue);
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export async function agingReport(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, ["issued", "partially_paid"])));
  const today = new Date();
  const buckets = [
    { label: "Μη ληξιπρόθεσμα", min: -Infinity, max: 0, amount: 0, count: 0 },
    { label: "1–30 ημέρες", min: 1, max: 30, amount: 0, count: 0 },
    { label: "31–60 ημέρες", min: 31, max: 60, amount: 0, count: 0 },
    { label: "61–90 ημέρες", min: 61, max: 90, amount: 0, count: 0 },
    { label: "> 90 ημέρες", min: 91, max: Infinity, amount: 0, count: 0 },
  ];
  for (const r of rows) {
    const dt = getDocumentType(r.invoiceType);
    // Μόνο απαιτήσεις από παραστατικά εσόδων: εξαιρούνται πιστωτικά, δελτία αποστολής, προσφορές και παραστατικά εξόδων.
    if (dt.credit || dt.kind !== "invoice" || dt.expenseSide) continue;
    const due = r.dueDate ? new Date(r.dueDate) : new Date(r.issueDate);
    const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    const remaining = round2(r.totalGrossValue - r.paidAmount);
    const b = buckets.find((x) => days >= x.min && days <= x.max) ?? buckets[0];
    b.amount = round2(b.amount + remaining);
    b.count += 1;
  }
  return { buckets, total: round2(buckets.reduce((s, b) => s + b.amount, 0)) };
}

/* ---------- Φ2 – Περιοδική δήλωση ΦΠΑ ---------- */

export async function f2Report(db: Db, orgId: string, period: ReportPeriod) {
  const [{ rows, lines }, exp] = await Promise.all([
    loadIncomePeriod(db, orgId, period),
    db.select().from(expenses).where(and(eq(expenses.orgId, orgId), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to))),
  ]);
  const byInvoice = new Map(rows.map((r) => [r.id, r]));
  const outputs: F2OutputLine[] = lines.map((l) => {
    const inv = byInvoice.get(l.invoiceId)!;
    const s = sign(inv);
    return {
      rate: getVatCategory(l.vatCategory).rate,
      vatCategory: l.vatCategory,
      vatExemptionCategory: l.vatExemptionCategory,
      net: s * l.netValue,
      vat: s * l.vatAmount,
      customerCountry: inv.customerCountry,
    };
  });
  const inputs: F2InputLine[] = exp
    .filter((e) => e.status !== "rejected")
    .map((e) => ({
      net: e.netValue,
      vat: e.vatAmount,
      vatDeductible: e.vatDeductible,
      supplierCountry: e.supplierCountry,
      invoiceType: e.invoiceType,
      classificationCategory: e.classificationCategory ?? "",
    }));
  return { ...buildF2(outputs, inputs), invoiceCount: rows.length, expenseCount: inputs.length };
}

/* ---------- Καρτέλα πελάτη ---------- */

export interface StatementRow {
  date: string;
  kind: "invoice" | "credit" | "payment";
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  invoiceId?: string;
}

export async function customerStatement(db: Db, orgId: string, customerId: string, period?: Partial<ReportPeriod>) {
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.orgId, orgId)) });
  if (!customer) return null;
  const invs = (await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId), inArray(invoices.status, ["issued", "partially_paid", "paid"])))).filter(
    (i) => getDocumentType(i.invoiceType).kind === "invoice",
  );
  // Οι συμψηφισμοί (offsetSource) δεν εμφανίζονται: το πιστωτικό/η προκαταβολή έχει ήδη πιστωθεί στην καρτέλα.
  const pays = invs.length ? (await db.select().from(payments).where(and(eq(payments.orgId, orgId), inArray(payments.invoiceId, invs.map((i) => i.id)))).orderBy(asc(payments.paidAt))).filter((p) => !p.offsetSource) : [];
  const credits = await db.select().from(customerCredits).where(and(eq(customerCredits.orgId, orgId), eq(customerCredits.customerId, customerId)));
  const invById = new Map(invs.map((i) => [i.id, i]));

  type Raw = Omit<StatementRow, "balance"> & { order: number };
  const raw: Raw[] = [];
  for (const i of invs) {
    const dt = getDocumentType(i.invoiceType);
    const ref = `${i.seriesCode}-${String(i.number).padStart(4, "0")}`;
    raw.push({
      date: i.issueDate,
      kind: dt.credit ? "credit" : "invoice",
      reference: ref,
      description: dt.name,
      debit: dt.credit ? 0 : i.totalGrossValue,
      credit: dt.credit ? i.totalGrossValue : 0,
      invoiceId: i.id,
      order: 0,
    });
  }
  for (const p of pays) {
    const inv = invById.get(p.invoiceId)!;
    const dt = getDocumentType(inv.invoiceType);
    raw.push({
      date: p.paidAt,
      kind: "payment",
      reference: p.reference || "—",
      description: `${dt.credit ? "Επιστροφή" : "Είσπραξη"} έναντι ${inv.seriesCode}-${String(inv.number).padStart(4, "0")}`,
      debit: dt.credit ? p.amount : 0,
      credit: dt.credit ? 0 : p.amount,
      invoiceId: inv.id,
      order: 1,
    });
  }
  for (const c of credits) {
    if (c.kind === "applied") continue;
    const label = c.kind === "advance" ? "Προκαταβολή" : c.kind === "refund" ? "Επιστροφή προκαταβολής" : c.amount >= 0 ? "Πίστωση" : "Διόρθωση πίστωσης";
    raw.push({
      date: c.movedAt,
      kind: c.amount >= 0 ? "payment" : "invoice",
      reference: c.reference || "—",
      description: c.note ? `${label} · ${c.note}` : label,
      debit: c.amount < 0 ? -c.amount : 0,
      credit: c.amount > 0 ? c.amount : 0,
      invoiceId: undefined,
      order: 1,
    });
  }
  raw.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.reference.localeCompare(b.reference));

  let balance = 0;
  let opening = 0;
  const rows: StatementRow[] = [];
  for (const r of raw) {
    balance = round2(balance + r.debit - r.credit);
    if (period?.from && r.date < period.from) {
      opening = balance;
      continue;
    }
    if (period?.to && r.date > period.to) continue;
    rows.push({ ...r, balance });
  }
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { customer, opening, rows, totalDebit, totalCredit, closing: rows.length ? rows[rows.length - 1].balance : opening };
}

/** Εξαγωγή CSV (UTF-8 BOM, διαχωριστικό ;) για εισαγωγή σε Excel / λογιστικά προγράμματα. */
export async function exportCsv(db: Db, orgId: string, period: ReportPeriod) {
  const { rows, lines } = await loadIncomePeriod(db, orgId, period);
  const byInvoice = new Map(rows.map((r) => [r.id, r]));
  const header = [
    "Ημερομηνία",
    "Σειρά",
    "Αριθμός",
    "Τύπος myDATA",
    "Πελάτης",
    "ΑΦΜ",
    "Γραμμή",
    "Περιγραφή",
    "Ποσότητα",
    "Καθαρή αξία",
    "Κατ. ΦΠΑ",
    "ΦΠΑ",
    "Παρακράτηση",
    "Χαρτόσημο",
    "Χαρακτηρισμός τύπος",
    "Χαρακτηρισμός κατηγορία",
    "MARK",
  ];
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const out = [header.map(esc).join(";")];
  const sorted = [...lines].sort((a, b) => {
    const ia = byInvoice.get(a.invoiceId)!;
    const ib = byInvoice.get(b.invoiceId)!;
    return ia.issueDate.localeCompare(ib.issueDate) || ia.number - ib.number || a.lineNumber - b.lineNumber;
  });
  for (const l of sorted) {
    const inv = byInvoice.get(l.invoiceId)!;
    const s = sign(inv);
    out.push(
      [
        inv.issueDate,
        inv.seriesCode,
        inv.number,
        inv.invoiceType,
        inv.customerName,
        inv.customerAfm,
        l.lineNumber,
        l.description,
        l.quantity,
        num(s * l.netValue),
        getVatCategory(l.vatCategory).label,
        num(s * l.vatAmount),
        num(s * l.withheldAmount),
        num(s * l.stampDutyAmount),
        l.classificationType,
        l.classificationCategory,
        inv.mydataMark ?? "",
      ]
        .map(esc)
        .join(";"),
    );
  }
  return "\uFEFF" + out.join("\r\n");
}
