import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { assertPeriodOpen } from "@/lib/services/periods";
import type { Db } from "@/db";
import { expenseLines, expenses, suppliers, type ExpenseLine, type Organization } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { getVatCategory } from "@/lib/greek/vat";
import { requestDocs } from "@/lib/mydata/client";
import { orgMyDataCredentials } from "./org";
import { dueDateFromTerms, recordExpensePayment, expenseRemaining } from "./suppliers";
import { recordMovement, removeMovementsForRef } from "./inventory";

export { EXPENSE_CLASSIFICATION_CATEGORIES, EXPENSE_CLASSIFICATION_TYPES } from "./expense-labels";

export interface ExpenseInput {
  supplierName: string;
  supplierAfm: string;
  supplierCountry: string;
  invoiceType: string;
  series: string;
  number: string;
  issueDate: string;
  description: string;
  netValue: number;
  vatCategory: number;
  vatAmount: number;
  withheldAmount: number;
  classificationCategory: string;
  classificationType: string;
  vatDeductible: boolean;
  mark?: string | null;
  tags?: string;
  customFieldsJson?: string;
  supplierId?: string | null;
  dueDate?: string | null;
  /** Αποθήκη παραλαβής για γραμμές με είδος (κενό = προεπιλεγμένη). */
  warehouseId?: string | null;
  /** Αναλυτικές γραμμές – όταν δίνονται, τα σύνολα (καθαρό/ΦΠΑ) υπολογίζονται από αυτές. */
  lines?: ExpenseLineInput[];
}

export interface ExpenseLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  vatCategory: number;
  productId?: string | null;
}

/** Υπολογισμός γραμμής αγοράς (καθαρό/ΦΠΑ) από ποσότητα, τιμή και κατηγορία ΦΠΑ. */
export function computeExpenseLine(l: ExpenseLineInput) {
  const net = round2(l.quantity * l.unitPrice);
  const vat = round2(net * (getVatCategory(l.vatCategory).rate / 100));
  return { net, vat };
}

export async function listExpenseLines(db: Db, expenseId: string): Promise<ExpenseLine[]> {
  return db.select().from(expenseLines).where(eq(expenseLines.expenseId, expenseId)).orderBy(asc(expenseLines.lineNumber));
}

export async function listExpensesWithLines(db: Db, orgId: string, opts: { from?: string; to?: string; status?: string; supplierId?: string } = {}) {
  const rows = await listExpenses(db, orgId, opts);
  if (rows.length === 0) return [] as (typeof rows[number] & { lines: ExpenseLine[] })[];
  const lines = await db.select().from(expenseLines).where(inArray(expenseLines.expenseId, rows.map((r) => r.id))).orderBy(asc(expenseLines.lineNumber));
  const byExpense = new Map<string, ExpenseLine[]>();
  for (const l of lines) byExpense.set(l.expenseId, [...(byExpense.get(l.expenseId) ?? []), l]);
  return rows.map((r) => ({ ...r, lines: byExpense.get(r.id) ?? [] }));
}

export async function listExpenses(db: Db, orgId: string, opts: { from?: string; to?: string; status?: string; supplierId?: string } = {}) {
  const conds = [eq(expenses.orgId, orgId)];
  if (opts.from) conds.push(gte(expenses.issueDate, opts.from));
  if (opts.to) conds.push(lte(expenses.issueDate, opts.to));
  if (opts.supplierId) conds.push(eq(expenses.supplierId, opts.supplierId));
  if (opts.status === "open") conds.push(sql`${expenses.status} not in ('paid', 'rejected') and ${expenses.grossValue} - ${expenses.paidAmount} > 0.005`);
  else if (opts.status === "overdue")
    conds.push(sql`${expenses.status} not in ('paid', 'rejected') and ${expenses.grossValue} - ${expenses.paidAmount} > 0.005 and coalesce(${expenses.dueDate}, ${expenses.issueDate}) < ${new Date().toISOString().slice(0, 10)}`);
  else if (opts.status) conds.push(eq(expenses.status, opts.status));
  return db.select().from(expenses).where(and(...conds)).orderBy(desc(expenses.issueDate), desc(expenses.createdAt));
}

