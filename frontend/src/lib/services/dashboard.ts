import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { bankTransactions, customers, invoices, products, recurringTemplates } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { agingReport, quarterPeriod, vatReport } from "@/lib/services/reports";
import { inputVatSummary } from "@/lib/services/expenses";
import { dashboardStats } from "@/lib/services/invoices";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Προθεσμία υποβολής Φ2: τελευταία ημέρα του μήνα που ακολουθεί τη λήξη της περιόδου. */
export function nextF2Deadline(periodTo: string) {
  const to = new Date(`${periodTo}T00:00:00`);
  const deadline = new Date(to.getFullYear(), to.getMonth() + 2, 0);
  const iso = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}`;
  const days = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  return { date: iso, days };
}

export async function advancedDashboard(db: Db, org: Organization) {
  const period = quarterPeriod();
  const today = new Date().toISOString().slice(0, 10);

  const [stats, aging, vat, input, allInvoices, unmatched, lowStockRows, templates, topRows] = await Promise.all([    dashboardStats(db, org.id),
    agingReport(db, org.id),
    vatReport(db, org.id, period),
    inputVatSummary(db, org.id, period),
    db
      .select({ id: invoices.id, invoiceType: invoices.invoiceType, status: invoices.status, b2gStatus: invoices.b2gStatus, dueDate: invoices.dueDate, gross: invoices.totalGrossValue, paid: invoices.paidAmount })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), ne(invoices.status, "draft"), ne(invoices.status, "cancelled"))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.orgId, org.id), eq(bankTransactions.status, "unmatched"))),
    db.select({ id: products.id, name: products.name, stockQuantity: products.stockQuantity, reorderLevel: products.reorderLevel }).from(products).where(and(eq(products.orgId, org.id), eq(products.trackStock, true))),
    db.select().from(recurringTemplates).where(and(eq(recurringTemplates.orgId, org.id), eq(recurringTemplates.active, true))),
    db
      .select({
        id: customers.id,
        name: customers.name,
        billed: sql<number>`coalesce(sum(case when ${invoices.status} != 'draft' and ${invoices.status} != 'cancelled' then ${invoices.totalGrossValue} else 0 end), 0)`,
        outstanding: sql<number>`coalesce(sum(case when ${invoices.status} in ('issued','partially_paid') then ${invoices.totalGrossValue} - ${invoices.paidAmount} else 0 end), 0)`,
      })
      .from(customers)
      .leftJoin(invoices, eq(invoices.customerId, customers.id))
      .where(eq(customers.orgId, org.id))
      .groupBy(customers.id)
      .orderBy(desc(sql`3`))
      .limit(5),
  ]);

  const b2gPending = allInvoices.filter((i) => i.b2gStatus === "pending" || i.b2gStatus === "sent").length;
  const b2gRejected = allInvoices.filter((i) => i.b2gStatus === "rejected" || i.b2gStatus === "error").length;
  const overdue = allInvoices.filter((i) => i.dueDate && i.dueDate < today && i.status !== "paid" && !getDocumentType(i.invoiceType).credit);
  const lowStock = lowStockRows.filter((p) => p.stockQuantity <= p.reorderLevel);
  const failedCharges = templates.filter((t) => t.autoCharge && t.chargeFailCount > 0);

  const monthlyFactor = (interval: string) => (interval === "yearly" ? 1 / 12 : interval === "quarterly" ? 1 / 3 : interval === "weekly" ? 4.33 : 1);
  const templateNet = (linesJson: string) => {
    try {
      const lines = JSON.parse(linesJson) as { quantity?: number; unitPrice?: number; discountPercent?: number }[];
      return lines.reduce((s, l) => s + (l.quantity ?? 1) * (l.unitPrice ?? 0) * (1 - (l.discountPercent ?? 0) / 100), 0);
    } catch {
      return 0;
    }
  };
  const mrr = round2(templates.reduce((s, t) => s + templateNet(t.linesJson) * monthlyFactor(t.interval), 0));

  const vatPosition = round2(vat.totalVat - input.vat);
  const deadline = nextF2Deadline(period.to);

  return {
    stats,
    aging,
    vat: { outputs: vat.totalVat, inputs: input.vat, position: vatPosition, period, deadline, invoiceCount: vat.invoiceCount },
    queue: {
      mydata: stats.pendingMyDataCount,
      b2gPending,
      b2gRejected,
      overdueCount: overdue.length,
      overdueAmount: round2(overdue.reduce((s, i) => s + (i.gross - i.paid), 0)),
      unmatched: Number(unmatched[0]?.n ?? 0),
      lowStock: lowStock.length,
      failedCharges: failedCharges.length,
      drafts: stats.drafts,
    },
    subscriptions: {
      active: templates.length,
      autoCharge: templates.filter((t) => t.autoCharge).length,
      nextRun: templates.map((t) => t.nextRunAt).sort()[0] ?? null,
      mrr,
    },
    topCustomers: topRows.map((r) => ({ id: r.id, name: r.name, billed: round2(Number(r.billed)), outstanding: round2(Number(r.outstanding)) })),
  };
}

export type AdvancedDashboard = Awaited<ReturnType<typeof advancedDashboard>>;
