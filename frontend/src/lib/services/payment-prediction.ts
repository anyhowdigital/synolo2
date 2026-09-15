import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import type { Invoice, Organization } from "@/db/schema";
import { invoices, payments } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export type PredictionConfidence = "high" | "medium" | "low" | "none";

export const CONFIDENCE_LABELS: Record<PredictionConfidence, string> = {
  high: "Υψηλή αξιοπιστία",
  medium: "Μέση αξιοπιστία",
  low: "Χαμηλή αξιοπιστία",
  none: "Χωρίς ιστορικό",
};

/** Συμπεριφορά πληρωμών ενός πελάτη: πόσες ημέρες μετά τη λήξη πληρώνει συνήθως. */
export interface PaymentBehaviour {
  customerId: string;
  /** Διάμεσος ημερών σε σχέση με την προθεσμία (θετικό = καθυστέρηση). */
  medianDaysLate: number;
  /** Χειρότερη τυπική καθυστέρηση (75ό εκατοστημόριο) για το απαισιόδοξο σενάριο. */
  worstDaysLate: number;
  samples: number;
  onTimeRatio: number;
  confidence: PredictionConfidence;
}

/** Υπολογίζει τη συμπεριφορά πληρωμών όλων των πελατών από τα εξοφλημένα παραστατικά. */
export async function paymentBehaviourByCustomer(db: Db, orgId: string): Promise<Map<string, PaymentBehaviour>> {
  const rows = await db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")));
  const paid = rows.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.credit && !dt.expenseSide && i.customerId;
  });
  if (paid.length === 0) return new Map();

  const pays = await db
    .select({ invoiceId: payments.invoiceId, paidAt: payments.paidAt })
    .from(payments)
    .where(
      inArray(
        payments.invoiceId,
        paid.map((i) => i.id),
      ),
    );
  const lastPay = new Map<string, string>();
  for (const p of pays) {
    const prev = lastPay.get(p.invoiceId);
    if (!prev || p.paidAt > prev) lastPay.set(p.invoiceId, p.paidAt);
  }

  const byCustomer = new Map<string, number[]>();
  for (const inv of paid) {
    const paidAt = lastPay.get(inv.id);
    if (!paidAt) continue;
    const reference = inv.dueDate ?? inv.issueDate;
    const daysLate = Math.round((new Date(`${paidAt.slice(0, 10)}T00:00:00`).getTime() - new Date(`${reference}T00:00:00`).getTime()) / DAY);
    const list = byCustomer.get(inv.customerId!) ?? [];
    list.push(daysLate);
    byCustomer.set(inv.customerId!, list);
  }

  const out = new Map<string, PaymentBehaviour>();
  for (const [customerId, days] of byCustomer) {
    const samples = days.length;
    const sorted = [...days].sort((a, b) => a - b);
    const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
    out.set(customerId, {
      customerId,
      medianDaysLate: median(days),
      worstDaysLate: Math.max(median(days), p75),
      samples,
      onTimeRatio: Math.round((days.filter((d) => d <= 0).length / samples) * 100),
      confidence: samples >= 5 ? "high" : samples >= 3 ? "medium" : "low",
    });
  }
  return out;
}

export interface PaymentPrediction {
  expectedDate: string;
  /** Ημέρες μετά την προθεσμία που αναμένεται η πληρωμή (0 = εντός προθεσμίας). */
  daysAfterDue: number;
  confidence: PredictionConfidence;
  samples: number;
  onTimeRatio: number | null;
  /** true όταν η πρόβλεψη έχει ήδη ξεπεραστεί και μετατοπίστηκε μπροστά. */
  overdueShift: boolean;
}

/** Προβλεπόμενη ημερομηνία είσπραξης ενός ανοιχτού παραστατικού. */
export function predictPayment(
  org: Organization,
  inv: Pick<Invoice, "issueDate" | "dueDate" | "customerId">,
  behaviour: PaymentBehaviour | undefined,
  today = new Date().toISOString().slice(0, 10),
): PaymentPrediction {
  const due = inv.dueDate ?? addDays(inv.issueDate, org.defaultPaymentTermsDays);
  const daysAfterDue = behaviour ? Math.max(0, behaviour.medianDaysLate) : 0;
  let expectedDate = addDays(due, daysAfterDue);
  let overdueShift = false;
  if (expectedDate < today) {
    // Έχει περάσει η αναμενόμενη ημερομηνία: μετατόπιση κατά τον συνήθη ρυθμό του πελάτη (ή 7 ημέρες).
    expectedDate = addDays(today, behaviour ? Math.max(3, Math.round(behaviour.medianDaysLate / 2)) : 7);
    overdueShift = true;
  }
  return {
    expectedDate,
    daysAfterDue,
    confidence: behaviour?.confidence ?? "none",
    samples: behaviour?.samples ?? 0,
    onTimeRatio: behaviour?.onTimeRatio ?? null,
    overdueShift,
  };
}

export interface PredictedReceivable {
  invoiceId: string;
  number: string;
  customerId: string | null;
  customerName: string;
  dueDate: string | null;
  remaining: number;
  prediction: PaymentPrediction;
}

/** Λίστα ανοιχτών εισπρακτέων με προβλεπόμενη ημερομηνία πληρωμής. */
export async function predictedReceivables(db: Db, org: Organization): Promise<PredictedReceivable[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [open, behaviours] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid", "overdue"]))),
    paymentBehaviourByCustomer(db, org.id),
  ]);

  return open
    .filter((i) => {
      const dt = getDocumentType(i.invoiceType);
      return dt.kind === "invoice" && !dt.credit && !dt.expenseSide && round2(i.totalGrossValue - i.paidAmount) > 0.005;
    })
    .map((i) => ({
      invoiceId: i.id,
      number: `${i.seriesCode ?? ""} ${i.number ?? "—"}`.trim(),
      customerId: i.customerId,
      customerName: i.customerName || "Λιανική",
      dueDate: i.dueDate,
      remaining: round2(i.totalGrossValue - i.paidAmount),
      prediction: predictPayment(org, i, i.customerId ? behaviours.get(i.customerId) : undefined, today),
    }))
    .sort((a, b) => a.prediction.expectedDate.localeCompare(b.prediction.expectedDate));
}
