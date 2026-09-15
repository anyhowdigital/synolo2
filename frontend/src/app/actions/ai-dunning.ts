"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, customers, payments } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";

export type DunningResult =
  | { ok: true; reminder: { subject: string; body_text: string; tone: string; sms_body: string }; creditScore: string }
  | { ok: false; error: string };

function computeCreditScore(paidCount: number, latePayments: number, totalInvoices: number): string {
  if (totalInvoices === 0) return "average";
  const lateRatio = latePayments / totalInvoices;
  if (lateRatio < 0.15 && paidCount >= 3) return "good";
  if (lateRatio > 0.5) return "poor";
  return "average";
}

export async function generateDunningReminder(invoiceId: string, step: 1 | 2 | 3 = 1): Promise<DunningResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.orgId, org.id)) });
  if (!inv) return { ok: false, error: "Δεν βρέθηκε το τιμολόγιο." };
  const remaining = +(inv.totalGrossValue - inv.paidAmount).toFixed(2);
  if (remaining <= 0.005) return { ok: false, error: "Το τιμολόγιο είναι εξοφλημένο." };
  const dueDate = inv.dueDate ?? inv.issueDate;
  const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000));

  let customer = null;
  if (inv.customerId) {
    customer = await db.query.customers.findFirst({ where: and(eq(customers.id, inv.customerId), eq(customers.orgId, org.id)) });
  }
  // Ιστορικό πληρωμών (credit score)
  let creditScore = "average";
  let totalCustomerDebt = remaining;
  if (customer) {
    const custInvoices = await db.select().from(invoices).where(and(eq(invoices.customerId, customer.id), eq(invoices.orgId, org.id)));
    const paidCount = custInvoices.filter((i) => i.paidAmount >= i.totalGrossValue - 0.005).length;
    let lateCount = 0;
    for (const ci of custInvoices) {
      if (ci.paidAmount < ci.totalGrossValue - 0.005) continue;
      const custPayments = await db.select().from(payments).where(eq(payments.invoiceId, ci.id));
      const lastPaidAt = custPayments.reduce((max, p) => (p.paidAt > max ? p.paidAt : max), "");
      const dueD = ci.dueDate ?? ci.issueDate;
      if (lastPaidAt > dueD) lateCount++;
    }
    creditScore = computeCreditScore(paidCount, lateCount, custInvoices.length);
    totalCustomerDebt = custInvoices.reduce((s, i) => s + Math.max(0, i.totalGrossValue - i.paidAmount), 0);
  }

  const payload = {
    customer_name: customer?.name ?? inv.customerName ?? "Πελάτης",
    customer_email: customer?.email ?? "",
    org_name: org.name,
    invoice_number: `${inv.seriesCode} ${inv.number}`,
    invoice_amount: remaining,
    days_overdue: daysOverdue,
    total_customer_debt: +totalCustomerDebt.toFixed(2),
    credit_score: creditScore,
    step,
    language: customer?.language ?? "el",
  };

  try {
    const resp = await fetch("http://127.0.0.1:8001/api/copilot/dunning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, error: `AI dunning αποτυχία (${resp.status}): ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { ok: true, reminder: data.reminder, creditScore };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
