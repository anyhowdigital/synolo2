import Link from "next/link";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { resolveRange } from "@/lib/date-range";
import { DateRangePicker } from "@/components/date-range-picker";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/invoice/totals";
import { balanceSheet, canManageBooks, canViewBooks, chart, incomeStatement, listEntries, PLAN_LABELS, trialBalance, type Plan } from "@/lib/services/gl";
import { getCurrentUser } from "@/lib/auth/session";
import { DeleteEntryButton, EnableDoubleEntry, GlToolbar, ManualEntryForm } from "@/components/accounting/gl-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Διπλογραφικά · Γενική Λογιστική" };

const TYPE_LABELS: Record<string, string> = { asset: "Ενεργητικό", liability: "Υποχρεώσεις", equity: "Καθαρή θέση", income: "Έσοδα", expense: "Έξοδα" };

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; tab?: string }> }) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const period = { from: range.from, to: range.to };
  const tab = sp.tab ?? "trial";
  const db = await getDb();
  const { org } = await requireContext(db);
  const user = (await getCurrentUser(db))!;
  const canView = await canViewBooks(db, org.id, user.id);
  const canManage = await canManageBooks(db, org.id, user.id);

  if (!canView) {
    return (
      <PageHeader
        title="Διπλογραφικά (Γ' κατηγορίας)"
        description="Τα ευαίσθητα λογιστικά στοιχεία είναι διαθέσιμα μόνο στον ιδιοκτήτη/διαχειριστή της επιχείρησης και στο συνεργαζόμενο λογιστικό γραφείο."
      />
    );
  }

  if (org.booksCategory !== "double" || !org.accountingPlan) {
    return (
      <>
        <PageHeader title="Διπλογραφικά (Γ' κατηγορίας)" description="Γενική λογιστική με λογιστικό σχέδιο, ημερολόγιο άρθρων, ισοζύγιο, ισολογισμό και κατάσταση αποτελεσμάτων κατά ΕΛΠ." />
        {canManage ? (
          <EnableDoubleEntry />
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="gl-readonly-notice">
            Τα διπλογραφικά τα ενεργοποιεί και τα τηρεί ο λογιστής σας από την πύλη λογιστικού γραφείου. Αν θέλετε να τα διαχειρίζεστε και εσείς, ενεργοποιήστε το από τις Ρυθμίσεις → Λογιστής.
          </p>
        )}
      </>
    );
  }

  const EMPTY_IS = { revenue: 0, otherIncome: 0, cogs: 0, payroll: 0, services: 0, taxes: 0, other: 0, depreciation: 0, operating: 0, interest: 0, net: 0 };
  const EMPTY_BS = { assets: { fixed: 0, inventory: 0, receivables: 0, cash: 0, total: 0 }, equity: { capital: 0, result: 0, total: 0 }, liabilities: { longTerm: 0, suppliers: 0, taxesDue: 0, social: 0, other: 0, total: 0 }, difference: 0 };
  const accounts = await chart(db, org.id);
  // Tab-aware φόρτωση: υπολογίζουμε ΜΟΝΟ τα δεδομένα του ενεργού tab (αποφυγή περιττών βαριών queries).
  const [tb, entries, is, bs] = await Promise.all([
    tab === "trial" ? trialBalance(db, org.id, period) : Promise.resolve([] as Awaited<ReturnType<typeof trialBalance>>),
    tab === "journal" ? listEntries(db, org.id, period) : Promise.resolve([] as Awaited<ReturnType<typeof listEntries>>),
    tab === "pl" ? incomeStatement(db, org.id, period) : Promise.resolve(EMPTY_IS),
    tab === "bs" ? balanceSheet(db, org.id, period) : Promise.resolve(EMPTY_BS),
  ]);

  const totalDebit = tb.reduce((s, r) => s + r.debit, 0);
  const totalCredit = tb.reduce((s, r) => s + r.credit, 0);
  const q = `from=${period.from}&to=${period.to}`;

  return (
    <>
      <PageHeader title="Διπλογραφικά · Γενική Λογιστική" description={`${PLAN_LABELS[org.accountingPlan as Plan] ?? org.accountingPlan} · ${accounts.length} λογαριασμοί`}>
        <DateRangePicker from={period.from} to={period.to} showCompare={false} />
      </PageHeader>

      {canManage ? (
        <div className="mb-4">
          <GlToolbar from={period.from} to={period.to} year={Number(period.to.slice(0, 4))} />
        </div>
      ) : (
        <p className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="gl-readonly-notice">
          Προβολή μόνο για ανάγνωση — τα άρθρα τηρεί ο λογιστής σας. Οι αλλαγές γίνονται από την πύλη του γραφείου.
        </p>
      )}

      <Tabs defaultValue={tab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="trial" asChild>
            <Link href={`/accounting?${q}&tab=trial`} data-testid="gl-tab-trial">Ισοζύγιο</Link>
          </TabsTrigger>
          <TabsTrigger value="journal" asChild>
            <Link href={`/accounting?${q}&tab=journal`} data-testid="gl-tab-journal">Ημερολόγιο</Link>
          </TabsTrigger>
          <TabsTrigger value="pl" asChild>
            <Link href={`/accounting?${q}&tab=pl`} data-testid="gl-tab-pl">Αποτελέσματα</Link>
          </TabsTrigger>
          <TabsTrigger value="bs" asChild>
            <Link href={`/accounting?${q}&tab=bs`} data-testid="gl-tab-bs">Ισολογισμός</Link>
          </TabsTrigger>
          <TabsTrigger value="chart" asChild>
            <Link href={`/accounting?${q}&tab=chart`} data-testid="gl-tab-chart">Λογιστικό σχέδιο</Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trial">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ισοζύγιο περιόδου</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table data-testid="gl-trial-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Κωδικός</TableHead>
                    <TableHead>Λογαριασμός</TableHead>
                    <TableHead className="text-right">Χρέωση</TableHead>
                    <TableHead className="text-right">Πίστωση</TableHead>
                    <TableHead className="text-right">Υπόλοιπο</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tb.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        Δεν υπάρχουν άρθρα στην περίοδο. Πατήστε «Δημιουργία άρθρων από παραστατικά».
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {tb.map((r) => (
                        <TableRow key={r.code}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>
                            <Link href={`/accounting/ledger/${encodeURIComponent(r.code)}?${q}`} className="hover:underline">
                              {r.name}
                            </Link>
                            <Badge variant="outline" className="ml-2">{TYPE_LABELS[r.type] ?? r.type}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(r.debit)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(r.credit)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(r.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2}>Σύνολα</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(totalDebit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(totalCredit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(totalDebit - totalCredit)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal" className="space-y-4">
          {canManage ? <ManualEntryForm accounts={accounts.map((a) => ({ code: a.code, name: a.name }))} /> : null}
          <div className="space-y-3" data-testid="gl-journal">
            {entries.map(({ entry, lines }) => (
              <Card key={entry.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      #{entry.entryNo} · {entry.entryDate} · {entry.description}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.sourceType}</Badge>
                      {canManage ? <DeleteEntryButton id={entry.id} /> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-sm">
                  {lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs">{l.accountCode}</span> {l.accountName}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {l.debit ? `Χ ${formatMoney(l.debit)}` : ""} {l.credit ? `Π ${formatMoney(l.credit)}` : ""}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
            {entries.length === 0 ? <p className="text-sm text-muted-foreground">Δεν υπάρχουν άρθρα στην περίοδο.</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="pl">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Κατάσταση Αποτελεσμάτων (ΕΛΠ Β.2.1)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm" data-testid="gl-pl">
              {[
                ["Κύκλος εργασίας", is.revenue],
                ["Λοιπά έσοδα", is.otherIncome],
                ["Κόστος πωληθέντων / αγορές", -is.cogs],
                ["Αμοιβές προσωπικού", -is.payroll],
                ["Παροχές & αμοιβές τρίτων", -is.services],
                ["Φόροι & τέλη", -is.taxes],
                ["Διάφορα έξοδα", -is.other],
                ["Αποσβέσεις", -is.depreciation],
                ["Αποτέλεσμα εκμετάλλευσης", is.operating],
                ["Χρηματοοικονομικά έξοδα", -is.interest],
                ["Καθαρό αποτέλεσμα προ φόρων", is.net],
              ].map(([label, value], i) => (
                <div key={label as string} className={`flex items-center justify-between gap-2 border-b py-1.5 last:border-0 ${i >= 8 ? "font-semibold" : ""}`}>
                  <span>{label}</span>
                  <span className="tabular-nums">{formatMoney(value as number)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ενεργητικό</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm" data-testid="gl-bs-assets">
                {[
                  ["Πάγια", bs.assets.fixed],
                  ["Αποθέματα", bs.assets.inventory],
                  ["Απαιτήσεις", bs.assets.receivables],
                  ["Ταμειακά διαθέσιμα", bs.assets.cash],
                  ["Σύνολο ενεργητικού", bs.assets.total],
                ].map(([l, v], i) => (
                  <div key={l as string} className={`flex justify-between border-b py-1.5 last:border-0 ${i === 4 ? "font-semibold" : ""}`}>
                    <span>{l}</span>
                    <span className="tabular-nums">{formatMoney(v as number)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Καθαρή θέση & Υποχρεώσεις</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm" data-testid="gl-bs-liabilities">
                {[
                  ["Κεφάλαιο & αποθεματικά", bs.equity.capital],
                  ["Αποτέλεσμα χρήσης", bs.equity.result],
                  ["Σύνολο καθαρής θέσης", bs.equity.total],
                  ["Μακροπρόθεσμες υποχρεώσεις", bs.liabilities.longTerm],
                  ["Προμηθευτές", bs.liabilities.suppliers],
                  ["Φόροι - τέλη", bs.liabilities.taxesDue],
                  ["Ασφαλιστικοί οργανισμοί", bs.liabilities.social],
                  ["Λοιπές υποχρεώσεις", bs.liabilities.other],
                  ["Σύνολο υποχρεώσεων", bs.liabilities.total],
                ].map(([l, v], i) => (
                  <div key={l as string} className={`flex justify-between border-b py-1.5 last:border-0 ${i === 2 || i === 8 ? "font-semibold" : ""}`}>
                    <span>{l}</span>
                    <span className="tabular-nums">{formatMoney(v as number)}</span>
                  </div>
                ))}
                {Math.abs(bs.difference) > 0.01 ? (
                  <p className="pt-2 text-xs text-destructive">Διαφορά ισολογισμού {formatMoney(bs.difference)} — ελέγξτε ανοίγματα υπολοίπων και άρθρα.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chart">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Λογιστικό σχέδιο</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table data-testid="gl-chart-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Κωδικός</TableHead>
                    <TableHead>Περιγραφή</TableHead>
                    <TableHead>Τύπος</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.code}</TableCell>
                      <TableCell>{a.name}</TableCell>
                      <TableCell>{TYPE_LABELS[a.type] ?? a.type}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
