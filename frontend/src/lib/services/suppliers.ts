import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { expensePayments, expenses, suppliers, type Expense, type ExpensePayment, type Supplier } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { normalizeAfm } from "@/lib/greek/afm";
import { defaultAccountFor } from "./banking";

export interface SupplierInput {
  name: string;
  afm: string;
  doy: string;
  country: string;
  address: string;
  city: string;
  postalCode: string;
  email: string;
  phone: string;
  contactPerson: string;
  iban: string;
  bankName: string;
  paymentTermsDays: number | null;
  defaultClassificationCategory: string;
  defaultClassificationType: string;
  notes: string;
  tags: string;
  active: boolean;
}

export interface SupplierBalance {
  purchased: number;
  outstanding: number;
  overdue: number;
  count: number;
  lastPurchaseAt: string | null;
}

export const EMPTY_BALANCE: SupplierBalance = { purchased: 0, outstanding: 0, overdue: 0, count: 0, lastPurchaseAt: null };

/** Ανοιχτό υπόλοιπο τιμολογίου αγοράς. */
export function expenseRemaining(e: Pick<Expense, "grossValue" | "paidAmount" | "status">) {
  if (e.status === "rejected") return 0;
  return Math.max(0, round2(e.grossValue - e.paidAmount));
}

/** Ημερομηνία αναφοράς για aging: προθεσμία, αλλιώς ημερομηνία έκδοσης. */
export function expenseDueDate(e: Pick<Expense, "dueDate" | "issueDate">) {
  return e.dueDate ?? e.issueDate;
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export async function listSuppliers(db: Db, orgId: string, opts: { q?: string; includeInactive?: boolean } = {}) {
  const conds = [eq(suppliers.orgId, orgId)];
  if (!opts.includeInactive) conds.push(eq(suppliers.active, true));
  const rows = await db.select().from(suppliers).where(and(...conds)).orderBy(asc(suppliers.name));
  const q = opts.q?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((s) => s.name.toLowerCase().includes(q) || s.afm.includes(q) || s.email.toLowerCase().includes(q) || s.city.toLowerCase().includes(q));
}

export async function getSupplier(db: Db, orgId: string, id: string) {
  return db.query.suppliers.findFirst({ where: and(eq(suppliers.id, id), eq(suppliers.orgId, orgId)) });
}

export async function findSupplierByAfm(db: Db, orgId: string, afm: string, country = "GR") {
  const norm = country === "GR" ? normalizeAfm(afm) : afm.trim();
  if (!norm) return null;
  return db.query.suppliers.findFirst({ where: and(eq(suppliers.orgId, orgId), eq(suppliers.afm, norm), eq(suppliers.country, country)) });
}

export async function saveSupplier(db: Db, orgId: string, input: SupplierInput, id?: string) {
  const record = {
    ...input,
    afm: input.country === "GR" ? normalizeAfm(input.afm) : input.afm.trim(),
    iban: input.iban.replace(/\s+/g, "").toUpperCase(),
  };
  if (id) {
    await db.update(suppliers).set(record).where(and(eq(suppliers.id, id), eq(suppliers.orgId, orgId)));
    // Συγχρονισμός ονόματος/ΑΦΜ στα συνδεδεμένα παραστατικά ώστε οι λίστες να μένουν συνεπείς.
    await db.update(expenses).set({ supplierName: record.name, supplierAfm: record.afm, supplierCountry: record.country }).where(and(eq(expenses.supplierId, id), eq(expenses.orgId, orgId)));
    return id;
  }
  const newId = randomUUID();
  await db.insert(suppliers).values({ id: newId, orgId, ...record, createdAt: new Date().toISOString() });
  // Αυτόματη σύνδεση υφιστάμενων παραστατικών με ίδιο ΑΦΜ.
  if (record.afm) {
    await db
      .update(expenses)
      .set({ supplierId: newId })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.supplierAfm, record.afm), eq(expenses.supplierCountry, record.country), sql`${expenses.supplierId} is null`));
  }
  return newId;
}

/** Διαγραφή καρτέλας – τα παραστατικά παραμένουν (αποσυνδέονται). */
export async function deleteSupplier(db: Db, orgId: string, id: string) {
  await db.update(expenses).set({ supplierId: null }).where(and(eq(expenses.supplierId, id), eq(expenses.orgId, orgId)));
  await db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.orgId, orgId)));
}

