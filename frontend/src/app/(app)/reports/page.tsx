import { BookText, Download, FileSpreadsheet, ShieldCheck, TrendingUp } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import Link from "next/link";
import { agingReport, classificationReport, f2Report, quarterPeriod, vatReport } from "@/lib/services/reports";
import { buildJournal } from "@/lib/accounting/bridge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { F2Card } from "@/components/reports/f2-card";
import { SalesDimensionsCard } from "@/components/reports/sales-dimensions-card";
import { isSalesDimension, salesByDimension } from "@/lib/services/sales-dimensions";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { orgHasFeature } from "@/lib/billing/limits";
import { inputVatSummary } from "@/lib/services/expenses";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Αναφορές & ΦΠΑ" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const def = quarterPeriod();
  const period = {
    from: typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : def.from,
    to: typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : def.to,
  };
  const dimension = isSalesDimension(sp.dim) ? sp.dim : "salesperson";
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const [vat, classifications, aging, input, f2, journal, dimensions] = await Promise.all([
    vatReport(db, org.id, period),
    classificationReport(db, org.id, period),
    agingReport(db, org.id),
    inputVatSummary(db, org.id, period),
    f2Report(db, org.id, period),
    buildJournal(db, org, period),
    salesByDimension(db, org.id, period, dimension),
  ]);
  const vatPosition = vat.totalVat - input.vat;
  const q = `from=${period.from}&to=${period.to}`;
  const canExcel = orgHasFeature(org, "excelExport");
  const canBridge = orgHasFeature(org, "accountingBridge");

  return (
    <>
      <PageHeader title="Αναφορές & ΦΠΑ" description="Συγκεντρωτικά στοιχεία εσόδων-εξόδων για περιοδική δήλωση ΦΠΑ (Φ2), Ε3, λογιστική γέφυρα ΕΛΠ και παρακολούθηση απαιτήσεων.">
        <DateRangePicker from={period.from} to={period.to} showCompare={false} />
        <Button asChild variant="secondary">
          <Link href="/reports/withholding">
            <ShieldCheck data-icon="inline-start" /> Βεβαιώσεις παρακρατούμενων φόρων
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/reports/profitability" data-testid="profitability-link">
            <TrendingUp data-icon="inline-start" /> Κερδοφορία
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/reports/cashflow">
            <TrendingUp data-icon="inline-start" /> Ταμειακή ρευστότητα (90 ημερών)
          </Link>
        </Button>
        <Button asChild variant={canExcel ? "default" : "outline"}>
          <a href={canExcel ? `/api/reports/export?${q}&format=xlsx` : "/billing"} title={canExcel ? undefined : "Διαθέσιμο από το πακέτο Pro"}>
            <FileSpreadsheet data-icon="inline-start" /> Excel για λογιστή{canExcel ? "" : " (Pro)"}
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download data-icon="inline-start" /> Περισσότερες εξαγωγές
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Έσοδα</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a href={`/api/reports/export?${q}`}>Γραμμές εσόδων (CSV)</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Λογιστική γέφυρα ΕΛΠ</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <a href={`/api/reports/journal?${q}&format=xlsx`}>Ημερολόγιο άρθρων (Excel)</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/api/reports/journal?${q}`}>Ημερολόγιο άρθρων (CSV)</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=accounting">Ρύθμιση λογαριασμών…</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        {dimension !== "salesperson" ? <input type="hidden" name="dim" value={dimension} /> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="from">Από</Label>
          <Input id="from" name="from" type="date" defaultValue={period.from} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">Έως</Label>
          <Input id="to" name="to" type="date" defaultValue={period.to} className="w-44" />
        </div>
        <Button type="submit" variant="secondary">
          Εφαρμογή
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">Προεπιλογή: τρέχον τρίμηνο. Περιλαμβάνονται μόνο εκδοθέντα (μη ακυρωμένα) παραστατικά· τα πιστωτικά αφαιρούνται.</p>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ΦΠΑ εκροών ανά συντελεστή</CardTitle>
            <CardDescription>
              {vat.invoiceCount} παραστατικά · Περίοδος {formatDate(period.from)} – {formatDate(period.to)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Συντελεστής</TableHead>
                  <TableHead className="text-right">Φορολογητέα αξία</TableHead>
                  <TableHead className="text-right">ΦΠΑ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vat.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Δεν υπάρχουν κινήσεις στην περίοδο.
                    </TableCell>
                  </TableRow>
                ) : (
                  vat.rows.map((r) => (
                    <TableRow key={r.rate}>
                      <TableCell>{r.rate < 0 ? "Χωρίς ΦΠΑ (κατ. 8)" : `${r.rate}%`}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.net)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.vat)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Σύνολο</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(vat.totalNet)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(vat.totalVat)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Παρακρατήσεις φόρου (από πελάτες)</div>
                <div className="font-medium tabular-nums">{formatMoney(vat.withheld)}</div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Χαρτόσημο</div>
                <div className="font-medium tabular-nums">{formatMoney(vat.stampDuty)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Έσοδα ανά χαρακτηρισμό Ε3</CardTitle>
            <CardDescription>Όπως διαβιβάζονται στο myDATA (incomeClassification).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Κωδικός Ε3</TableHead>
                  <TableHead>Κατηγορία</TableHead>
                  <TableHead className="text-right">Ποσό</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classifications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Δεν υπάρχουν κινήσεις στην περίοδο.
                    </TableCell>
                  </TableRow>
                ) : (
                  classifications.map((c) => (
                    <TableRow key={`${c.type}${c.category}`}>
                      <TableCell>
                        <div className="font-mono text-xs">{c.type}</div>
                        <div className="text-xs text-muted-foreground">{c.typeLabel}</div>
                      </TableCell>
                      <TableCell className="text-xs">{c.categoryLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>ΦΠΑ εισροών & αποτέλεσμα περιόδου</CardTitle>
            <CardDescription>
              Από τα παραστατικά εξόδων της περιόδου ({input.count} παραστατικά
              {input.pending > 0 ? `, ${input.pending} προς χαρακτηρισμό` : ""}).{" "}
              <Link href="/expenses" className="underline">
                Διαχείριση εξόδων
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">ΦΠΑ εκροών (πωλήσεις)</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(vat.totalVat)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">ΦΠΑ εισροών (εκπιπτόμενος)</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(input.vat)}</div>
                <div className="text-xs text-muted-foreground">Καθαρή αξία εξόδων {formatMoney(input.net)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Μη εκπιπτόμενος ΦΠΑ</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(input.nonDeductible)}</div>
              </div>
              <div className={`rounded-lg border p-3 ${vatPosition > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"}`}>
                <div className="text-xs text-muted-foreground">{vatPosition >= 0 ? "ΦΠΑ για απόδοση" : "Πιστωτικό υπόλοιπο ΦΠΑ"}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Math.abs(vatPosition))}</div>
                <div className="text-xs text-muted-foreground">Ενδεικτικό – επιβεβαιώστε με τον λογιστή σας</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <F2Card f2={f2} period={period} />

        <SalesDimensionsCard report={dimensions} query={q} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookText className="size-4" /> Λογιστική γέφυρα ΕΛΠ
            </CardTitle>
            <CardDescription>Άρθρα ημερολογίου από παραστατικά, εισπράξεις και έξοδα της περιόδου, με τους λογαριασμούς που έχετε ορίσει.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Άρθρα</div>
                <div className="font-medium tabular-nums">{journal.entries}</div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Σύνολο χρεώσεων</div>
                <div className="font-medium tabular-nums">{formatMoney(journal.totalDebit)}</div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Σύνολο πιστώσεων</div>
                <div className="font-medium tabular-nums">{formatMoney(journal.totalCredit)}</div>
              </div>
            </div>
            {canBridge ? (
              <div className="flex flex-wrap items-center gap-2">
                {journal.balanced ? <Badge variant="secondary">Ισοσκελισμένο</Badge> : <Badge variant="destructive">Μη ισοσκελισμένο – ελέγξτε</Badge>}
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/reports/journal?${q}&format=xlsx`}>
                    <FileSpreadsheet data-icon="inline-start" /> Ημερολόγιο Excel
                  </a>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/settings?tab=accounting">Λογαριασμοί ΕΛΠ</Link>
                </Button>
              </div>
            ) : (
              <UpgradeNotice capability="accountingBridge" compact />
            )}
            <p className="text-xs text-muted-foreground">Προεπιλεγμένο σχέδιο λογαριασμών ΕΛΠ (30 Πελάτες, 50 Προμηθευτές, 70–73 Πωλήσεις, 54.00 ΦΠΑ, 60–64 Έξοδα). Αλλάξτε τους κωδικούς για να ταιριάζουν με το πρόγραμμα του λογιστή σας.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ενηλικίωση απαιτήσεων</CardTitle>
            <CardDescription>Ανεξόφλητα υπόλοιπα πελατών ανά ημέρες καθυστέρησης (όλες οι περίοδοι).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-5">
              {aging.buckets.map((b, i) => (
                <div key={b.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{b.label}</div>
                  <div className={`mt-1 text-lg font-semibold tabular-nums ${i >= 3 && b.amount > 0 ? "text-red-700" : i > 0 && b.amount > 0 ? "text-amber-700" : ""}`}>{formatMoney(b.amount)}</div>
                  <div className="text-xs text-muted-foreground">{b.count} παραστατικά</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-right text-sm">
              Σύνολο ανεξόφλητων: <span className="font-semibold tabular-nums">{formatMoney(aging.total)}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
