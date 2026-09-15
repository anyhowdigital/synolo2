import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, expenses, customers, cashAccounts, cashEntries, payments, expensePayments } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { taxAdvisor, businessSnapshot } from "@/lib/services/tax-advisor";
import { TAX_RULES } from "@/lib/tax/knowledge-base";
import { PageHeader } from "@/components/page-header";
import { CopilotChat } from "@/components/copilot/copilot-chat";
import { CollectionsAgent } from "@/components/copilot/collections-agent";
import { TaxCopilotChat } from "@/components/advisor/tax-copilot-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Βοηθός AI" };

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function CopilotPage({ searchParams }: PageProps<"/copilot">) {
  const db = await getDb();
  const { org } = await requireContext(db);
  const sp = await searchParams;
  const rawTab = sp.tab;
  const activeTab = (Array.isArray(rawTab) ? rawTab[0] : rawTab) === "tax" ? "tax" : "cash";
  const today = new Date().toISOString().slice(0, 10);
  const [openInvoices, openExpenses, accounts, pays, exPays, entries] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid"]))),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), ne(expenses.status, "rejected"))),
    db.select().from(cashAccounts).where(eq(cashAccounts.orgId, org.id)),
    db.select().from(payments).where(eq(payments.orgId, org.id)),
    db.select().from(expensePayments).where(eq(expensePayments.orgId, org.id)),
    db.select().from(cashEntries).where(eq(cashEntries.orgId, org.id)),
  ]);

  const opening = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const inflow = pays.reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const outflow = exPays.reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
  const cashBalance = +(opening + inflow - outflow).toFixed(2);

  const receivables = openInvoices.reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0);
  const payables = openExpenses.reduce((s, e) => s + (e.grossValue - e.paidAmount), 0);

  const byCust = new Map<string, { name: string; amount: number; oldest: string }>();
  for (const inv of openInvoices) {
    const key = inv.customerId ?? inv.customerName ?? "unknown";
    const remaining = +(inv.totalGrossValue - inv.paidAmount).toFixed(2);
    if (remaining <= 0.005) continue;
    const rec = byCust.get(key) ?? { name: inv.customerName ?? "—", amount: 0, oldest: inv.issueDate };
    rec.amount += remaining;
    if (inv.issueDate < rec.oldest) rec.oldest = inv.issueDate;
    byCust.set(key, rec);
  }
  const topDebtors = Array.from(byCust.values()).sort((a, b) => b.amount - a.amount).slice(0, 5).map((d) => ({
    name: d.name,
    amount: +d.amount.toFixed(2),
    days_overdue: Math.max(0, Math.floor((Date.now() - new Date(d.oldest).getTime()) / 86400000)),
  }));

  const aging: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of openInvoices) {
    const remaining = +(inv.totalGrossValue - inv.paidAmount).toFixed(2);
    if (remaining <= 0.005) continue;
    const due = inv.dueDate ?? addDays(inv.issueDate, org.defaultPaymentTermsDays);
    const days = Math.max(0, Math.floor((Date.now() - new Date(due).getTime()) / 86400000));
    if (days <= 30) aging["0-30"]! += remaining;
    else if (days <= 60) aging["31-60"]! += remaining;
    else if (days <= 90) aging["61-90"]! += remaining;
    else aging["90+"]! += remaining;
  }
  for (const k of Object.keys(aging)) aging[k] = +aging[k]!.toFixed(2);

  const recentInvoices = openInvoices.slice(0, 5).map((i) => ({ number: `${i.seriesCode} ${i.number}`, customer: i.customerName, total: i.totalGrossValue, paid: i.paidAmount, due: i.dueDate }));

  const cashContext = {
    org_name: org.name,
    current_date: today,
    open_receivables: +receivables.toFixed(2),
    open_payables: +payables.toFixed(2),
    cash_balance: cashBalance,
    top_debtors: topDebtors,
    aging,
    recent_invoices: recentInvoices,
  };

  const cashSuggestions = [
    "Ποιοι πελάτες χρωστούν πάνω από 60 ημέρες;",
    "Πότε θα μου λείψει ρευστότητα με βάση τις υποχρεώσεις;",
    "Προτείνετε 3 τρόπους επικοινωνίας με πελάτες που έχουν ληξιπρόθεσμες οφειλές.",
  ];

  // Φορολογικό context (grounded)
  const { profile, financials, opportunities } = await taxAdvisor(db, org);
  const snapshot = await businessSnapshot(db, org);
  const taxContext = {
    org_name: org.name,
    year: financials.year,
    financials,
    profile,
    business: snapshot,
    opportunities: opportunities.map((o) => ({ title: o.title, estimatedBenefit: o.estimatedBenefit, rationale: o.rationale, legalBasis: o.legalBasis })),
    rules: TAX_RULES.map((r) => ({ code: r.code, title: r.title, summary: r.summary, legalBasis: r.legalBasis, effectiveFrom: r.effectiveFrom })),
  };

  return (
    <>
      <PageHeader
        title="Βοηθός AI"
        description="Ένας βοηθός, δύο κόσμοι: ρευστότητα & εισπράξεις ή φορολογικός σχεδιασμός. Βλέπει σε πραγματικό χρόνο τα δεδομένα της επιχείρησης. Υποστηρίζεται από Claude (Anthropic)."
      />
      <Tabs defaultValue={activeTab} className="w-full">
        <TabsList className="h-auto flex-wrap" data-testid="copilot-tabs">
          <TabsTrigger value="cash" data-testid="copilot-tab-cash">Ρευστότητα & Εισπράξεις</TabsTrigger>
          <TabsTrigger value="tax" data-testid="copilot-tab-tax">Φορολογικός σχεδιασμός</TabsTrigger>
        </TabsList>
        <TabsContent value="cash" className="mt-4 space-y-6">
          <CopilotChat context={cashContext} suggestions={cashSuggestions} />
          <CollectionsAgent />
        </TabsContent>
        <TabsContent value="tax" className="mt-4">
          <TaxCopilotChat context={taxContext} />
        </TabsContent>
      </Tabs>
    </>
  );
}