/** Δημιουργία καρτέλας από τα στοιχεία ενός παραστατικού (π.χ. εισαγωγή myDATA). */
export async function createSupplierFromExpense(db: Db, orgId: string, expenseId: string) {
  const e = await db.query.expenses.findFirst({ where: and(eq(expenses.id, expenseId), eq(expenses.orgId, orgId)) });
  if (!e) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (e.supplierId) return e.supplierId;
  const existing = e.supplierAfm ? await findSupplierByAfm(db, orgId, e.supplierAfm, e.supplierCountry) : null;
  const id =
    existing?.id ??
    (await saveSupplier(db, orgId, {
      name: e.supplierName || `ΑΦΜ ${e.supplierAfm}`,
      afm: e.supplierAfm,
      doy: "",
      country: e.supplierCountry,
      address: "",
      city: "",
      postalCode: "",
      email: "",
      phone: "",
      contactPerson: "",
      iban: "",
      bankName: "",
      paymentTermsDays: null,
      defaultClassificationCategory: e.classificationCategory ?? "",
      defaultClassificationType: e.classificationType ?? "",
      notes: "",
      tags: "[]",
      active: true,
    }));
  await db.update(expenses).set({ supplierId: id }).where(eq(expenses.id, e.id));
  return id;
}

/** Υπόλοιπα ανά προμηθευτή (αγορές, ανοιχτά, ληξιπρόθεσμα). */
export async function supplierBalances(db: Db, orgId: string, supplierIds?: string[]): Promise<Map<string, SupplierBalance>> {
  const conds = [eq(expenses.orgId, orgId), ne(expenses.status, "rejected"), sql`${expenses.supplierId} is not null`];
  if (supplierIds && supplierIds.length > 0) conds.push(inArray(expenses.supplierId, supplierIds));
  const rows = await db.select().from(expenses).where(and(...conds));
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, SupplierBalance>();
  for (const e of rows) {
    const b = map.get(e.supplierId!) ?? { ...EMPTY_BALANCE };
    const remaining = expenseRemaining(e);
    b.purchased = round2(b.purchased + e.grossValue);
    b.outstanding = round2(b.outstanding + remaining);
    if (remaining > 0 && expenseDueDate(e) < today) b.overdue = round2(b.overdue + remaining);
    b.count += 1;
    if (!b.lastPurchaseAt || e.issueDate > b.lastPurchaseAt) b.lastPurchaseAt = e.issueDate;
    map.set(e.supplierId!, b);
  }
  return map;
}

export interface PayablesAging {
  open: number;
  overdue: number;
  dueSoon: number;
  count: number;
  overdueCount: number;
  buckets: { key: string; label: string; amount: number; count: number }[];
}

/** Ενηλικίωση πληρωτέων (aging) – όλα τα ανοιχτά τιμολόγια αγορών, προαιρετικά ενός προμηθευτή. */
export async function payablesAging(db: Db, orgId: string, opts: { supplierId?: string } = {}): Promise<PayablesAging> {
  const conds = [eq(expenses.orgId, orgId), ne(expenses.status, "rejected"), ne(expenses.status, "paid")];
  if (opts.supplierId) conds.push(eq(expenses.supplierId, opts.supplierId));
  const rows = await db.select().from(expenses).where(and(...conds));
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const buckets = [
    { key: "current", label: "Μη ληξιπρόθεσμα", amount: 0, count: 0 },
    { key: "d30", label: "1–30 ημέρες", amount: 0, count: 0 },
    { key: "d60", label: "31–60 ημέρες", amount: 0, count: 0 },
    { key: "d90", label: "61–90 ημέρες", amount: 0, count: 0 },
    { key: "d90plus", label: "> 90 ημέρες", amount: 0, count: 0 },
  ];
  let open = 0;
  let overdue = 0;
  let dueSoon = 0;
  let count = 0;
  let overdueCount = 0;
  for (const e of rows) {
    const remaining = expenseRemaining(e);
    if (remaining <= 0) continue;
    count += 1;
    open = round2(open + remaining);
    const due = expenseDueDate(e);
    const late = daysBetween(due, today);
    const idx = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    buckets[idx].amount = round2(buckets[idx].amount + remaining);
    buckets[idx].count += 1;
    if (late > 0) {
      overdue = round2(overdue + remaining);
      overdueCount += 1;
    } else if (due <= soon) dueSoon = round2(dueSoon + remaining);
  }
  return { open, overdue, dueSoon, count, overdueCount, buckets };
}

