import Link from "next/link";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { AlertTriangle, ArrowRight, CheckSquare, FileText, Euro, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { customerActivities, customers, invitations, invoices, memberships, products } from "@/db/schema";
import { getCurrentOrg } from "@/lib/services/org";
import { dashboardStats, invoiceDisplayNumber, listInvoices } from "@/lib/services/invoices";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";
import { DismissibleAlert } from "@/components/dismissible-alert";
import { PageHeader } from "@/components/page-header";
import { BookChecksCard } from "@/components/dashboard/book-checks-card";
import { clientAlerts } from "@/lib/services/client-alerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge, MyDataStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { SetupChecklist, type SetupStep } from "@/components/dashboard/setup-checklist";
import { ActionCenter, AgingCard, SubscriptionsCard, TopCustomersCard, VatPositionCard } from "@/components/dashboard/dashboard-widgets";
import { CashflowForecastCard } from "@/components/dashboard/cashflow-forecast-card";
import { DashboardCustomize } from "@/components/dashboard/dashboard-customize";
import { advancedDashboard } from "@/lib/services/dashboard";
import { RiskRadarCard } from "@/components/dashboard/risk-radar-card";
import { riskReport } from "@/lib/services/risks";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { TaxAdvisorCard } from "@/components/dashboard/tax-advisor-card";
import { cashflowForecast90 } from "@/lib/services/cashflow";
import { parseDashboardPrefs, visibleWidgets } from "@/lib/services/dashboard-prefs";
import { requireContext } from "@/lib/services/org";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const { membership } = await requireContext(db);
  const prefs = parseDashboardPrefs(membership.dashboardPrefsJson);
  const bookAlerts = await clientAlerts(db, org);
  const [stats, recentPage, tasks, lowStock, advanced] = await Promise.all([
    dashboardStats(db, org.id),    listInvoices(db, org.id, { pageSize: 8, kind: "all" }),
    db
      .select({
        id: customerActivities.id,
        content: customerActivities.content,
        dueAt: customerActivities.dueAt,
        customerId: customerActivities.customerId,
        customerName: customers.name,
      })
      .from(customerActivities)
      .innerJoin(customers, eq(customers.id, customerActivities.customerId))
      .where(and(eq(customerActivities.orgId, org.id), eq(customerActivities.kind, "task"), eq(customerActivities.done, false)))
      .orderBy(asc(customerActivities.dueAt))
      .limit(5),
    db.select().from(products).where(and(eq(products.orgId, org.id), eq(products.trackStock, true))),
    advancedDashboard(db, org),
  ]);
  const forecast = await cashflowForecast90(db, org, advanced.vat.position > 0 ? { vatOutflow: { date: advanced.vat.deadline.date, amount: advanced.vat.position } } : {});
  const risks = await riskReport(db, org);
  const advisor = await taxAdvisor(db, org);
  const recent = recentPage.rows;
  const lowStockItems = lowStock.filter((p) => p.stockQuantity <= p.reorderLevel);

  const [[custCount], [prodCount], [issuedCount], [memberCount], [inviteCount]] = await Promise.all([
    db.select({ n: count() }).from(customers).where(eq(customers.orgId, org.id)),
    db.select({ n: count() }).from(products).where(eq(products.orgId, org.id)),
    db.select({ n: count() }).from(invoices).where(and(eq(invoices.orgId, org.id), ne(invoices.status, "draft"))),
    db.select({ n: count() }).from(memberships).where(eq(memberships.orgId, org.id)),
    db.select({ n: count() }).from(invitations).where(eq(invitations.orgId, org.id)),
  ]);
  const setupSteps: SetupStep[] = [
    { key: "company", label: "Στοιχεία επιχείρησης", description: "ΑΦΜ, ΔΟΥ, διεύθυνση – εμφανίζονται στα παραστατικά.", href: "/settings?tab=company", done: !!(org.afm && org.doy && org.address && org.city) },
    { key: "logo", label: "Λογότυπο & υποσέλιδο", description: "Επαγγελματική εμφάνιση PDF και δημόσιας σελίδας.", href: "/settings?tab=company", done: !!(org.logoDataUrl || org.logoText) },
    { key: "bank", label: "Τραπεζικά στοιχεία (IBAN)", description: "Ο πελάτης βλέπει πού να πληρώσει, με κωδικό RF.", href: "/settings?tab=invoicing", done: !!org.iban },
    { key: "mydata", label: "Σύνδεση με myDATA", description: "Κωδικοί ΑΑΔΕ (User ID & Subscription Key) για πραγματική διαβίβαση.", href: "/settings?tab=mydata", done: org.mydataEnvironment !== "mock" && !!org.mydataUserId && !!org.mydataSubscriptionKey },
    { key: "customer", label: "Πρώτος πελάτης", description: "Καταχώριση με αυτόματη αναζήτηση VIES.", href: "/customers/new", done: custCount.n > 0 },
    { key: "product", label: "Είδη / υπηρεσίες", description: "Με ΦΠΑ και χαρακτηρισμό myDATA προ-ρυθμισμένα.", href: "/products", done: prodCount.n > 0 },
    { key: "invoice", label: "Πρώτο παραστατικό", description: "Έκδοση, PDF και αποστολή στον πελάτη.", href: "/invoices/new", done: issuedCount.n > 0 },
    { key: "team", label: "Πρόσκληση λογιστή ή συνεργάτη", description: "Ρόλος «Λογιστής» με δικαιώματα μόνο για ανάγνωση.", href: "/settings?tab=users", done: memberCount.n > 1 || inviteCount.n > 0 },
  ];

  const prev = stats.months[stats.months.length - 2];  const delta = (current: number, previous: number) => {
    if (!previous) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
  };

  const kpis = [
    {
      label: "Τιμολογημένα καθαρά (τρέχων μήνας)",
      value: formatMoney(stats.revenueMonth),
      icon: Euro,
      hint: `${stats.invoicesThisMonth} παραστατικά μήνα · χωρίς ΦΠΑ`,
      change: delta(stats.revenueMonth, prev?.net ?? 0),
      changeHint: prev ? `Προηγούμενος μήνας: ${formatMoney(prev.net)}` : null,
    },
    {
      label: "ΦΠΑ εκροών (τρέχων μήνας)",
      value: formatMoney(stats.vatMonth),
      icon: Receipt,
      hint: "Ενδεικτικό, προς απόδοση",
      change: delta(stats.vatMonth, prev?.vat ?? 0),
      changeHint: prev ? `Προηγούμενος μήνας: ${formatMoney(prev.vat)}` : null,
    },
    {
      label: "Εισπράξεις (τρέχων μήνας)",
      value: formatMoney(stats.months[stats.months.length - 1]?.collected ?? 0),
      icon: Wallet,
      hint: `Ανεξόφλητα σύνολο: ${formatMoney(stats.outstanding)}`,
      change: delta(stats.months[stats.months.length - 1]?.collected ?? 0, prev?.collected ?? 0),
      changeHint: prev ? `Προηγούμενος μήνας: ${formatMoney(prev.collected)}` : null,
    },
    {
      label: "Ληξιπρόθεσμα (σύνολο)",
      value: formatMoney(stats.overdueAmount),
      icon: AlertTriangle,
      hint: stats.overdueCount ? `${stats.overdueCount} παραστατικά σε καθυστέρηση` : "Καμία καθυστέρηση",
      change: null,
      changeHint: `Εκκρεμή myDATA: ${stats.pendingMyDataCount}`,
    },
  ];

  const widgetMap: Record<string, React.ReactNode> = {
    actions: <ActionCenter queue={advanced.queue} />,
    risks: <RiskRadarCard report={risks} />,
    quick: (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Γρήγορες ενέργειες</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices/new">Νέο παραστατικό</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/pos">Ταμείο λιανικής</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses">Νέο έξοδο</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports">Αναφορές & ΦΠΑ</Link>
          </Button>
        </CardContent>
      </Card>
    ),
    chart12m: (
      <Card>
        <CardHeader>
          <CardTitle>Έσοδα, έξοδα & εισπράξεις 12μήνου</CardTitle>
          <CardDescription>Καθαρή αξία εκδοθέντων (μετά πιστωτικών), καθαρές δαπάνες προμηθευτών και πραγματικές εισπράξεις ανά μήνα.</CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart data={stats.months} />
        </CardContent>
      </Card>
    ),
    forecast: <CashflowForecastCard startingCash={forecast.startingCash} scenarios={forecast.scenarios} vatOutflow={forecast.vatOutflow} predicted={forecast.predicted} />,
    vat: (
      <VatPositionCard
        outputs={advanced.vat.outputs}
        inputs={advanced.vat.inputs}
        position={advanced.vat.position}
        deadlineDate={advanced.vat.deadline.date}
        deadlineDays={advanced.vat.deadline.days}
        periodLabel={`${formatDate(advanced.vat.period.from)} – ${formatDate(advanced.vat.period.to)}`}
      />
    ),
    aging: <AgingCard buckets={advanced.aging.buckets} total={advanced.aging.total} />,
    top: <TopCustomersCard rows={advanced.topCustomers} />,
    subs: <SubscriptionsCard active={advanced.subscriptions.active} autoCharge={advanced.subscriptions.autoCharge} mrr={advanced.subscriptions.mrr} nextRun={advanced.subscriptions.nextRun} />,
    recent: (
      <Card>
        <CardHeader>
          <CardTitle>Πρόσφατα παραστατικά</CardTitle>
          <CardDescription>Τα τελευταία 8 παραστατικά που καταχωρήθηκαν.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Δεν υπάρχουν παραστατικά ακόμη.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Αριθμός</TableHead>
                    <TableHead>Πελάτης</TableHead>
                    <TableHead className="hidden md:table-cell">Ημ/νία</TableHead>
                    <TableHead className="text-right">Σύνολο</TableHead>
                    <TableHead className="hidden sm:table-cell">Κατάσταση</TableHead>
                    <TableHead className="hidden lg:table-cell">myDATA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                          {invoiceDisplayNumber(inv)}
                        </Link>
                        <div className="text-xs text-muted-foreground">{getDocumentType(inv.invoiceType).short}</div>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">{inv.customerName || "Λιανική"}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatDate(inv.issueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {getDocumentType(inv.invoiceType).credit ? "-" : ""}
                        {formatMoney(inv.totalGrossValue, inv.currency)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {inv.status === "draft" ? <span className="text-xs text-muted-foreground">—</span> : <MyDataStatusBadge status={inv.mydataStatus} mark={inv.mydataMark} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button asChild variant="ghost" size="sm">
              <Link href="/invoices">
                Όλα τα παραστατικά <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    ),
    tasks: (
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="size-4" /> Εκκρεμείς εργασίες πελατών
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Δεν υπάρχουν ανοιχτές εργασίες.</p>
            ) : (
              tasks.map((t) => (
                <Link key={t.id} href={`/customers/${t.customerId}`} className="block rounded-md border p-3 text-sm hover:bg-muted/50">
                  <div className="font-medium">{t.customerName}</div>
                  <div className="text-muted-foreground">{t.content}</div>
                  {t.dueAt ? <div className="mt-1 text-xs text-muted-foreground">Έως {formatDate(t.dueAt)}</div> : null}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        {lowStockItems.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> Χαμηλό απόθεμα
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lowStockItems.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-amber-700">{p.stockQuantity} τεμ.</span>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
                <Link href="/inventory">Διαχείριση αποθήκης</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    ),
  };
  const mainWidgets = visibleWidgets(prefs, false);
  const sideWidgets = visibleWidgets(prefs, true);

  return (
    <>
      <PageHeader title="Επισκόπηση" description={`Καλώς ήρθατε. Συνοπτική εικόνα για ${org.name}.`}>
        <DashboardCustomize hidden={prefs.hidden} order={prefs.order} />
      </PageHeader>

      {sp.office === "denied" && <Alert className="mb-6" data-testid="office-access-explanation"><AlertTitle>Βρίσκεστε στην πύλη της επιχείρησης</AlertTitle><AlertDescription>Η πύλη λογιστή αφορά συνδεδεμένο λογιστικό γραφείο. Για συνεργασία με τον λογιστή σας, ανοίξτε <Link href="/settings?tab=accountant" className="underline" data-testid="office-access-settings-link">Ρυθμίσεις → Λογιστής</Link>. Τα στοιχεία της επιχείρησής σας παραμένουν εδώ.</AlertDescription></Alert>}
      <SetupChecklist steps={setupSteps} />

      {stats.pendingMyDataCount > 0 ? (
        <DismissibleAlert storageKey={`mydata-pending-${stats.pendingMyDataCount}`} className="mb-6">
          <Alert className="border-amber-200 bg-amber-50 pr-12 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle />
            <AlertTitle>Υπάρχουν {stats.pendingMyDataCount} εκδοθέντα παραστατικά που δεν έχουν διαβιβαστεί στο myDATA.</AlertTitle>
            <AlertDescription>
              Σύμφωνα με την Α.1138/2020 η διαβίβαση εσόδων πρέπει να γίνεται σε πραγματικό χρόνο ή εντός των προβλεπόμενων προθεσμιών.{" "}
              <Link href="/invoices?mydata=pending" className="font-medium underline">
                Δείτε τα εκκρεμή
              </Link>
            </AlertDescription>
          </Alert>
        </DismissibleAlert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} data-testid={`kpi-${k.label}`}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{k.label}</span>
                <k.icon className="size-4 shrink-0 text-muted-foreground" />
              </CardDescription>
              <CardTitle className="flex flex-wrap items-baseline gap-2 text-2xl tabular-nums">
                {k.value}
                {k.change !== null ? (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      k.change >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                    }`}
                    title={k.changeHint ?? undefined}
                  >
                    {k.change >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {k.change > 0 ? "+" : ""}
                    {k.change.toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              <div className="truncate">{k.hint}</div>
              {k.changeHint ? <div className="truncate">{k.changeHint}</div> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="grid min-w-0 gap-6 sm:grid-cols-2 lg:col-span-2">
          {mainWidgets.map((w) => (
            <div key={w.key} className={w.full ? "min-w-0 sm:col-span-2" : "min-w-0"}>
              {widgetMap[w.key]}
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <BookChecksCard alerts={bookAlerts} />
          <TaxAdvisorCard opportunities={advisor.active.slice(0, 4)} totalBenefit={advisor.totalBenefit} />
          {sideWidgets.map((w) => <div key={w.key}>{widgetMap[w.key]}</div>)}
        </div>
      </div>
    </>
  );
}
