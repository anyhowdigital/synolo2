import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { invoices } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import { paymentBehaviourByCustomer, predictPayment, type PaymentBehaviour } from "@/lib/services/payment-prediction";

export interface ReceivableRisk {
  invoiceId: string;
  label: string;
  customerId: string | null;
  customerName: string;
  amount: number;
  dueDate: string | null;
  expectedDate: string;
  daysLate: number;
  predictedDelay: number;
  riskScore: number;
  level: "high" | "medium" | "low";
  reason: string;
  action: { title: string; detail: string; href: string };
}

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function suggestAction(daysLate: number, amount: number, behaviour: PaymentBehaviour | undefined, invoiceId: string): ReceivableRisk["action"] {
  if (daysLate > 60 || (daysLate > 30 && amount > 3000))
    return { title: "Διακανονισμός ή νομικά", detail: "Πρότεινε πλάνο δόσεων και, αν δεν ανταποκριθεί, προχώρησε σε όχληση με απόδειξη παραλαβής.", href: "/copilot" };
  if (daysLate > 30) return { title: "Χρέωση τόκων υπερημερίας", detail: "Στείλε τελική προειδοποίηση και χρέωσε τόκους/πάγια επιβάρυνση στο παραστατικό.", href: `/invoices/${invoiceId}` };
  if (daysLate > 7) return { title: "Τηλεφωνική επικοινωνία", detail: "Το email δεν αρκεί σε αυτό το στάδιο – τηλεφώνησε και κατέγραψε δεσμευτική ημερομηνία πληρωμής.", href: `/invoices/${invoiceId}` };
  if (daysLate > 0) return { title: "Υπενθύμιση τώρα", detail: "Στείλε ήπια υπενθύμιση με το PDF και τον κωδικό πληρωμής.", href: `/invoices/${invoiceId}` };
  if (behaviour && behaviour.medianDaysLate >= 7)
    return { title: "Προληπτική υπενθύμιση", detail: `Ο πελάτης πληρώνει συνήθως +${behaviour.medianDaysLate} ημέρες – στείλε υπενθύμιση πριν τη λήξη.`, href: `/invoices/${invoiceId}` };
  return { title: "Παρακολούθηση", detail: "Δεν χρειάζεται ενέργεια σήμερα – έλεγξε ξανά μετά τη λήξη.", href: `/invoices/${invoiceId}` };
}

/** Κατάταξη ανοιχτών απαιτήσεων κατά κίνδυνο καθυστέρησης (πρόβλεψη + ηλικία + ποσό). */
export async function receivablesRisk(db: Db, org: Organization): Promise<{ items: ReceivableRisk[]; totalAtRisk: number; thisMonth: number }> {
  const rows = await db.select().from(invoices).where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid", "overdue"])));
  const behaviours = await paymentBehaviourByCustomer(db, org.id);
  const t = today();
  const monthEnd = t.slice(0, 8) + "31";
  const items: ReceivableRisk[] = [];

  for (const inv of rows) {
    const dt = getDocumentType(inv.invoiceType);
    if (dt.credit || dt.expenseSide || dt.kind !== "invoice") continue;
    const amount = round2(inv.totalGrossValue - inv.paidAmount);
    if (amount <= 0.005) continue;
    const behaviour = inv.customerId ? behaviours.get(inv.customerId) : undefined;
    const prediction = predictPayment(org, inv, behaviour, t);
    const due = inv.dueDate ?? inv.issueDate;
    const daysLate = Math.max(0, daysBetween(due, t));

    let score = 0;
    score += Math.min(40, daysLate * 0.8);
    score += Math.min(25, (behaviour?.medianDaysLate ?? 0) * 1.5);
    score += behaviour ? (100 - behaviour.onTimeRatio) * 0.15 : 10;
    score += amount > 5000 ? 15 : amount > 1000 ? 8 : 3;
    if (inv.status === "partially_paid") score -= 5;
    const riskScore = Math.max(0, Math.min(100, Math.round(score)));

    items.push({
      invoiceId: inv.id,
      label: `${inv.seriesCode} ${inv.number ?? "—"}`,
      customerId: inv.customerId,
      customerName: inv.customerName || "Πελάτης λιανικής",
      amount,
      dueDate: inv.dueDate,
      expectedDate: prediction.expectedDate,
      daysLate,
      predictedDelay: behaviour?.medianDaysLate ?? 0,
      riskScore,
      level: riskScore >= 55 ? "high" : riskScore >= 30 ? "medium" : "low",
      reason: behaviour
        ? `Ιστορικό: πληρώνει +${behaviour.medianDaysLate} ημέρες (${behaviour.samples} παραστατικά, ${behaviour.onTimeRatio}% εντός προθεσμίας)${daysLate ? ` · ήδη ${daysLate} ημέρες ληξιπρόθεσμο` : ""}.`
        : `Χωρίς ιστορικό πληρωμών${daysLate ? ` · ${daysLate} ημέρες ληξιπρόθεσμο` : ""}.`,
      action: suggestAction(daysLate, amount, behaviour, inv.id),
    });
  }

  items.sort((a, b) => b.riskScore - a.riskScore || b.amount - a.amount);
  return {
    items,
    totalAtRisk: round2(items.filter((i) => i.level !== "low").reduce((s, i) => s + i.amount, 0)),
    thisMonth: round2(items.filter((i) => i.expectedDate <= monthEnd).reduce((s, i) => s + i.amount, 0)),
  };
}