export async function listSupplierExpenses(db: Db, orgId: string, supplierId: string) {
  return db.select().from(expenses).where(and(eq(expenses.orgId, orgId), eq(expenses.supplierId, supplierId))).orderBy(desc(expenses.issueDate), desc(expenses.createdAt));
}

export async function listExpensePayments(db: Db, orgId: string, expenseIds: string[]): Promise<ExpensePayment[]> {
  if (expenseIds.length === 0) return [];
  return db.select().from(expensePayments).where(and(eq(expensePayments.orgId, orgId), inArray(expensePayments.expenseId, expenseIds))).orderBy(desc(expensePayments.paidAt), desc(expensePayments.createdAt));
}

async function recomputeExpensePaid(db: Db, orgId: string, expenseId: string) {
  const e = await db.query.expenses.findFirst({ where: and(eq(expenses.id, expenseId), eq(expenses.orgId, orgId)) });
  if (!e) throw new Error("Το παραστατικό δεν βρέθηκε.");
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${expensePayments.amount}), 0)`, last: sql<string | null>`max(${expensePayments.paidAt})` })
    .from(expensePayments)
    .where(eq(expensePayments.expenseId, expenseId));
  const paid = round2(Number(row?.total ?? 0));
  const fullyPaid = paid >= round2(e.grossValue) - 0.005;
  const status = fullyPaid ? "paid" : e.status === "paid" ? (e.classificationCategory ? "classified" : "pending") : e.status;
  await db
    .update(expenses)
    .set({ paidAmount: paid, status, paidAt: fullyPaid ? (row?.last ?? new Date().toISOString().slice(0, 10)) : null })
    .where(eq(expenses.id, expenseId));
  return { paid, remaining: Math.max(0, round2(e.grossValue - paid)), fullyPaid };
}

/** Καταχώρηση πληρωμής προς προμηθευτή (μερική ή ολική). */
export async function recordExpensePayment(db: Db, orgId: string, expenseId: string, input: { amount: number; paidAt: string; method: number; reference?: string; accountId?: string | null }) {
  const e = await db.query.expenses.findFirst({ where: and(eq(expenses.id, expenseId), eq(expenses.orgId, orgId)) });
  if (!e) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (e.status === "rejected") throw new Error("Το παραστατικό έχει απορριφθεί.");
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Το ποσό πρέπει να είναι θετικό.");
  const remaining = expenseRemaining(e);
  if (amount > remaining + 0.005) throw new Error(`Το ποσό υπερβαίνει το ανοιχτό υπόλοιπο (${remaining.toFixed(2)} €).`);
  const id = randomUUID();
  const accountId = input.accountId ?? (await defaultAccountFor(db, orgId, input.method));
  await db.insert(expensePayments).values({ id, orgId, expenseId, amount, paidAt: input.paidAt, method: input.method, reference: input.reference ?? "", accountId, createdAt: new Date().toISOString() });
  const state = await recomputeExpensePaid(db, orgId, expenseId);
  return { id, ...state };
}

export async function deleteExpensePayment(db: Db, orgId: string, paymentId: string) {
  const p = await db.query.expensePayments.findFirst({ where: and(eq(expensePayments.id, paymentId), eq(expensePayments.orgId, orgId)) });
  if (!p) throw new Error("Η πληρωμή δεν βρέθηκε.");
  await db.delete(expensePayments).where(eq(expensePayments.id, paymentId));
  return recomputeExpensePaid(db, orgId, p.expenseId);
}

/** Προθεσμία από ημέρες πίστωσης προμηθευτή. */
export function dueDateFromTerms(issueDate: string, termsDays: number | null | undefined) {
  if (termsDays == null) return null;
  const d = new Date(issueDate);
  d.setDate(d.getDate() + termsDays);
  return d.toISOString().slice(0, 10);
}

export type { Supplier };
