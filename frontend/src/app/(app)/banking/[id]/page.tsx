import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { PAYMENT_METHODS } from "@/lib/greek/document-types";
import { ACCOUNT_KIND_LABELS, accountBalances, accountLedger, getAccount, listAccounts, listTransactions, type AccountKind } from "@/lib/services/banking";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountDialog } from "@/components/banking/account-dialog";
import { DeleteEntryButton, EntryDialog, TransferDialog } from "@/components/banking/entry-dialogs";
import { ImportStatementDialog } from "@/components/banking/import-dialog";
import { AutoReconcileButton, DeleteBatchButton, TransactionActions } from "@/components/banking/reconcile-ui";
import { AiReconcilePanel } from "@/components/banking/ai-reconcile-panel";
import { listRules } from "@/lib/services/bank-ai";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "ledger", label: "Κινήσεις λογαριασμού" },
  { key: "statement", label: "Extrait & συμφωνία" },
];
const STATUS_FILTERS = [
  { key: "", label: "Όλες" },
  { key: "unmatched", label: "Προς συμφωνία" },
  { key: "matched", label: "Συμφωνημένες" },
  { key: "ignored", label: "Παραβλέφθηκαν" },
];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const methodLabel = (code?: number) => PAYMENT_METHODS.find((m) => m.code === code)?.label ?? "";

