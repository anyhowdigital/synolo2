import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { expenses, invoiceLines, invoices, payments, products, projectExpenses, projects, timeEntries } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";
import type { ReportPeriod } from "@/lib/services/reports";

const margin = (revenue: number, cost: number) => (revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0);

async function incomeInvoices(db: Db, orgId: string, period: ReportPeriod) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, ["issued", "partially_paid", "paid"]), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to)));
  return rows.filter((i) => getDocumentType(i.invoiceType).kind === "invoice");
}

export interface ProjectProfit {
  id: string;
  name: string;
  customerName: string;
  status: string;
  hours: number;
  billableHours: number;
  revenue: number;
  invoiced: number;
  cost: number;
  profit: number;
  marginPercent: number;
  budgetAmount: number | null;
  budgetUsedPercent: number | null;
}

/** Κερδοφορία ανά έργο: έσοδα από χρεώσιμο χρόνο + μετακυλιόμενα έξοδα, κόστος από έξοδα έργου. */
export async function projectProfitability(db: Db, orgId: string, period: ReportPeriod): Promise<ProjectProfit[]> {
  const [projectRows, entries, pexp] = await Promise.all([
    db.select().from(projects).where(eq(projects.orgId, orgId)),
    db.select().from(timeEntries).where(and(eq(timeEntries.orgId, orgId), gte(timeEntries.startedAt, period.from), lte(timeEntries.startedAt, `${period.to}T23:59:59`))),
    db.select().from(projectExpenses).where(and(eq(projectExpenses.orgId, orgId), gte(projectExpenses.incurredOn, period.from), lte(projectExpenses.incurredOn, period.to))),
  ]);
  const customerNames = new Map<string, string>();
  const invs = await incomeInvoices(db, orgId, period);
  for (const i of invs) if (i.customerId) customerNames.set(i.customerId, i.customerName ?? "");

  return projectRows
    .map((p) => {
      const pEntries = entries.filter((e) => e.projectId === p.id);
      const hours = round2(pEntries.reduce((s, e) => s + e.minutes, 0) / 60);
      const billableHours = round2(pEntries.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0) / 60);
      const timeRevenue = round2(pEntries.filter((e) => e.billable).reduce((s, e) => s + (e.minutes / 60) * (e.hourlyRate || p.hourlyRate), 0));
      const invoicedTime = round2(pEntries.filter((e) => e.status === "invoiced").reduce((s, e) => s + (e.minutes / 60) * (e.hourlyRate || p.hourlyRate), 0));
      const pe = pexp.filter((x) => x.projectId === p.id);
      const cost = round2(pe.reduce((s, x) => s + x.amount, 0));
      const rebilled = round2(pe.filter((x) => x.billable).reduce((s, x) => s + x.amount * (1 + x.markupPercent / 100), 0));
      const revenue = round2(timeRevenue + rebilled);
      const invoiced = round2(invoicedTime + round2(pe.filter((x) => x.invoiceId).reduce((s, x) => s + x.amount * (1 + x.markupPercent / 100), 0)));
      return {
        id: p.id,
        name: p.name,
        customerName: (p.customerId && customerNames.get(p.customerId)) || "",
        status: p.status,
        hours,
        billableHours,
        revenue,
        invoiced,
        cost,
        profit: round2(revenue - cost),
        marginPercent: margin(revenue, cost),
        budgetAmount: p.budgetAmount ?? null,
        budgetUsedPercent: p.budgetAmount ? round2((revenue / p.budgetAmount) * 100) : null,
      };
    })
    .filter((p) => p.revenue > 0 || p.cost > 0 || p.hours > 0)
    .sort((a, b) => b.profit - a.profit);
}

export interface CustomerProfit {
  id: string;
  name: string;
  sales: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  collected: number;
  outstanding: number;
  avgDaysToPay: number | null;
  invoiceCount: number;
}

