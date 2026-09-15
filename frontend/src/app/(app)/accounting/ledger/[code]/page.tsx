import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { resolveRange } from "@/lib/date-range";
import { DateRangePicker } from "@/components/date-range-picker";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { accountLedgerGl, chart } from "@/lib/services/gl";

export const dynamic = "force-dynamic";

export default async function GlLedgerPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  const range = resolveRange(await searchParams);
  const db = await getDb();
  const { org } = await requireContext(db);
  const accounts = await chart(db, org.id);
  const account = accounts.find((a) => a.code === code);
  const rows = await accountLedgerGl(db, org.id, code, { from: range.from, to: range.to });

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/accounting">
          <ArrowLeft data-icon="inline-start" /> Διπλογραφικά
        </Link>
      </Button>
      <PageHeader title={`Καθολικό ${code} · ${account?.name ?? ""}`} description={`${rows.length} κινήσεις στην περίοδο`}>
        <DateRangePicker from={range.from} to={range.to} showCompare={false} />
      </PageHeader>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table data-testid="gl-ledger-table">
            <TableHeader>
              <TableRow>
                <TableHead>Ημερομηνία</TableHead>
                <TableHead>Άρθρο</TableHead>
                <TableHead>Αιτιολογία</TableHead>
                <TableHead className="text-right">Χρέωση</TableHead>
                <TableHead className="text-right">Πίστωση</TableHead>
                <TableHead className="text-right">Υπόλοιπο</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Καμία κίνηση στην περίοδο.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-mono text-xs">#{r.entryNo}</TableCell>
                    <TableCell className="max-w-sm truncate">{r.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.debit ? formatMoney(r.debit) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.credit ? formatMoney(r.credit) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.balance)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
