import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { customerProfitability, itemProfitability, projectProfitability, profitSummary } from "@/lib/services/profitability";
import { formatMoney } from "@/lib/invoice/totals";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Κερδοφορία" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "customers", label: "Ανά πελάτη" },
  { key: "projects", label: "Ανά έργο" },
  { key: "items", label: "Ανά είδος" },
];

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function MarginBadge({ value }: { value: number }) {
  return <Badge variant={value >= 30 ? "secondary" : value >= 10 ? "outline" : "destructive"}>{value}%</Badge>;
}

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.some((t) => t.key === sp.tab) ? sp.tab : "customers";
  const today = new Date();
  const defFrom = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 10);
  const from = typeof sp.from === "string" && dateRe.test(sp.from) ? sp.from : defFrom;
  const to = typeof sp.to === "string" && dateRe.test(sp.to) ? sp.to : today.toISOString().slice(0, 10);
  const period = { from, to };

  const db = await getDb();
  const { org } = await requireContext(db);
  const [summary, customers, projectsRows, items] = await Promise.all([
    profitSummary(db, org.id, period),
    customerProfitability(db, org.id, period),
    projectProfitability(db, org.id, period),
    itemProfitability(db, org.id, period),
  ]);

  const kpis: [string, string, string | null][] = [
    ["Πωλήσεις (καθαρές)", formatMoney(summary.sales), null],
    ["Κόστος πωληθέντων", formatMoney(summary.cogs), null],
    ["Μεικτό κέρδος", formatMoney(summary.grossProfit), summary.grossProfit < 0 ? "warn" : null],
    ["Μεικτό περιθώριο", `${summary.grossMarginPercent}%`, summary.grossMarginPercent < 10 ? "warn" : null],
    ["Έξοδα περιόδου", formatMoney(summary.expenseNet), null],
    ["Καθαρό αποτέλεσμα", formatMoney(summary.netProfit), summary.netProfit < 0 ? "warn" : null],
  ];

  const tabHref = (key: string) => `/reports/profitability?tab=${key}&from=${from}&to=${to}`;
  const top = [...customers].slice(0, 5);
  const bottom = [...customers].reverse().slice(0, 5);

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/reports">
            <ArrowLeft data-icon="inline-start" /> Αναφορές
          </Link>
        </Button>
      </div>
      <PageHeader title="Κερδοφορία" description="Καθαρό αποτέλεσμα ανά πελάτη, έργο και είδος από τα ήδη καταχωρημένα παραστατικά, τον χρόνο εργασίας και το κόστος αποθήκης.">
        <Button asChild variant="secondary">
          <a href={`/api/reports/profitability.csv?tab=${tab}&from=${from}&to=${to}`} data-testid="profit-export-csv">
            Εξαγωγή CSV
          </a>
        </Button>
      </PageHeader>

      <form className="mb-4 flex flex-wrap items-end gap-3" data-testid="profit-period-form">
        <input type="hidden" name="tab" value={tab} />
        <DateRangePicker from={from} to={to} showCompare={false} />
        <div className="grid gap-1">
          <Label htmlFor="from" className="text-xs">
            Από
          </Label>
          <Input id="from" name="from" type="date" defaultValue={from} data-testid="profit-from" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="to" className="text-xs">
            Έως
          </Label>
          <Input id="to" name="to" type="date" defaultValue={to} data-testid="profit-to" />
        </div>
        <Button type="submit" variant="secondary" data-testid="profit-apply">
          Εφαρμογή
        </Button>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="profit-kpis">
        {kpis.map(([label, value, warn]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`mt-1 text-xl font-semibold ${warn ? "text-destructive" : ""}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} asChild variant={t.key === tab ? "default" : "outline"} size="sm">
            <Link href={tabHref(t.key)} data-testid={`profit-tab-${t.key}`}>
              {t.label}
            </Link>
          </Button>
        ))}
      </div>

      {tab === "customers" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 5 σε μεικτό κέρδος</CardTitle>
              </CardHeader>
              <CardContent className="divide-y text-sm" data-testid="profit-top5">
                {top.length === 0 ? <p className="text-muted-foreground">Δεν υπάρχουν πωλήσεις στην περίοδο.</p> : top.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                    <span className="truncate">{c.name}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {formatMoney(c.grossProfit)} <MarginBadge value={c.marginPercent} />
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bottom 5 (προσοχή)</CardTitle>
              </CardHeader>
              <CardContent className="divide-y text-sm" data-testid="profit-bottom5">
                {bottom.length === 0 ? <p className="text-muted-foreground">—</p> : bottom.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                    <span className="truncate">{c.name}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {formatMoney(c.grossProfit)} <MarginBadge value={c.marginPercent} />
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Κερδοφορία ανά πελάτη</CardTitle>
              <CardDescription>Το κόστος πωληθέντων υπολογίζεται από το μέσο σταθμικό κόστος των ειδών.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table data-testid="profit-customers-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Πελάτης</TableHead>
                    <TableHead className="text-right">Πωλήσεις</TableHead>
                    <TableHead className="text-right">Κόστος</TableHead>
                    <TableHead className="text-right">Μεικτό κέρδος</TableHead>
                    <TableHead className="text-center">Περιθώριο</TableHead>
                    <TableHead className="text-right">Εισπραχθέντα</TableHead>
                    <TableHead className="text-right">Ανεξόφλητα</TableHead>
                    <TableHead className="text-center">Μ.Ο. ημερών</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Δεν υπάρχουν πωλήσεις στην περίοδο.
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(c.sales)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(c.cogs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(c.grossProfit)}</TableCell>
                        <TableCell className="text-center">
                          <MarginBadge value={c.marginPercent} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(c.collected)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(c.outstanding)}</TableCell>
                        <TableCell className="text-center tabular-nums">{c.avgDaysToPay ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "projects" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Κερδοφορία ανά έργο</CardTitle>
            <CardDescription>Έσοδα από χρεώσιμες ώρες και μετακυλιόμενα έξοδα, κόστος από τα έξοδα έργου.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table data-testid="profit-projects-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Έργο</TableHead>
                  <TableHead>Πελάτης</TableHead>
                  <TableHead className="text-center">Ώρες</TableHead>
                  <TableHead className="text-center">Χρεώσιμες</TableHead>
                  <TableHead className="text-right">Έσοδα</TableHead>
                  <TableHead className="text-right">Τιμολογημένα</TableHead>
                  <TableHead className="text-right">Κόστος</TableHead>
                  <TableHead className="text-right">Κέρδος</TableHead>
                  <TableHead className="text-center">Περιθώριο</TableHead>
                  <TableHead className="text-center">Budget</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectsRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Δεν υπάρχουν κινήσεις έργων στην περίοδο.
                    </TableCell>
                  </TableRow>
                ) : (
                  projectsRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/projects/${p.id}`} className="underline-offset-2 hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>{p.customerName || "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{p.hours}</TableCell>
                      <TableCell className="text-center tabular-nums">{p.billableHours}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.invoiced)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.profit)}</TableCell>
                      <TableCell className="text-center">
                        <MarginBadge value={p.marginPercent} />
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{p.budgetUsedPercent !== null ? `${p.budgetUsedPercent}%` : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "items" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Κερδοφορία ανά είδος / υπηρεσία</CardTitle>
            <CardDescription>Κόστος από ΜΣΚ αποθήκης ή τιμή κόστους είδους. Οι υπηρεσίες χωρίς κόστος εμφανίζονται με 100% περιθώριο.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table data-testid="profit-items-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Είδος</TableHead>
                  <TableHead>Κωδικός</TableHead>
                  <TableHead className="text-center">Ποσότητα</TableHead>
                  <TableHead className="text-right">Πωλήσεις</TableHead>
                  <TableHead className="text-right">Κόστος</TableHead>
                  <TableHead className="text-right">Μεικτό κέρδος</TableHead>
                  <TableHead className="text-center">Περιθώριο</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Δεν υπάρχουν πωλήσεις ειδών στην περίοδο.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.sku || "—"}</TableCell>
                      <TableCell className="text-center tabular-nums">{i.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.sales)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.cogs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(i.grossProfit)}</TableCell>
                      <TableCell className="text-center">
                        <MarginBadge value={i.marginPercent} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