/** Κερδοφορία ανά πελάτη: πωλήσεις (καθαρές) μείον κόστος πωληθέντων από τα είδη. */
export async function customerProfitability(db: Db, orgId: string, period: ReportPeriod): Promise<CustomerProfit[]> {
  const invs = await incomeInvoices(db, orgId, period);
  if (!invs.length) return [];
  const ids = invs.map((i) => i.id);
  const [lines, prods, pays] = await Promise.all([
    db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)),
    db.select().from(products).where(eq(products.orgId, orgId)),
    db.select().from(payments).where(and(eq(payments.orgId, orgId), inArray(payments.invoiceId, ids))),
  ]);
  const costOf = (productId: string | null) => {
    if (!productId) return 0;
    const p = prods.find((x) => x.id === productId);
    if (!p) return 0;
    return p.avgCost || p.costPrice || 0;
  };

  const map = new Map<string, CustomerProfit & { payDays: number[] }>();
  for (const inv of invs) {
    const key = inv.customerId ?? `name:${inv.customerName ?? "—"}`;
    const credit = getDocumentType(inv.invoiceType).credit ? -1 : 1;
    const invLines = lines.filter((l) => l.invoiceId === inv.id);
    const sales = round2(invLines.reduce((s, l) => s + l.netValue, 0) * credit);
    const cogs = round2(invLines.reduce((s, l) => s + l.quantity * costOf(l.productId), 0) * credit);
    const paid = round2(inv.paidAmount * credit);
    const outstanding = round2((inv.totalGrossValue - inv.paidAmount) * credit);
    const cur =
      map.get(key) ??
      ({ id: inv.customerId ?? key, name: inv.customerName ?? "—", sales: 0, cogs: 0, grossProfit: 0, marginPercent: 0, collected: 0, outstanding: 0, avgDaysToPay: null, invoiceCount: 0, payDays: [] } as CustomerProfit & { payDays: number[] });
    cur.sales = round2(cur.sales + sales);
    cur.cogs = round2(cur.cogs + cogs);
    cur.collected = round2(cur.collected + paid);
    cur.outstanding = round2(cur.outstanding + outstanding);
    cur.invoiceCount += 1;
    const firstPay = pays.filter((p) => p.invoiceId === inv.id).map((p) => p.paidAt).sort()[0];
    if (firstPay) cur.payDays.push(Math.max(0, Math.round((new Date(firstPay).getTime() - new Date(inv.issueDate).getTime()) / 86_400_000)));
    map.set(key, cur);
  }

  return [...map.values()]
    .map(({ payDays, ...c }) => ({
      ...c,
      grossProfit: round2(c.sales - c.cogs),
      marginPercent: margin(c.sales, c.cogs),
      avgDaysToPay: payDays.length ? Math.round(payDays.reduce((s, d) => s + d, 0) / payDays.length) : null,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

export interface ItemProfit {
  id: string;
  name: string;
  sku: string;
  kind: string;
  quantity: number;
  sales: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  unitCost: number;
}

/** Κερδοφορία ανά είδος/υπηρεσία με κόστος από ΜΣΚ ή τιμή κόστους. */
export async function itemProfitability(db: Db, orgId: string, period: ReportPeriod): Promise<ItemProfit[]> {
  const invs = await incomeInvoices(db, orgId, period);
  if (!invs.length) return [];
  const ids = invs.map((i) => i.id);
  const [lines, prods] = await Promise.all([
    db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)),
    db.select().from(products).where(eq(products.orgId, orgId)),
  ]);
  const creditOf = new Map(invs.map((i) => [i.id, getDocumentType(i.invoiceType).credit ? -1 : 1] as const));

  const map = new Map<string, ItemProfit>();
  for (const l of lines) {
    const sign = creditOf.get(l.invoiceId) ?? 1;
    const p = l.productId ? prods.find((x) => x.id === l.productId) : undefined;
    const key = p?.id ?? `desc:${l.description.trim().toLowerCase()}`;
    const unitCost = p ? p.avgCost || p.costPrice || 0 : 0;
    const cur = map.get(key) ?? { id: p?.id ?? key, name: p?.name ?? l.description, sku: p?.sku ?? "", kind: p?.kind ?? "service", quantity: 0, sales: 0, cogs: 0, grossProfit: 0, marginPercent: 0, unitCost };
    cur.quantity = round2(cur.quantity + l.quantity * sign);
    cur.sales = round2(cur.sales + l.netValue * sign);
    cur.cogs = round2(cur.cogs + l.quantity * unitCost * sign);
    map.set(key, cur);
  }

  return [...map.values()]
    .map((i) => ({ ...i, grossProfit: round2(i.sales - i.cogs), marginPercent: margin(i.sales, i.cogs) }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

/** Σύνοψη για την καρτέλα 360° του λογιστή: πωλήσεις, κόστος πωληθέντων, έξοδα περιόδου. */
export async function profitSummary(db: Db, orgId: string, period: ReportPeriod) {
  const [customers, exp] = await Promise.all([
    customerProfitability(db, orgId, period),
    db.select().from(expenses).where(and(eq(expenses.orgId, orgId), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to))),
  ]);
  const sales = round2(customers.reduce((s, c) => s + c.sales, 0));
  const cogs = round2(customers.reduce((s, c) => s + c.cogs, 0));
  const expenseNet = round2(exp.reduce((s, e) => s + e.netValue, 0));
  return {
    sales,
    cogs,
    grossProfit: round2(sales - cogs),
    grossMarginPercent: margin(sales, cogs),
    expenseNet,
    netProfit: round2(sales - cogs - expenseNet),
  };
}