export async function saveExpense(db: Db, orgId: string, input: ExpenseInput, id?: string) {
  await assertPeriodOpen(db, orgId, input.issueDate);
  const computedLines = (input.lines ?? []).filter((l) => l.description.trim()).map((l, i) => ({ ...l, lineNumber: i + 1, ...computeExpenseLine(l) }));
  if (computedLines.length > 0) {
    input.netValue = round2(computedLines.reduce((s, l) => s + l.net, 0));
    input.vatAmount = round2(computedLines.reduce((s, l) => s + l.vat, 0));
    // Κατηγορία ΦΠΑ του παραστατικού = της γραμμής με τη μεγαλύτερη καθαρή αξία.
    input.vatCategory = [...computedLines].sort((a, b) => b.net - a.net)[0].vatCategory;
  }
  // Αυτόματη σύνδεση με προμηθευτή μέσω ΑΦΜ όταν δεν έχει επιλεγεί ρητά.
  let supplierId = input.supplierId ?? null;
  if (!supplierId && input.supplierAfm) {
    const match = await db.query.suppliers.findFirst({ where: and(eq(suppliers.orgId, orgId), eq(suppliers.afm, input.supplierAfm), eq(suppliers.country, input.supplierCountry || "GR")) });
    supplierId = match?.id ?? null;
  }
  let dueDate = input.dueDate ?? null;
  if (!dueDate && supplierId) {
    const sup = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId), columns: { paymentTermsDays: true } });
    dueDate = dueDateFromTerms(input.issueDate, sup?.paymentTermsDays);
  }
  const gross = round2(input.netValue + input.vatAmount - input.withheldAmount);
  const record = {
    supplierId,
    dueDate,
    orgId,
    supplierName: input.supplierName,
    supplierAfm: input.supplierAfm,
    supplierCountry: input.supplierCountry || "GR",
    invoiceType: input.invoiceType,
    series: input.series,
    number: input.number,
    issueDate: input.issueDate,
    description: input.description,
    netValue: round2(input.netValue),
    vatAmount: round2(input.vatAmount),
    vatCategory: input.vatCategory,
    withheldAmount: round2(input.withheldAmount),
    grossValue: gross,
    classificationCategory: input.classificationCategory,
    classificationType: input.classificationType,
    vatDeductible: input.vatDeductible,
    mark: input.mark ?? null,
    tags: input.tags ?? "[]",
    customFieldsJson: input.customFieldsJson ?? "{}",
  };
  let expenseId = id;
  if (id) {
    const existing = await db.query.expenses.findFirst({ where: and(eq(expenses.id, id), eq(expenses.orgId, orgId)), columns: { paidAmount: true, status: true } });
    if (!existing) throw new Error("Το παραστατικό δεν βρέθηκε.");
    // Διατήρηση κατάστασης εξόφλησης: αν είναι πλήρως εξοφλημένο παραμένει «paid», αλλιώς «classified».
    const fullyPaid = existing.paidAmount >= gross - 0.005 && existing.paidAmount > 0;
    await db
      .update(expenses)
      .set({ ...record, status: fullyPaid ? "paid" : input.classificationCategory ? "classified" : "pending" })
      .where(and(eq(expenses.id, id), eq(expenses.orgId, orgId)));
  } else {
    expenseId = randomUUID();
    await db.insert(expenses).values({ id: expenseId, ...record, status: input.classificationCategory ? "classified" : "pending", source: "manual", createdAt: new Date().toISOString() });
  }
  if (input.lines !== undefined) {
    await db.delete(expenseLines).where(eq(expenseLines.expenseId, expenseId!));
    // Αποθήκη: οι γραμμές με είδος παραλαμβάνονται ως αγορές (και τροφοδοτούν το μέσο κόστος).
    await removeMovementsForRef(db, orgId, "expense", expenseId!);
    for (const l of computedLines) {
      if (!l.productId || !(l.quantity > 0)) continue;
      await recordMovement(db, orgId, {
        productId: l.productId,
        warehouseId: input.warehouseId ?? null,
        quantity: l.quantity,
        unitCost: l.unitPrice,
        kind: "purchase",
        refType: "expense",
        refId: expenseId!,
        note: `${input.supplierName} ${input.series ? `${input.series}-` : ""}${input.number}`.trim(),
        movedAt: input.issueDate,
      });
    }
    if (computedLines.length > 0) {
      await db.insert(expenseLines).values(
        computedLines.map((l) => ({
          id: randomUUID(),
          expenseId: expenseId!,
          lineNumber: l.lineNumber,
          description: l.description.trim(),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatCategory: l.vatCategory,
          netValue: l.net,
          vatAmount: l.vat,
          productId: l.productId ?? null,
        })),
      );
    }
  }
  return expenseId!;
}

/** Ολική εξόφληση με μία κίνηση: καταχωρεί πληρωμή για το ανοιχτό υπόλοιπο. */
export async function markExpensePaid(db: Db, orgId: string, id: string, paidAt: string, method = 1) {
  const e = await db.query.expenses.findFirst({ where: and(eq(expenses.id, id), eq(expenses.orgId, orgId)) });
  if (!e) throw new Error("Το παραστατικό δεν βρέθηκε.");
  const remaining = expenseRemaining(e);
  if (remaining <= 0) {
    await db.update(expenses).set({ status: "paid", paidAt }).where(eq(expenses.id, id));
    return;
  }
  await recordExpensePayment(db, orgId, id, { amount: remaining, paidAt, method });
}

