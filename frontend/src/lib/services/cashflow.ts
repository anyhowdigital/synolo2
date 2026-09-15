import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { cashAccounts, cashEntries, expensePayments, expenses, invoices, payments, recurringTemplates } from "@/db/schema";
import { paymentBehaviourByCustomer, predictPayment } from "@/lib/services/payment-prediction";

const round2 = (n: number) => Math.round(n * 100) / 100;

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function templateNet(linesJson: string) {
  try {
    const lines = JSON.parse(linesJson) as { quantity?: number; unitPrice?: number; discountPercent?: number; vatCategory?: number }[];
    return lines.reduce((s, l) => s + (l.quantity ?? 1) * (l.unitPrice ?? 0) * (1 - (l.discountPercent ?? 0) / 100) * 1.24, 0);
  } catch {
    return 0;
  }
}

async function collectFlows(db: Db, org: Organization, today: string, horizon: string) {
  const [accounts, pays, exPays, entries, openInvoices, openExpenses, templates, behaviours] = await Promise.all([
    db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, org.id), eq(cashAccounts.active, true))),
    db.select().from(payments).where(eq(payments.orgId, org.id)),
    db.select().from(expensePayments).where(eq(expensePayments.orgId, org.id)),
    db.select().from(cashEntries).where(eq(cashEntries.orgId, org.id)),
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid"]))),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), ne(expenses.status, "rejected"))),
    db.select().from(recurringTemplates).where(and(eq(recurringTemplates.orgId, org.id), eq(recurringTemplates.active, true))),
    paymentBehaviourByCustomer(db, org.id),
  ]);

  const startingCash = round2(
    accounts.reduce((s, a) => s + a.openingBalance, 0) +
      pays.reduce((s, p) => s + p.amount, 0) +
      entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0) -
      exPays.reduce((s, p) => s + p.amount, 0) -
      entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0),
  );

  const flows: { date: string; amount: number; inflow: boolean }[] = [];
  let predictedCount = 0;
  let predictedShiftDays = 0;
  for (const inv of openInvoices) {
    const remaining = round2(inv.totalGrossValue - inv.paidAmount);
    if (remaining <= 0.005) continue;
    // Ημερομηνία είσπραξης βάσει της πραγματικής συνέπειας του πελάτη (πρόβλεψη πληρωμής).
    const prediction = predictPayment(org, inv, inv.customerId ? behaviours.get(inv.customerId) : undefined, today);
    if (prediction.daysAfterDue > 0) {
      predictedCount++;
      predictedShiftDays += prediction.daysAfterDue;
    }
    const date = prediction.expectedDate;
    if (date < today || date > horizon) continue;
    flows.push({ date, amount: remaining, inflow: true });
  }
  for (const ex of openExpenses) {
    const remaining = round2(ex.grossValue - ex.paidAmount);
    if (remaining <= 0.005) continue;
    const date = ex.dueDate ?? addDays(ex.issueDate, 30);
    if (date < today || date > horizon) continue;
    flows.push({ date, amount: -remaining, inflow: false });
  }
  for (const t of templates) {
    const gross = round2(templateNet(t.linesJson));
    if (gross <= 0.005) continue;
    let date = t.nextRunAt;
    let guard = 0;
    while (date <= horizon && guard++ < 12) {
      if (date >= today) flows.push({ date, amount: gross, inflow: true });
      const step = t.interval === "weekly" ? 7 : t.interval === "quarterly" ? 90 : t.interval === "yearly" ? 365 : 30;
      date = addDays(date, step);
    }
  }
  return { startingCash, flows, predicted: { invoices: predictedCount, avgDaysLate: predictedCount ? Math.round(predictedShiftDays / predictedCount) : 0 } };
}

/** Πρόβλεψη ρευστότητας 90 ημερών με σενάρια καθυστέρησης εισπράξεων. */
export async function cashflowForecast90(db: Db, org: Organization, options: { vatOutflow?: { date: string; amount: number } } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, 90);
  const { startingCash, flows, predicted } = await collectFlows(db, org, today, horizon);

  if (options.vatOutflow && options.vatOutflow.amount > 0.005 && options.vatOutflow.date >= today && options.vatOutflow.date <= horizon) {
    flows.push({ date: options.vatOutflow.date, amount: -round2(options.vatOutflow.amount), inflow: false });
  }

  const scenarios = [
    { key: "base", label: "Βασικό σενάριο", delayDays: 0 },
    { key: "late15", label: "Καθυστέρηση 15 ημερών", delayDays: 15 },
    { key: "late30", label: "Καθυστέρηση 30 ημερών", delayDays: 30 },
  ].map((s) => {
    const shifted = flows.map((f) => (f.inflow && s.delayDays ? { ...f, date: addDays(f.date, s.delayDays) } : f));
    const points = bucketWeeks(shifted, startingCash, today);
    const totalIn = round2(points.reduce((sum, p) => sum + p.inflow, 0));
    const totalOut = round2(points.reduce((sum, p) => sum + p.outflow, 0));
    const lowest = points.reduce((m, p) => (p.running < m.running ? p : m), points[0]);
    return { ...s, points, totalIn, totalOut, projected: round2(startingCash + totalIn - totalOut), lowest };
  });

  const base = scenarios[0];
  return { startingCash, scenarios, predicted, vatOutflow: options.vatOutflow ?? null, points: base.points, totalIn: base.totalIn, totalOut: base.totalOut, projected: base.projected, lowest: base.lowest };
}

function bucketWeeks(flows: { date: string; amount: number }[], startingCash: number, today: string) {
  const points: { label: string; inflow: number; outflow: number; running: number }[] = [];
  let running = startingCash;
  for (let w = 0; w < 13; w++) {
    const from = addDays(today, w * 7);
    const to = addDays(today, w * 7 + 6);
    const inWeek = flows.filter((f) => f.date >= from && f.date <= to);
    const inflow = round2(inWeek.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0));
    const outflow = round2(inWeek.filter((f) => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0));
    running = round2(running + inflow - outflow);
    points.push({ label: from.slice(8, 10) + "/" + from.slice(5, 7), inflow, outflow, running });
  }
  return points;
}

