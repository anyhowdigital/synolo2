"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination, TableShell } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";
import { Loader2, Save, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { saveFeeAction, generateFeeChargesAction, markFeeChargeAction } from "@/app/actions/firm";

type Client = { orgId: string; name: string; afm: string; amount: number; cadence: string; note: string };
type Charge = { id: string; orgId: string; orgName: string; month: string; amount: number; status: string };

const CADENCE: Record<string, string> = { monthly: "Μηνιαία", quarterly: "Τριμηνιαία", annual: "Ετήσια" };

export function FeesPanel({ month, clients, charges }: { month: string; clients: Client[]; charges: Charge[] }) {
  const [rows, setRows] = useState(clients);
  const [target, setTarget] = useState(month);
  const [pending, start] = useTransition();
  const sp = useSearchParams();
  const path = usePathname();
  const view = sp.get("view") === "charges" ? "charges" : "clients";
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") ?? "";
  const chargeMonth = sp.get("chargeMonth") ?? "";
  const pageSize = parsePageSize(sp.get("pageSize"));
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith(path, { view, q, status, chargeMonth, pageSize }, patch);
  const matches = (text: string) => !q || text.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR"));
  const clientPage = paginate(rows.filter((r) => matches(`${r.name} ${r.afm}`)), parsePage(sp.get("page")), pageSize);
  const chargePage = paginate(charges.filter((c) => matches(`${c.orgName} ${clients.find((r) => r.orgId === c.orgId)?.afm ?? ""}`) && (!status || c.status === status) && (!chargeMonth || c.month === chargeMonth)), parsePage(sp.get("page")), pageSize);
  const paged = view === "charges" ? chargePage : clientPage;

  const monthlyTotal = rows.filter((r) => r.cadence === "monthly").reduce((s, r) => s + r.amount, 0);
  const unpaid = charges.filter((c) => c.status === "unpaid");

  const patch = (orgId: string, p: Partial<Client>) => setRows((rs) => rs.map((r) => (r.orgId === orgId ? { ...r, ...p } : r)));

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title="Αμοιβές γραφείου" description={`Μηνιαία επαναλαμβανόμενη αμοιβή ${formatMoney(monthlyTotal)} · ${unpaid.length} ανεξόφλητες χρεώσεις (${formatMoney(unpaid.reduce((s, c) => s + c.amount, 0))})`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input type="month" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Μήνας δημιουργίας χρεώσεων" className="h-9 w-[160px]" data-testid="fees-month-input" />
          <Button
            size="sm"
            disabled={pending}
            data-testid="fees-generate-btn"
            onClick={() =>
              start(async () => {
                const res = await generateFeeChargesAction(target);
                if (!res.ok) { toast.error(res.error); return; }
                toast.success(res.created ? `${res.created} χρεώσεις (${formatMoney(res.total)}) δημιουργήθηκαν.` : "Δεν υπήρχαν νέες χρεώσεις για τον μήνα.");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Receipt data-icon="inline-start" />}
            Δημιουργία χρεώσεων μήνα
          </Button>
        </div>
      </PageHeader>
      <nav className="flex flex-wrap gap-2" aria-label="Προβολή αμοιβών" data-testid="fees-views">
        {[{ key: "clients", label: "Αμοιβή ανά πελάτη" }, { key: "charges", label: "Χρεώσεις" }].map((tab) => (
          <Button key={tab.key} asChild variant={view === tab.key ? "secondary" : "outline"} size="sm">
            <Link href={linkFor({ view: tab.key, status: "", chargeMonth: "", page: 1 })} aria-current={view === tab.key ? "page" : undefined} data-testid={`fees-view-${tab.key}`}>{tab.label}</Link>
          </Button>
        ))}
      </nav>
      <div>
      <FilterBar key={`${view}:${q}:${status}:${chargeMonth}`} action={path} q={q} showDates={false} searchPlaceholder="Αναζήτηση πελάτη, ΑΦΜ…"
        hidden={{ view, status: view === "charges" ? status : "", pageSize: String(pageSize) }} filtersActive={view === "charges" && !!(status || chargeMonth)} clearHref={linkFor({ q: "", status: "", chargeMonth: "" })}
        chips={view === "charges" ? [{ key: "all", label: "Όλες", value: "" }, { key: "unpaid", label: "Ανεξόφλητες", value: "unpaid" }, { key: "paid", label: "Εξοφλημένες", value: "paid" }].map((s) => ({ ...s, href: linkFor({ status: s.value }), active: status === s.value })) : undefined}>
        {view === "charges" ? <Input type="month" name="chargeMonth" defaultValue={chargeMonth} aria-label="Φίλτρο μήνα χρεώσεων" className="h-8 w-[160px]" data-testid="fees-charge-month-filter" /> : null}
      </FilterBar>
      {view === "clients" ? <Card>
        <CardHeader>
          <CardTitle className="text-base">Αμοιβή ανά πελάτη</CardTitle>
        </CardHeader>
        <CardContent className="divide-y" data-testid="fees-clients">
          {clientPage.total === 0 ? (
            <p className="py-6 text-sm text-muted-foreground" data-testid="fees-clients-empty">{q ? "Δεν βρέθηκαν πελάτες. Δοκιμάστε διαφορετική αναζήτηση." : "Δεν έχετε συνεργαζόμενες επιχειρήσεις."}</p>
          ) : (
            clientPage.rows.map((r) => (
              <div key={r.orgId} className="grid min-w-0 gap-2 py-3 first:pt-0 lg:grid-cols-[minmax(0,1fr)_120px_150px_minmax(0,1fr)_auto] lg:items-center" data-testid={`fee-row-${r.orgId}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">ΑΦΜ {r.afm}</div>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.amount}
                  onChange={(e) => patch(r.orgId, { amount: Number(e.target.value) })}
                  className="h-9"
                  data-testid={`fee-amount-${r.orgId}`}
                />
                <Select value={r.cadence} onValueChange={(v) => patch(r.orgId, { cadence: v })}>
                  <SelectTrigger className="h-9" data-testid={`fee-cadence-${r.orgId}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CADENCE).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={r.note} onChange={(e) => patch(r.orgId, { note: e.target.value })} placeholder="Σημείωση (π.χ. περιλαμβάνει μισθοδοσία)" className="h-9" data-testid={`fee-note-${r.orgId}`} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  data-testid={`fee-save-${r.orgId}`}
                  onClick={() =>
                    start(async () => {
                      const res = await saveFeeAction(r.orgId, r.amount, r.cadence, r.note);
                      res.ok ? toast.success("Αποθηκεύτηκε.") : toast.error(res.error);
                    })
                  }
                >
                  <Save data-icon="inline-start" />
                  Αποθήκευση
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card> : <Card>
        <CardHeader>
          <CardTitle className="text-base" data-testid="fees-charge-count">Χρεώσεις ({chargePage.total})</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          <TableShell>
          <Table data-testid="fees-charges">
            <TableHeader>
              <TableRow>
                <TableHead>Μήνας</TableHead>
                <TableHead>Πελάτης</TableHead>
                <TableHead className="text-right">Ποσό</TableHead>
                <TableHead className="text-center">Κατάσταση</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {chargePage.total === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {q || status || chargeMonth ? "Δεν βρέθηκαν χρεώσεις. Δοκιμάστε διαφορετικά φίλτρα." : "Δεν έχουν δημιουργηθεί χρεώσεις."}
                  </TableCell>
                </TableRow>
              ) : (
                chargePage.rows.map((c) => (
                  <TableRow key={c.id} data-testid={`charge-${c.id}`}>
                    <TableCell className="tabular-nums">{c.month.split("-").reverse().join("/")}</TableCell>
                    <TableCell>{c.orgName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
                    <TableCell className="text-center">
                      {c.status === "paid" ? <Badge variant="secondary">Εξοφλήθηκε</Badge> : <Badge variant="destructive">Ανεξόφλητη</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        data-testid={`charge-toggle-${c.id}`}
                        onClick={() =>
                          start(async () => {
                            const res = await markFeeChargeAction(c.id, c.status !== "paid");
                            res.ok ? toast.success("Ενημερώθηκε.") : toast.error(res.error);
                          })
                        }
                      >
                        {c.status === "paid" ? "Σήμανση ανεξόφλητης" : "Σήμανση εξόφλησης"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </TableShell>
        </CardContent>
      </Card>}
      <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun={view === "charges" ? "χρεώσεις" : "πελάτες"} />
      </div>
    </div>
  );
}
