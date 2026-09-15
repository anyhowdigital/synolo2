import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, invoices, organizations, type Organization } from "@/db/schema";
import { KIND_CODES } from "./invoices";
import { emailPaymentReminder } from "./invoice-email";
import { notify } from "./notifications";
import { invoiceDisplayNumber } from "./invoice-display";
import { formatMoney } from "@/lib/invoice/totals";

export function parseReminderDays(value: string | null | undefined): number[] {
  return (value ?? "-3,0,7,21")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= -60 && n <= 365)
    .sort((a, b) => a - b);
}

/** Ύφος υπενθύμισης ανά στάδιο: ευγενική ειδοποίηση πριν τη λήξη → αυστηρή όχληση. */
export function reminderTone(daysRelativeToDue: number): "upcoming" | "due" | "late" | "final" {
  if (daysRelativeToDue < 0) return "upcoming";
  if (daysRelativeToDue === 0) return "due";
  if (daysRelativeToDue <= 14) return "late";
  return "final";
}

/**
 * Αυτόματες υπενθυμίσεις: για κάθε ανεξόφλητο παραστατικό που έχει περάσει ένα από τα
 * στάδια (π.χ. 3, 10, 30 ημέρες μετά την προθεσμία) και δεν έχει σταλεί ήδη υπενθύμιση για το στάδιο.
 */
export async function runRemindersForOrg(db: Db, org: Organization) {
  const stages = parseReminderDays(org.reminderDays);
  if (stages.length === 0) return { sent: 0, skipped: 0 };
  const today = Date.now();
  const rows = await db
    .select({ inv: invoices, email: customers.email })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid"]), isNotNull(invoices.dueDate), inArray(invoices.invoiceType, KIND_CODES.invoice)));

  let sent = 0;
  let skipped = 0;
  // Ημερήσια σύνοψη: παραστατικά που έληξαν χθες (μία ειδοποίηση ανά ημέρα, χωρίς spam).
  const newlyOverdue = rows.filter(({ inv }) => Math.floor((today - new Date(inv.dueDate!).getTime()) / 86_400_000) === 1);
  if (newlyOverdue.length) {
    const total = newlyOverdue.reduce((sum, { inv }) => sum + (inv.totalGrossValue - inv.paidAmount), 0);
    await notify(db, {
      orgId: org.id,
      type: "invoice_overdue",
      title: `${newlyOverdue.length} ${newlyOverdue.length === 1 ? "παραστατικό έληξε" : "παραστατικά έληξαν"} χθες · ${formatMoney(total)}`,
      body: newlyOverdue.slice(0, 5).map(({ inv }) => `${invoiceDisplayNumber(inv)} – ${inv.customerName || "Λιανική"} (${formatMoney(inv.totalGrossValue - inv.paidAmount, inv.currency)})`).join(" · ") + (newlyOverdue.length > 5 ? " · …" : ""),
      link: "/invoices?status=overdue",
    });
  }
  for (const { inv, email } of rows) {
    const daysLate = Math.floor((today - new Date(`${inv.dueDate!}T00:00:00`).getTime()) / 86_400_000);
    const stageIndex = stages.filter((s) => daysLate >= s).length; // πόσα στάδια έχουν περάσει
    if (stageIndex === 0 || inv.reminderCount >= stageIndex) {
      skipped++;
      continue;
    }
    if (!email) {
      skipped++;
      continue;
    }
    await emailPaymentReminder(db, org, inv, email, { tone: reminderTone(daysLate) });
    sent++;
  }
  return { sent, skipped };
}

export async function runRemindersForAll(db: Db) {
  const orgs = await db.select().from(organizations);
  const results: { orgId: string; sent: number }[] = [];
  for (const org of orgs) {
    const r = await runRemindersForOrg(db, org);
    results.push({ orgId: org.id, sent: r.sent });
  }
  return results;
}
