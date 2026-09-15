import Link from "next/link";
import { Landmark, Wallet, CreditCard, CircleDollarSign } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { orgHasFeature } from "@/lib/billing/limits";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { can } from "@/lib/auth/session";
import { formatMoney } from "@/lib/invoice/totals";
import { ACCOUNT_KIND_LABELS, accountBalances, cashflowSummary, listAccounts, type AccountKind } from "@/lib/services/banking";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountDialog, DeleteAccountButton } from "@/components/banking/account-dialog";
import { EntryDialog, TransferDialog } from "@/components/banking/entry-dialogs";
import { ImportDialog } from "@/components/import-dialog";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";

export const metadata = { title: "Ταμείο & Τράπεζες" };

const KIND_ICON: Record<AccountKind, typeof Landmark> = { bank: Landmark, cash: Wallet, card: CreditCard, other: CircleDollarSign };

const MONTHS_GENITIVE = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου", "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"];

function monthRange(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const from = d.toISOString().slice(0, 10);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from, to: end.toISOString().slice(0, 10), label: `${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}` };
}

export default async function BankingPage({ searchParams }: PageProps<"/banking">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const kind = typeof sp.kind === "string" && sp.kind in ACCOUNT_KIND_LABELS ? sp.kind : "";
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "";
  const pageSize = parsePageSize(sp.pageSize);
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith("/banking", { q, kind, status, pageSize }, patch);
  const db = await getDb();
  const { org, role } = await requireContext(db);
  if (!orgHasFeature(org, "banking")) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <UpgradeNotice capability="banking" />
      </div>
    );
  }
  const canWrite = can(role, "write");
  const thisMonth = monthRange(0);
  const lastMonth = monthRange(-1);
  const [accounts, balances, cfThis, cfLast] = await Promise.all([listAccounts(db, org.id, { includeInactive: true }), accountBalances(db, org.id), cashflowSummary(db, org.id, thisMonth), cashflowSummary(db, org.id, lastMonth)]);
  const active = accounts.filter((a) => a.active);
  const total = active.reduce((s, a) => s + (balances.get(a.id)?.balance ?? 0), 0);
  const unmatchedTotal = active.reduce((s, a) => s + (balances.get(a.id)?.unmatched ?? 0), 0);
  const options = active.map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
  const filtered = accounts.filter((a) => (!q || `${a.name} ${a.bankName} ${a.iban}`.toLocaleLowerCase("el-GR").replace(/\s/g, "").includes(q.toLocaleLowerCase("el-GR").replace(/\s/g, "")))
    && (!kind || a.kind === kind) && (!status || a.active === (status === "active")));
  const paged = paginate(filtered, parsePage(sp.page), pageSize);
  const hasFilters = !!(q || kind || status);

  return (
    <>
      <PageHeader title="Ταμείο & Τράπεζες" description="Υπόλοιπα λογαριασμών, ταμειακή ροή, μεταφορές και συμφωνία των κινήσεων του τραπεζικού αντιγράφου με τις εισπράξεις και τις πληρωμές.">
        {canWrite && options.length > 0 ? (
          <>
            <TransferDialog accounts={options} />
            <EntryDialog accounts={options} />
          </>
        ) : null}
        {canWrite ? <ImportDialog kind="payments" /> : null}
        {canWrite ? <AccountDialog /> : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Συνολικά διαθέσιμα</CardDescription>
            <CardTitle className={cn("text-2xl tabular-nums", total < 0 && "text-destructive")}>{formatMoney(total)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{active.length} ενεργοί λογαριασμοί</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Εισπράξεις {thisMonth.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-emerald-700">{formatMoney(cfThis.inflow)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Εισπράξεις πελατών {formatMoney(cfThis.collections)} · προηγ. μήνας {formatMoney(cfLast.inflow)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Πληρωμές {thisMonth.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-destructive">{formatMoney(cfThis.outflow)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Πληρωμές προμηθευτών {formatMoney(cfThis.supplierPayments)} · προηγ. μήνας {formatMoney(cfLast.outflow)}
          </CardContent>
        </Card>
        <Card className={unmatchedTotal > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Καθαρή ροή μήνα</CardDescription>
            <CardTitle className={cn("text-2xl tabular-nums", cfThis.net < 0 ? "text-destructive" : "text-emerald-700")}>{formatMoney(cfThis.net)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{unmatchedTotal > 0 ? <span className="text-amber-700">{unmatchedTotal} κινήσεις λογαριασμού προς συμφωνία</span> : "Όλες οι κινήσεις λογαριασμού είναι συμφωνημένες"}</CardContent>
        </Card>
      </div>

      <FilterBar key={`${q}:${kind}:${status}`} action="/banking" q={q} showDates={false} searchPlaceholder="Αναζήτηση λογαριασμού, τράπεζας, IBAN…"
        hidden={{ kind, pageSize: String(pageSize) }} filtersActive={!!(kind || status)} clearHref={linkFor({ q: "", kind: "", status: "" })}
        chips={[{ key: "all", label: "Όλοι", href: linkFor({ kind: "" }), active: !kind }, ...Object.entries(ACCOUNT_KIND_LABELS).map(([key, label]) => ({ key, label, href: linkFor({ kind: key }), active: kind === key }))]}>
        <select name="status" defaultValue={status} aria-label="Κατάσταση λογαριασμού" className="h-8 max-w-full rounded-md border bg-background px-2 text-sm" data-testid="banking-status-filter">
          <option value="">Όλες οι καταστάσεις</option><option value="active">Ενεργοί</option><option value="inactive">Ανενεργοί</option>
        </select>
      </FilterBar>
      {paged.total === 0 ? (
        <EmptyState
          title={hasFilters ? "Δεν βρέθηκαν λογαριασμοί" : "Δεν έχετε ορίσει λογαριασμούς"}
          description={hasFilters ? "Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση." : "Δημιουργήστε το ταμείο μετρητών και τους τραπεζικούς λογαριασμούς της επιχείρησης από το κουμπί «Νέος λογαριασμός»."}
        />
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="banking-accounts">
          {paged.rows.map((a) => {
            const b = balances.get(a.id);
            const Icon = KIND_ICON[a.kind as AccountKind] ?? CircleDollarSign;
            return (
              <Card key={a.id} className={cn("min-w-0", !a.active && "opacity-60")} data-testid={`banking-account-${a.id}`}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        <Link href={`/banking/${a.id}`} className="hover:underline" title={a.name} data-testid={`banking-account-open-${a.id}`}>
                          {a.name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="truncate">
                        {ACCOUNT_KIND_LABELS[a.kind as AccountKind]}
                        {a.bankName ? ` · ${a.bankName}` : ""}
                        {a.iban ? <span className="block font-mono text-[11px]">{a.iban.replace(/(.{4})/g, "$1 ").trim()}</span> : null}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {a.isDefault ? <Badge variant="secondary">Προεπιλογή</Badge> : null}
                    {!a.active ? <Badge variant="outline">Ανενεργός</Badge> : null}
                    {canWrite ? <AccountDialog account={a} /> : null}
                    {canWrite && !a.isDefault ? <DeleteAccountButton id={a.id} /> : null}
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <p className={cn("text-2xl font-semibold tabular-nums", (b?.balance ?? 0) < 0 && "text-destructive")}>{formatMoney(b?.balance ?? a.openingBalance, a.currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Εισροές {formatMoney(b?.inflow ?? 0)} · Εκροές {formatMoney(b?.outflow ?? 0)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/banking/${a.id}`} data-testid={`banking-account-entries-${a.id}`}>Κινήσεις</Link>
                    </Button>
                    {a.kind !== "cash" ? (
                      <Button asChild size="sm" variant={b?.unmatched ? "default" : "ghost"}>
                        <Link href={`/banking/${a.id}?tab=statement`} data-testid={`banking-account-statement-${a.id}`}>{b?.unmatched ? `${b.unmatched} προς συμφωνία` : "Κινήσεις τράπεζας"}</Link>
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun="λογαριασμοί" />
    </>
  );
}
