import Link from "next/link";
import { Download, PieChart } from "lucide-react";
import { formatMoney } from "@/lib/invoice/totals";
import { SALES_DIMENSIONS, type SalesByDimension } from "@/lib/services/sales-dimensions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SalesDimensionsCard({ report, query }: { report: SalesByDimension; query: string }) {
  const top = report.rows.slice(0, 12);
  const rest = report.rows.slice(12);
  const restNet = rest.reduce((s, r) => s + r.net, 0);
  return (
    <Card id="sales-dimensions">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="size-4" /> Πωλήσεις ανά διάσταση
            </CardTitle>
            <CardDescription>
              Ανάλυση εσόδων ανά πωλητή, κανάλι, κατηγορία είδους, ετικέτα, πελάτη ή γεωγραφία. Τα πιστωτικά αφαιρούνται. Ο σύνδεσμος της σελίδας αποθηκεύει την επιλεγμένη αναφορά.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/reports/dimensions?${query}&dim=${report.dimension}`}>
              <Download data-icon="inline-start" /> CSV
            </a>
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SALES_DIMENSIONS.map((d) => (
            <Link
              key={d.id}
              href={`/reports?${query}&dim=${d.id}#sales-dimensions`}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", report.dimension === d.id ? "bg-foreground text-background" : "hover:bg-muted")}
            >
              {d.label}
            </Link>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {report.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Δεν υπάρχουν εκδοθέντα παραστατικά εσόδων στην περίοδο.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{SALES_DIMENSIONS.find((d) => d.id === report.dimension)?.label}</TableHead>
                <TableHead className="text-right">Παραστατικά</TableHead>
                <TableHead className="text-right">Καθαρή αξία</TableHead>
                <TableHead className="hidden text-right sm:table-cell">ΦΠΑ</TableHead>
                <TableHead className="text-right">Σύνολο</TableHead>
                <TableHead className="hidden w-40 md:table-cell">Μερίδιο</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-[260px] truncate font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.documents}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.net)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(r.vat)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.gross)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, r.share))}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{r.share.toFixed(1)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rest.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground">+{rest.length} ακόμη (βλ. CSV)</TableCell>
                  <TableCell className="text-right tabular-nums">{rest.reduce((s, r) => s + r.documents, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(restNet)}</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="text-right tabular-nums">{formatMoney(rest.reduce((s, r) => s + r.gross, 0))}</TableCell>
                  <TableCell className="hidden md:table-cell" />
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Σύνολο</TableCell>
                <TableCell className="text-right tabular-nums">{report.documents}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(report.totalNet)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
                <TableCell className="text-right tabular-nums">{formatMoney(report.totalGross)}</TableCell>
                <TableCell className="hidden md:table-cell" />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