export async function deleteExpense(db: Db, orgId: string, id: string) {
  const ex = await db.query.expenses.findFirst({ where: and(eq(expenses.id, id), eq(expenses.orgId, orgId)), columns: { issueDate: true, mark: true } });
  if (!ex) return;
  await assertPeriodOpen(db, orgId, ex.issueDate);
  if (ex.mark) throw new Error("Η δαπάνη έχει ΜΑΡΚ myDATA και δεν διαγράφεται· αποχαρακτηρίστε/απορρίψτε την μέσω myDATA.");
  await removeMovementsForRef(db, orgId, "expense", id);
  await db.delete(expenseLines).where(eq(expenseLines.expenseId, id));
  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.orgId, orgId)));
}

/** Εκτίμηση κατηγορίας ΦΠΑ από τα σύνολα (τα RequestDocs δεν δίνουν πάντα αναλυτικές γραμμές). */
function inferVatCategory(net: number, vat: number) {
  if (net <= 0 || vat <= 0) return 7;
  const rate = Math.round((vat / net) * 100);
  if (rate === 24) return 1;
  if (rate === 13) return 2;
  if (rate === 6) return 3;
  if (rate === 17) return 4;
  if (rate === 9) return 5;
  if (rate === 4) return 6;
  return 7;
}

/** Συγχρονισμός παραστατικών προμηθευτών από το myDATA (RequestDocs). Παραλείπει ήδη εισαγμένα MARK. */
export async function syncExpensesFromMyData(db: Db, org: Organization, period: { from: string; to: string }) {
  const result = await requestDocs(orgMyDataCredentials(org), { dateFrom: period.from, dateTo: period.to });
  if (!result.ok) throw new Error(result.error ?? "Αποτυχία επικοινωνίας με το myDATA.");
  if (result.docs.length === 0) return { imported: 0, skipped: 0 };
  const existing = await db
    .select({ mark: expenses.mark })
    .from(expenses)
    .where(and(eq(expenses.orgId, org.id), inArray(expenses.mark, result.docs.map((d) => d.mark))));
  const known = new Set(existing.map((e) => e.mark));
  const supplierRows = await db.select({ id: suppliers.id, afm: suppliers.afm, country: suppliers.country, terms: suppliers.paymentTermsDays, cat: suppliers.defaultClassificationCategory, type: suppliers.defaultClassificationType }).from(suppliers).where(eq(suppliers.orgId, org.id));
  const supplierByAfm = new Map(supplierRows.map((s) => [`${s.country}:${s.afm}`, s]));
  let imported = 0;
  for (const doc of result.docs) {
    if (known.has(doc.mark)) continue;
    const sup = supplierByAfm.get(`${doc.issuerCountry}:${doc.issuerAfm}`);
    await db.insert(expenses).values({
      supplierId: sup?.id ?? null,
      dueDate: dueDateFromTerms(doc.issueDate, sup?.terms),
      id: randomUUID(),
      orgId: org.id,
      supplierName: doc.issuerName || `ΑΦΜ ${doc.issuerAfm}`,
      supplierAfm: doc.issuerAfm,
      supplierCountry: doc.issuerCountry,
      mark: doc.mark,
      uid: doc.uid,
      invoiceType: doc.invoiceType,
      series: doc.series,
      number: doc.aa,
      issueDate: doc.issueDate,
      description: "",
      netValue: doc.totalNetValue,
      vatAmount: doc.totalVatAmount,
      vatCategory: inferVatCategory(doc.totalNetValue, doc.totalVatAmount),
      withheldAmount: doc.totalWithheldAmount,
      grossValue: doc.totalGrossValue,
      classificationCategory: sup?.cat ?? "",
      classificationType: sup?.type ?? "",
      vatDeductible: true,
      status: sup?.cat && sup?.type ? "classified" : "pending",
      source: "mydata",
      rawXml: doc.rawXml,
      createdAt: new Date().toISOString(),
    });
    imported++;
  }
  return { imported, skipped: result.docs.length - imported };
}

/** ΦΠΑ εισροών περιόδου (μόνο έξοδα με δικαίωμα έκπτωσης). */
export async function inputVatSummary(db: Db, orgId: string, period: { from: string; to: string }) {
  const [row] = await db
    .select({
      net: sql<number>`coalesce(sum(${expenses.netValue}), 0)`,
      vat: sql<number>`coalesce(sum(case when ${expenses.vatDeductible} = 1 then ${expenses.vatAmount} else 0 end), 0)`,
      nonDeductible: sql<number>`coalesce(sum(case when ${expenses.vatDeductible} = 0 then ${expenses.vatAmount} else 0 end), 0)`,
      count: sql<number>`count(*)`,
      pending: sql<number>`sum(case when ${expenses.status} = 'pending' then 1 else 0 end)`,
    })
    .from(expenses)
    .where(and(eq(expenses.orgId, orgId), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to)));
  return {
    net: round2(Number(row?.net ?? 0)),
    vat: round2(Number(row?.vat ?? 0)),
    nonDeductible: round2(Number(row?.nonDeductible ?? 0)),
    count: Number(row?.count ?? 0),
    pending: Number(row?.pending ?? 0),
  };
}