export default async function AccountPage({ params, searchParams }: PageProps<"/banking/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "statement" ? "statement" : "ledger";
  const status = typeof sp.status === "string" && STATUS_FILTERS.some((s) => s.key === sp.status) ? sp.status : "";
  const from = typeof sp.from === "string" && dateRe.test(sp.from) ? sp.from : "";
  const to = typeof sp.to === "string" && dateRe.test(sp.to) ? sp.to : "";
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const account = await getAccount(db, org.id, id);
  if (!account) notFound();

  const [ledger, balances, accounts, txs, rules] = await Promise.all([
    accountLedger(db, org.id, id, { from: from || undefined, to: to || undefined }),
    accountBalances(db, org.id),
    listAccounts(db, org.id),
    listTransactions(db, org.id, id, { status: status || undefined, limit: 500 }),
    listRules(db, org.id),
  ]);
  const bal = balances.get(id);
  const options = accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
  const lastBatch = txs.length ? txs.reduce((m, t) => (t.createdAt > m.createdAt ? t : m), txs[0]).importBatchId : null;
  const lastBatchCount = lastBatch ? txs.filter((t) => t.importBatchId === lastBatch).length : 0;
  const tabHref = (key: string) => (key === "ledger" ? `/banking/${id}` : `/banking/${id}?tab=statement`);
  const unmatched = bal?.unmatched ?? 0;
  const period = { from: ledger.rows.at(-1)?.date, to: ledger.rows[0]?.date };
  const periodIn = ledger.rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  const periodOut = ledger.rows.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0);

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/banking">
            <ArrowLeft data-icon="inline-start" /> Όλοι οι λογαριασμοί
          </Link>
        </Button>
      </div>
      <PageHeader title={account.name} description={`${ACCOUNT_KIND_LABELS[account.kind as AccountKind]}${account.bankName ? ` · ${account.bankName}` : ""}${account.iban ? ` · ${account.iban}` : ""}`}>
        {canWrite ? (
          <>
            {options.length > 1 ? <TransferDialog accounts={options} defaultFromId={id} /> : null}
            <EntryDialog accounts={options} defaultAccountId={id} />
            {account.kind !== "cash" ? <ImportStatementDialog accountId={id} accountName={account.name} /> : null}
            <AccountDialog account={account} />
          </>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Τρέχον υπόλοιπο</CardDescription>
            <CardTitle className={cn("text-2xl tabular-nums", (bal?.balance ?? 0) < 0 && "text-destructive")}>{formatMoney(bal?.balance ?? account.openingBalance, account.currency)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Έναρξη {formatMoney(account.openingBalance)}
            {account.openingDate ? ` (${formatDate(account.openingDate)})` : ""}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Εισροές {from || to ? "περιόδου" : "συνολικά"}</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-emerald-700">{formatMoney(periodIn)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{ledger.rows.filter((r) => r.amount > 0).length} κινήσεις</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Εκροές {from || to ? "περιόδου" : "συνολικά"}</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-destructive">{formatMoney(periodOut)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{ledger.rows.filter((r) => r.amount < 0).length} κινήσεις</CardContent>
        </Card>
        <Card className={unmatched > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Extrait προς συμφωνία</CardDescription>
            <CardTitle className={cn("text-2xl tabular-nums", unmatched > 0 && "text-amber-700")}>{unmatched}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{txs.length > 0 && !status ? `${txs.length} κινήσεις λογαριασμού συνολικά` : account.kind === "cash" ? "Το ταμείο δεν έχει αντίγραφο κινήσεων" : "Εισάγετε το αντίγραφο κινήσεων της τράπεζας"}</CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TABS.filter((t) => t.key !== "statement" || account.kind !== "cash").map((t) => (
          <Link key={t.key} href={tabHref(t.key)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", tab === t.key ? "bg-foreground text-background" : "hover:bg-muted")}>
            {t.label}
            {t.key === "statement" && unmatched > 0 ? ` · ${unmatched}` : ""}
          </Link>
        ))}
      </div>

      {tab === "ledger" ? (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3" action={`/banking/${id}`}>
            <div className="grid gap-1">
              <Label htmlFor="from" className="text-xs">
                Από
              </Label>
              <Input id="from" name="from" type="date" defaultValue={from} className="h-8 w-40" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="to" className="text-xs">
                Έως
              </Label>
              <Input id="to" name="to" type="date" defaultValue={to} className="h-8 w-40" />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Φίλτρο
            </Button>
            {from || to ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/banking/${id}`}>Καθαρισμός</Link>
              </Button>
            ) : null}
            {period.from && period.to ? (
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(period.from)} – {formatDate(period.to)}
              </span>
            ) : null}
          </form>
          {ledger.rows.length === 0 ? (
            <EmptyState
              title="Καμία κίνηση"
              description="Οι εισπράξεις παραστατικών, οι πληρωμές προμηθευτών και οι λοιπές κινήσεις που καταχωρούνται σε αυτόν τον λογαριασμό εμφανίζονται εδώ με τρέχον υπόλοιπο."
              action={canWrite ? <EntryDialog accounts={options} defaultAccountId={id} /> : undefined}
            />
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead>Κίνηση</TableHead>
                    <TableHead className="hidden md:table-cell">Τρόπος / αναφορά</TableHead>
                    <TableHead className="text-right">Ποσό</TableHead>
                    <TableHead className="text-right">Υπόλοιπο</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.rows.map((r) => (
                    <TableRow key={`${r.kind}-${r.id}`}>
                      <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                      <TableCell>
                        {r.link ? (
                          <Link href={r.link} className="font-medium hover:underline">
                            {r.label}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.label}</span>
                        )}
                        {r.detail ? <span className="block text-xs text-muted-foreground">{r.detail}</span> : null}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {methodLabel(r.method)}
                        {r.reference ? <span className="block font-mono">{r.reference}</span> : null}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", r.amount > 0 ? "text-emerald-700" : "text-destructive")}>{formatMoney(r.amount)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{formatMoney(r.balance)}</TableCell>
                      <TableCell className="text-right">{canWrite && r.kind === "entry" ? <DeleteEntryButton id={r.id} isTransfer={r.entryKind === "transfer"} /> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <Link key={s.key} href={`/banking/${id}?tab=statement${s.key ? `&status=${s.key}` : ""}`} className={cn("rounded-full border px-3 py-1 text-xs", status === s.key ? "bg-muted font-medium" : "hover:bg-muted")}>
                {s.label}
              </Link>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canWrite && lastBatch && !status ? <DeleteBatchButton batchId={lastBatch} count={lastBatchCount} /> : null}
              {canWrite ? <AutoReconcileButton accountId={id} unmatched={unmatched} /> : null}
            </div>
          </div>
          {txs.length === 0 ? (
            <EmptyState
              title={status ? "Καμία κίνηση σε αυτή την κατηγορία" : "Δεν έχει εισαχθεί αντίγραφο κινήσεων"}
              description="Εξάγετε τις κινήσεις από το e-banking σε CSV και εισάγετέ τις εδώ. Η αυτόματη συμφωνία θα συνδέσει τις κινήσεις με εισπράξεις/πληρωμές και θα προτείνει παραστατικά για τις υπόλοιπες."
              action={canWrite && !status ? <ImportStatementDialog accountId={id} accountName={account.name} /> : undefined}
            />
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead>Περιγραφή</TableHead>
                    <TableHead className="text-right">Ποσό</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Υπόλοιπο τράπεζας</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead className="text-right">Ενέργειες</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((t) => (
                    <TableRow key={t.id} className={cn(t.status === "ignored" && "opacity-60")}>
                      <TableCell className="whitespace-nowrap">{formatDate(t.bookedAt)}</TableCell>
                      <TableCell className="max-w-md">
                        <span className="block truncate" title={t.description}>
                          {t.description}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.counterparty}
                          {t.counterparty && t.reference ? " · " : ""}
                          {t.reference ? <span className="font-mono">{t.reference}</span> : null}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", t.amount > 0 ? "text-emerald-700" : "text-destructive")}>{formatMoney(t.amount)}</TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground lg:table-cell">{t.balanceAfter != null ? formatMoney(t.balanceAfter) : "—"}</TableCell>
                      <TableCell>
                        {t.status === "matched" ? (
                          <>
                            <Badge variant="secondary">Συμφωνημένη</Badge>
                            {t.matchNote ? <span className="mt-0.5 block max-w-[220px] truncate text-xs text-muted-foreground">{t.matchNote}</span> : null}
                          </>
                        ) : t.status === "ignored" ? (
                          <Badge variant="outline">Παραβλέφθηκε</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Προς συμφωνία</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <TransactionActions tx={t} canWrite={canWrite} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {canWrite ? (
            <div className="mt-6">
              <AiReconcilePanel
                accountId={id}
                unmatched={unmatched}
                rules={rules.map((r) => ({ id: r.id, keyword: r.keyword, action: r.action, entryKind: r.entryKind, targetName: r.targetName, hits: r.hits }))}
                unmatchedTxs={txs.filter((t) => t.status === "unmatched").map((t) => ({ id: t.id, bookedAt: t.bookedAt, amount: t.amount, description: t.description, counterparty: t.counterparty }))}
              />
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
