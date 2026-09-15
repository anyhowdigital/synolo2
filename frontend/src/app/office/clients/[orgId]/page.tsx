import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { profitSummary } from "@/lib/services/profitability";
import { bankTransactions, docRequests, expenses, invoices, officeTasks } from "@/db/schema";
import { resolveFirm, firmClient, ACCESS_LEVELS } from "@/lib/services/firm";
import { orgWatch } from "@/lib/services/org-watch";
import { vatReport, agingReport, classificationReport } from "@/lib/services/reports";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { taxDeadlines } from "@/lib/services/compliance";
import { lockedMonths } from "@/lib/services/periods";
import { formatMoney, round2 } from "@/lib/invoice/totals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function monthPeriod(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default async function Client360Page({ params }: PageProps<"/office/clients/[orgId]">) {
  const { orgId } = await params;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();
  const org = client.org;

  const month = new Date().toISOString().slice(0, 7);
  const period = monthPeriod(month);

  const [watch, vat, aging, pendingMydata, drafts, mydataErrors, tasks, docs, locks, recent] = await Promise.all([
    orgWatch(db, org),
    vatReport(db, org.id, period),
    agingReport(db, org.id),
    listPendingTransmissions(db, org.id),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), eq(expenses.status, "draft"))),
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), eq(invoices.mydataStatus, "error"))),
    db.select().from(officeTasks).where(and(eq(officeTasks.orgId, org.id), eq(officeTasks.status, "open"))),
    db.select().from(docRequests).where(and(eq(docRequests.orgId, org.id), eq(docRequests.status, "open"))),
    lockedMonths(db, org.id),
    db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid", "paid"]), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to)))
      .orderBy(desc(invoices.issueDate))
      .limit(8),
  ]);

  const expensesMonth = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to)));
  const expenseNet = round2(expensesMonth.reduce((s, e) => s + e.netValue, 0));
  const expenseVat = round2(expensesMonth.reduce((s, e) => s + e.vatAmount, 0));
  const unmatchedBank = await db
    .select()
    .from(bankTransactions)
    .where(and(eq(bankTransactions.orgId, org.id), eq(bankTransactions.status, "unmatched")));
  const profit = await profitSummary(db, org.id, period);
  const e3 = await classificationReport(db, org.id, period);
  const deadlines = taxDeadlines(org).items.filter((d) => d.days >= -15 && d.days <= 60);
  const monthLocked = locks.some((l) => l.month === month);

  const kpis: [string, string, string | null][] = [
    ["Σκορ κινδύνου", String(watch.score), watch.level === "green" ? null : "warn"],
    ["Τζίρος μήνα (καθαρός)", formatMoney(vat.totalNet), null],
    ["ΦΠΑ εκροών μήνα", formatMoney(vat.totalVat), null],
    ["ΦΠΑ εισροών μήνα", formatMoney(expenseVat), null],
    ["Εκκρεμή myDATA", String(pendingMydata.length), pendingMydata.length ? "warn" : null],
    ["Απορρίψεις myDATA", String(mydataErrors.length), mydataErrors.length ? "warn" : null],
    ["Αχαρακτήριστα έξοδα", String(drafts.length), drafts.length ? "warn" : null],
    ["Ασυμφώνητες τραπεζικές", String(unmatchedBank.length), unmatchedBank.length ? "warn" : null],
    ["Μεικτό περιθώριο μήνα", `${profit.grossMarginPercent}%`, profit.grossMarginPercent < 10 ? "warn" : null],
    ["Ανεξόφλητα", formatMoney(aging.total), null],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold" data-testid="client360-title">
            {org.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            ΑΦΜ {org.afm} · {org.doy || "—"} · {ACCESS_LEVELS[client.accessLevel].label}
            {monthLocked ? " · περίοδος κλειδωμένη" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/office/clients">← Πελάτες</Link>
          </Button>
          <Button asChild size="sm" variant="outline" data-testid="client360-vat-link">
            <Link href="/office/vat">ΦΠΑ & myDATA</Link>
          </Button>
          {client.accessLevel !== "read" ? (
            <Button asChild size="sm" variant="outline" data-testid="client360-ocr-link">
              <Link href={`/office/clients/${org.id}/ocr`}>Μαζικό OCR αποδείξεων</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline" data-testid="client360-accounting-link">
            <Link href={`/office/clients/${org.id}/accounting`}>Διπλογραφικά</Link>
          </Button>
          <Button asChild size="sm" variant="outline" data-testid="client360-employees-link">
            <Link href={`/office/clients/${org.id}/employees`}>Προσωπικό</Link>
          </Button>
          <Button asChild size="sm" variant="outline" data-testid="client360-payroll-link">
            <Link href={`/office/clients/${org.id}/payroll`}>Μισθοδοσία</Link>
          </Button>
          <Button asChild size="sm" variant="outline" data-testid="client360-assets-link">
            <Link href={`/office/clients/${org.id}/assets`}>Πάγια</Link>
          </Button>
          <Button asChild size="sm" variant="secondary" data-testid="client360-pdf-link">
            <a href={`/api/office/closing/pdf?org=${org.id}&month=${month}`} target="_blank" rel="noreferrer">
              PDF εικόνας μήνα
            </a>
          </Button>
          <Button asChild size="sm" variant="secondary" data-testid="client360-tax-plan-link">
            <Link href={`/office/clients/${org.id}/advisor`}>Σύμβουλος & πλάνο</Link>
          </Button>
          <Button asChild size="sm" variant="secondary" data-testid="client360-bridge-link">
            <Link href={`/office/clients/${org.id}/bridge`}>Γέφυρα λογιστικού</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="client360-kpis">
        {kpis.map(([label, value, tone]) => (
          <Card key={label} className={tone === "warn" ? "border-amber-300" : ""}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="client360-e3">
          <CardHeader>
            <CardTitle className="text-base">Σύνοψη Ε3 (έσοδα κατά χαρακτηρισμό)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {e3.length === 0 ? (
              <p className="text-muted-foreground">Δεν υπάρχουν χαρακτηρισμένα έσοδα στην περίοδο.</p>
            ) : (
              e3.slice(0, 8).map((r) => (
                <div key={`${r.type}-${r.category}`} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                  <span className="min-w-0 truncate" title={`${r.typeLabel} · ${r.categoryLabel}`}>
                    {r.type || "—"} {r.typeLabel ? `· ${r.typeLabel}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatMoney(r.amount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ευρήματα & ανωμαλίες</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-testid="client360-findings">
            {watch.topFindings.length === 0 && watch.anomalies.length === 0 ? (
              <p className="text-muted-foreground">Καθαρή εικόνα, δεν εντοπίστηκαν ευρήματα.</p>
            ) : (
              <>
                {watch.topFindings.map((f) => (
                  <div key={f.title} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                    <span className="min-w-0 truncate">{f.title}</span>
                    <Badge variant={f.severity === "critical" ? "destructive" : "outline"}>{f.severity}</Badge>
                  </div>
                ))}
                {watch.anomalies.map((a) => (
                  <div key={a.code} className="rounded-lg border border-dashed p-2">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.detail}</div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Προθεσμίες</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-testid="client360-deadlines">
            {deadlines.length === 0 ? (
              <p className="text-muted-foreground">Καμία προθεσμία στο επόμενο δίμηνο.</p>
            ) : (
              deadlines.map((d) => (
                <div key={`${d.code}-${d.date}`} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <span className="min-w-0 truncate">{d.title}</span>
                  <Badge variant={d.days < 0 ? "destructive" : d.days <= 7 ? "destructive" : "outline"}>{d.days < 0 ? "εκπρόθεσμο" : `σε ${d.days} ημ.`}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Εκκρεμότητες γραφείου ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-testid="client360-tasks">
            {tasks.length === 0 ? (
              <p className="text-muted-foreground">Καμία ανοιχτή εκκρεμότητα.</p>
            ) : (
              tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <span className="min-w-0 truncate">{t.title}</span>
                  <Badge variant={t.severity === "critical" ? "destructive" : "outline"}>{t.dueDate ?? "χωρίς προθεσμία"}</Badge>
                </div>
              ))
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/office/tasks">Όλες οι εκκρεμότητες →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Έξοδα & έγγραφα μήνα</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-testid="client360-expenses">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Έξοδα μήνα (καθαρά)</span>
              <span className="tabular-nums">{formatMoney(expenseNet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Πλήθος εξόδων</span>
              <span className="tabular-nums">{expensesMonth.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ανοιχτά αιτήματα εγγράφων</span>
              <span className="tabular-nums">{docs.length}</span>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/office/documents">Αιτήματα εγγράφων →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Τελευταία παραστατικά μήνα</CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm" data-testid="client360-recent">
          {recent.length === 0 ? (
            <p className="py-4 text-muted-foreground">Δεν εκδόθηκαν παραστατικά αυτόν τον μήνα.</p>
          ) : (
            recent.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate">
                    {i.seriesCode} {i.number ?? ""} · {i.customerName || "Λιανική"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {i.issueDate} · {i.mydataMark ? `ΜΑΡΚ ${i.mydataMark}` : "χωρίς ΜΑΡΚ"}
                  </div>
                </div>
                <span className="tabular-nums">{formatMoney(i.totalGrossValue)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
