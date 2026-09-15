import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm, WRITE_LEVELS } from "@/lib/services/firm";
import { resolveRange } from "@/lib/date-range";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { balanceSheet, chart, incomeStatement, listEntries, trialBalance } from "@/lib/services/gl";
import { OfficeGlTools } from "@/components/office/office-gl-tools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Διπλογραφικά πελάτη" };

const SOURCE_LABELS: Record<string, string> = {
  invoice: "Πώληση",
  expense: "Αγορά/έξοδο",
  payment: "Είσπραξη/πληρωμή",
  payroll: "Μισθοδοσία",
  depreciation: "Αποσβέσεις",
  closing: "Κλείσιμο χρήσης",
  manual: "Χειροκίνητο",
};

export default async function OfficeClientAccountingPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { orgId } = await params;
  const range = resolveRange(await searchParams);
  const period = { from: range.from, to: range.to };
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();
  const org = client.org;
  const canWrite = WRITE_LEVELS.includes(client.accessLevel);

  const enabled = org.booksCategory === "double" && !!org.accountingPlan;
  const [accounts, tb, is, bs, journal] = enabled
    ? await Promise.all([chart(db, org.id), trialBalance(db, org.id, period), incomeStatement(db, org.id, period), balanceSheet(db, org.id, period), listEntries(db, org.id, period)])
    : [[], [], null, null, []];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/office/clients/${org.id}`}>
          <ArrowLeft data-icon="inline-start" /> Καρτέλα πελάτη
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Διπλογραφικά · {org.name}</h1>
          <p className="text-sm text-muted-foreground">{enabled ? `${accounts.length} λογαριασμοί · ${tb.length} κινούμενοι στην περίοδο` : "Δεν έχουν ενεργοποιηθεί διπλογραφικά για αυτόν τον πελάτη."}</p>
        </div>
        <DateRangePicker from={period.from} to={period.to} showCompare={false} />
      </div>

      {canWrite ? <OfficeGlTools orgId={org.id} from={period.from} to={period.to} enabled={enabled} plan={org.accountingPlan} /> : <p className="text-sm text-muted-foreground">Η επιχείρηση σας έχει δώσει πρόσβαση μόνο ανάγνωσης.</p>}

      {enabled ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ισοζύγιο</CardTitle>
              <CardDescription>
                {period.from} – {period.to}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table data-testid="office-gl-trial">
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
                        Καμία κίνηση στην περίοδο.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tb.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.debit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.credit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.balance)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Αποτελέσματα</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {[
                  ["Κύκλος εργασίας", is!.revenue],
                  ["Κόστος/αγορές", -is!.cogs],
                  ["Λοιπά έξοδα", -(is!.services + is!.other + is!.taxes + is!.payroll)],
                  ["Καθαρό αποτέλεσμα", is!.net],
                ].map(([l, v], i) => (
                  <div key={l as string} className={`flex justify-between border-b py-1.5 last:border-0 ${i === 3 ? "font-semibold" : ""}`}>
                    <span>{l}</span>
                    <span className="tabular-nums">{formatMoney(v as number)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ισολογισμός</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {[
                  ["Σύνολο ενεργητικού", bs!.assets.total],
                  ["Καθαρή θέση", bs!.equity.total],
                  ["Σύνολο υποχρεώσεων", bs!.liabilities.total],
                ].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between border-b py-1.5 last:border-0">
                    <span>{l}</span>
                    <span className="tabular-nums">{formatMoney(v as number)}</span>
                  </div>
                ))}
                {Math.abs(bs!.difference) > 0.01 ? <p className="pt-2 text-xs text-destructive">Διαφορά {formatMoney(bs!.difference)} — ελέγξτε ανοίγματα.</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ημερολόγιο άρθρων</CardTitle>
              <CardDescription>{journal.length} άρθρα στην περίοδο</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3" data-testid="office-gl-journal">
              {journal.length === 0 ? (
                <p className="text-sm text-muted-foreground">Δεν υπάρχουν άρθρα στην περίοδο.</p>
              ) : (
                journal.slice(0, 25).map(({ entry, lines }) => (
                  <div key={entry.id} className="rounded-lg border p-3 text-sm" data-testid={`office-gl-entry-${entry.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        #{entry.entryNo} · {entry.entryDate} · {entry.description}
                      </span>
                      <Badge variant="secondary">{SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}</Badge>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {lines.map((l) => (
                        <div key={l.id} className="flex justify-between gap-3 border-b py-0.5 text-xs last:border-0">
                          <span className="min-w-0 truncate">
                            {l.accountCode} {l.accountName}
                          </span>
                          <span className="shrink-0 tabular-nums">{l.debit ? `Χ ${formatMoney(l.debit)}` : `Π ${formatMoney(l.credit)}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
