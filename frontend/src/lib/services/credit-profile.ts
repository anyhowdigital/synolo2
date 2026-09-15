import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import type { Customer, Invoice, Organization } from "@/db/schema";
import { customers, invoices, payments } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CreditRating = "excellent" | "good" | "watch" | "risk" | "unknown";

export const CREDIT_RATING_LABELS: Record<CreditRating, string> = {
  excellent: "Άριστη συνέπεια",
  good: "Καλή συνέπεια",
  watch: "Υπό παρακολούθηση",
  risk: "Υψηλός κίνδυνος",
  unknown: "Χωρίς ιστορικό",
};

export interface CreditProfile {
  avgPaymentDays: number | null;
  onTimeRatio: number | null;
  paidCount: number;
  outstanding: number;
  overdue: number;
  creditLimit: number;
  available: number | null;
  rating: CreditRating;
}

/** Τόκοι υπερημερίας + πάγια χρέωση καθυστέρησης για ανεξόφλητο παραστατικό. */
export function lateCharges(org: Organization, inv: Pick<Invoice, "dueDate" | "totalGrossValue" | "paidAmount" | "status">, today = new Date()) {
  const remaining = round2(inv.totalGrossValue - inv.paidAmount);
  if (!inv.dueDate || remaining <= 0.005 || inv.status === "paid") return { daysLate: 0, interest: 0, flat: 0, total: 0 };
  const daysLate = Math.floor((today.getTime() - new Date(`${inv.dueDate}T00:00:00`).getTime()) / 86_400_000);
  if (daysLate <= 0) return { daysLate: 0, interest: 0, flat: 0, total: 0 };
  const interest = org.lateInterestAnnualRate > 0 ? round2((remaining * (org.lateInterestAnnualRate / 100) * daysLate) / 365) : 0;
  const flat = org.lateFeeFlat > 0 ? round2(org.lateFeeFlat) : 0;
  return { daysLate, interest, flat, total: round2(interest + flat) };
}

/** Πιστωτικό προφίλ πελάτη: μέσος χρόνος πληρωμής, συνέπεια, υπόλοιπο και διαθέσιμο όριο. */
export async function customerCreditProfile(db: Db, orgId: string, customer: Customer): Promise<CreditProfile> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customer.id)));
  const income = rows.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.credit && !dt.expenseSide && i.status !== "draft" && i.status !== "cancelled";
  });
  const paid = income.filter((i) => i.status === "paid");
  const pays = paid.length ? await db.select().from(payments).where(inArray(payments.invoiceId, paid.map((i) => i.id))) : [];
  const lastPayByInvoice = new Map<string, string>();
  for (const p of pays) {
    const prev = lastPayByInvoice.get(p.invoiceId);
    if (!prev || p.paidAt > prev) lastPayByInvoice.set(p.invoiceId, p.paidAt);
  }

  let daysSum = 0;
  let counted = 0;
  let onTime = 0;
  for (const inv of paid) {
    const paidAt = lastPayByInvoice.get(inv.id);
    if (!paidAt) continue;
    const days = Math.round((new Date(paidAt.slice(0, 10)).getTime() - new Date(inv.issueDate).getTime()) / 86_400_000);
    daysSum += Math.max(0, days);
    counted++;
    if (!inv.dueDate || paidAt.slice(0, 10) <= inv.dueDate) onTime++;
  }

  const open = income.filter((i) => i.status === "issued" || i.status === "partially_paid");
  const outstanding = round2(open.reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0));
  const overdue = round2(open.filter((i) => i.dueDate && i.dueDate < today).reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0));
  const avgPaymentDays = counted ? Math.round(daysSum / counted) : null;
  const onTimeRatio = counted ? Math.round((onTime / counted) * 100) : null;

  let rating: CreditRating = "unknown";
  if (overdue > 0.005) rating = overdue > outstanding * 0.5 ? "risk" : "watch";
  else if (onTimeRatio !== null) rating = onTimeRatio >= 90 ? "excellent" : onTimeRatio >= 70 ? "good" : "watch";

  return {
    avgPaymentDays,
    onTimeRatio,
    paidCount: counted,
    outstanding,
    overdue,
    creditLimit: customer.creditLimit,
    available: customer.creditLimit > 0 ? round2(customer.creditLimit - outstanding) : null,
    rating,
  };
}

/** Ανοιχτά υπόλοιπα και πιστωτικά όρια όλων των πελατών (για προειδοποίηση στον editor). */
export async function creditExposureByCustomer(db: Db, orgId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, custRows] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.orgId, orgId), inArray(invoices.status, ["issued", "partially_paid"]))),
    db.select({ id: customers.id, creditLimit: customers.creditLimit }).from(customers).where(eq(customers.orgId, orgId)),
  ]);
  const map = new Map<string, { outstanding: number; overdue: number; creditLimit: number }>();
  for (const c of custRows) map.set(c.id, { outstanding: 0, overdue: 0, creditLimit: c.creditLimit });
  for (const inv of rows) {
    if (!inv.customerId) continue;
    const dt = getDocumentType(inv.invoiceType);
    if (dt.credit || dt.kind !== "invoice" || dt.expenseSide) continue;
    const entry = map.get(inv.customerId);
    if (!entry) continue;
    const remaining = inv.totalGrossValue - inv.paidAmount;
    entry.outstanding = round2(entry.outstanding + remaining);
    if (inv.dueDate && inv.dueDate < today) entry.overdue = round2(entry.overdue + remaining);
  }
  return map;
}
