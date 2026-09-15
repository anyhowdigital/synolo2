import { and, desc, eq, gte, lte, ne, inArray } from "drizzle-orm";
import { ArrowDownRight, ArrowUpRight, Calendar, TrendingDown, TrendingUp } from "lucide-react";
import { getDb } from "@/db";
import { invoices, expenses, cashAccounts, cashEntries, payments, expensePayments, recurringTemplates } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { CashflowChart } from "@/components/reports/cashflow-chart";
import { paymentBehaviourByCustomer, predictPayment } from "@/lib/services/payment-prediction";

export const metadata = { title: "Ταμειακή ρευστότητα · Πρόβλεψη 90 ημερών" };

interface FlowItem {
  date: string;
  amount: number;
  kind: "invoice" | "recurring" | "expense" | "vat";
  label: string;
  status: "confirmed" | "expected";
}

function addDays(d: string, days: number) {
  const t = new Date(d);
  t.setDate(t.getDate() + days);
  return t.toISOString().slice(0, 10);
}

export default async function CashflowPage() {
  const db = await getDb();
  const { org } = await requireContext(db);
  const today = new Date().toISOString().slice(0, 10);
  const horizonEnd = addDays(today, 90);

  // Τρέχον υπόλοιπο = openingBalance + κινήσεις όλες μαζί (εισπράξεις, πληρωμές, cash entries)
  const accounts = await db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, org.id), eq(cashAccounts.active, true)));
  const pays = await db.select().from(payments).where(eq(payments.orgId, org.id));
  const exPays = await db.select().from(expensePayments).where(eq(expensePayments.orgId, org.id));
  const entries = await db.select().from(cashEntries).where(eq(cashEntries.orgId, org.id));
  const opening = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const inflow = pays.reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const outflow = exPays.reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
  const currentCash = opening + inflow - outflow;

  // 1) Ανεξόφλητα τιμολόγια πελατών (issued/partially_paid) → εισροές στη dueDate ή +30 ημέρες από issue.
  const openInvoices = await db.select().from(invoices).where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid"])));
  const behaviours = await paymentBehaviourByCustomer(db, org.id);
  const items: FlowItem[] = [];
  for (const inv of openInvoices) {
    const remaining = +(inv.totalGrossValue - inv.paidAmount).toFixed(2);
    if (remaining <= 0.005) continue;
    const prediction = predictPayment(org, inv, inv.customerId ? behaviours.get(inv.customerId) : undefined, today);
    const expected = prediction.expectedDate;
    if (expected < today || expected > horizonEnd) continue;
    items.push({
      date: expected,
      amount: remaining,
      kind: "invoice",
      label: `${inv.customerName || "Πελάτης"} · ${inv.seriesCode} ${inv.number}${prediction.daysAfterDue > 0 ? ` · πρόβλεψη +${prediction.daysAfterDue} ημ.` : ""}`,
      status: prediction.daysAfterDue > 0 || prediction.overdueShift ? "expected" : "confirmed",
    });
  }

  // 2) Ανεξόφλητα έξοδα → εκροές στη dueDate ή +30 ημέρες
  const openExpenses = await db.select().from(expenses).where(and(eq(expenses.orgId, org.id), ne(expenses.status, "rejected")));
  for (const ex of openExpenses) {
    const remaining = +(ex.grossValue - ex.paidAmount).toFixed(2);
    if (remaining <= 0.005) continue;
    const expected = ex.dueDate ?? addDays(ex.issueDate, 30);
    if (expected < today || expected > horizonEnd) continue;
    items.push({ date: expected, amount: -remaining, kind: "expense", label: `${ex.supplierName || "Προμηθευτής"} · ${ex.series ?? ""} ${ex.number ?? ""}`, status: "confirmed" });
  }

  // 3) Επαναλαμβανόμενα → εκτιμώμενες εισροές στα nextRunAt + termsDays
  const templates = await db.select().from(recurringTemplates).where(and(eq(recurringTemplates.orgId, org.id), eq(recurringTemplates.active, true)));
  for (const t of templates) {
    if (t.nextRunAt < today || t.nextRunAt > horizonEnd) continue;
    // υπολογισμός αξίας από linesJson
    let gross = 0;
    try {
      const parsed = JSON.parse(t.linesJson) as Array<{ quantity?: number; unitPrice?: number; vatCategory?: number }>;
      for (const l of parsed) {
        const net = (l.quantity ?? 1) * (l.unitPrice ?? 0);
        const rate = l.vatCategory === 2 ? 0.13 : l.vatCategory === 3 ? 0.06 : 0.24;
        gross += net * (1 + rate);
      }
    } catch { /* ignore */ }
    if (gross > 0.005) {
      const expected = addDays(t.nextRunAt, org.defaultPaymentTermsDays);
      if (expected <= horizonEnd) items.push({ date: expected, amount: +gross.toFixed(2), kind: "recurring", label: `Επαναλαμβανόμενο: ${t.name}`, status: "expected" });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));

  // Weekly buckets για γράφημα
  const weekly: { label: string; inflow: number; outflow: number; running: number }[] = [];
  let running = currentCash;
  for (let w = 0; w < 13; w++) {
    const from = addDays(today, w * 7);
    const to = addDays(today, (w + 1) * 7);
    const inW = items.filter((i) => i.date >= from && i.date < to);
    const inflow = inW.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
    const outflow = inW.filter((i) => i.amount < 0).reduce((s, i) => s + Math.abs(i.amount), 0);
    running += inflow - outflow;
    weekly.push({ label: `Εβδ. ${w + 1}`, inflow: +inflow.toFixed(2), outflow: +outflow.toFixed(2), running: +running.toFixed(2) });
  }
  const minPoint = weekly.reduce((min, w) => (w.running < min.running ? w : min), weekly[0] ?? { label: "-", running: currentCash });
  const projectedIn = items.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
  const projectedOut = items.filter((i) => i.amount < 0).reduce((s, i) => s + Math.abs(i.amount), 0);

  return (
    <>
      <PageHeader title="Ταμειακή ρευστότητα · 90 ημέρες" description="Πρόβλεψη ταμειακών ροών από ανεξόφλητα τιμολόγια, έξοδα και επαναλαμβανόμενα. Δείτε πότε θα πέσει η ρευστότητα." />

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Τρέχον υπόλοιπο</CardDescription><CardTitle className="text-2xl tabular-nums">{formatMoney(currentCash)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Άθροισμα λογαριασμών ταμείου/τραπεζών.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Αναμενόμενες εισροές (90 ημ.)</CardDescription><CardTitle className="text-2xl tabular-nums text-emerald-700 flex items-center gap-2"><TrendingUp className="size-5" />{formatMoney(projectedIn)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Από ανοιχτά τιμολόγια και επαναλαμβανόμενα.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Αναμενόμενες εκροές (90 ημ.)</CardDescription><CardTitle className="text-2xl tabular-nums text-red-700 flex items-center gap-2"><TrendingDown className="size-5" />{formatMoney(projectedOut)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Από ανοιχτά παραστατικά αγορών.</CardContent>
        </Card>
        <Card className={minPoint.running < 0 ? "border-red-300 bg-red-50 dark:bg-red-950/30" : minPoint.running < currentCash * 0.5 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : ""}>
          <CardHeader className="pb-2"><CardDescription>Ελάχιστο σημείο</CardDescription><CardTitle className="text-2xl tabular-nums flex items-center gap-2"><Calendar className="size-5" />{formatMoney(minPoint.running)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{minPoint.label} — {minPoint.running < 0 ? "Προσοχή: αρνητικό ταμείο!" : minPoint.running < currentCash * 0.5 ? "Χαμηλή ρευστότητα προβλεπόμενη." : "Ρευστότητα σταθερή."}</CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Εβδομαδιαία πρόβλεψη</CardTitle>
            <CardDescription>Cumulative υπόλοιπο ταμείου ανά εβδομάδα.</CardDescription>
          </CardHeader>
          <CardContent>
            <CashflowChart data={weekly} startingCash={currentCash} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Επόμενες κινήσεις</CardTitle>
            <CardDescription>Τα προσεχή τιμολόγια και έξοδα που περιμένουμε να πληρωθούν.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ημ/νία</TableHead>
                  <TableHead>Περιγραφή</TableHead>
                  <TableHead className="text-right">Ποσό</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Καμία αναμενόμενη κίνηση στις επόμενες 90 ημέρες.</TableCell></TableRow>
                ) : items.slice(0, 30).map((it, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{new Date(it.date).toLocaleDateString("el-GR")}</TableCell>
                    <TableCell className="text-sm">
                      <span className="mr-2 inline-block">
                        {it.amount > 0 ? <ArrowUpRight className="inline size-3.5 text-emerald-600" /> : <ArrowDownRight className="inline size-3.5 text-red-600" />}
                      </span>
                      {it.label}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${it.amount > 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(Math.abs(it.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
