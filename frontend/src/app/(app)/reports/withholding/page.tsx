import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentOrg } from "@/lib/services/org";
import { withholdingCertificates } from "@/lib/services/compliance";
import { formatMoney } from "@/lib/invoice/totals";

export default async function WithholdingPage({ searchParams }: PageProps<"/reports/withholding">) {
  const sp = await searchParams;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const year = Number(typeof sp?.year === "string" ? sp.year : "") || new Date().getFullYear();
  const { rows, totals } = await withholdingCertificates(db, org.id, year);
  const years = [year + 1, year, year - 1, year - 2].filter((y) => y <= new Date().getFullYear() + 1);

  return (
    <>
      <PageHeader
        title="Βεβαιώσεις παρακρατούμενων φόρων"
        description={`Συγκεντρωτικά ποσά παρακρατήσεων και χαρτοσήμου ανά αντισυμβαλλόμενο για το έτος ${year}, από τα εκδοθέντα παραστατικά.`}
      >
        <div className="flex flex-wrap gap-1.5">
          {years.map((y) => (
            <a
              key={y}
              href={`/reports/withholding?year=${y}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${y === year ? "bg-foreground text-background" : "hover:bg-muted"}`}
              data-testid={`withholding-year-${y}`}
            >
              {y}
            </a>
          ))}
        </div>
      </PageHeader>

      <Card data-testid="withholding-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" /> Σύνολα έτους {year}
          </CardTitle>
          <CardDescription>
            Καθαρή αξία {formatMoney(totals.net)} · Παρακρατήσεις {formatMoney(totals.withheld)} · Χαρτόσημο {formatMoney(totals.stampDuty)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Δεν υπάρχουν παρακρατήσεις ή χαρτόσημο για το {year}.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Αντισυμβαλλόμενος</TableHead>
                    <TableHead className="hidden sm:table-cell">ΑΦΜ</TableHead>
                    <TableHead>Είδος παρακράτησης</TableHead>
                    <TableHead className="text-right">Καθαρή αξία</TableHead>
                    <TableHead className="text-right">Παρακρατήθηκε</TableHead>
                    <TableHead className="hidden md:table-cell text-right">Χαρτόσημο</TableHead>
                    <TableHead className="hidden lg:table-cell text-right">Παραστατικά</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} data-testid={`withholding-row-${r.key}`}>
                      <TableCell className="max-w-[220px] truncate font-medium">{r.customerName}</TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">{r.afm || "—"}</TableCell>
                      <TableCell className="max-w-[260px] text-xs">{r.withholdingLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(r.net)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.withheld)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMoney(r.stampDuty)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">{r.invoiceCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Η βεβαίωση παρακρατούμενων φόρων εκτυπώνεται από τη σελίδα (Ctrl/Cmd + P) και υπογράφεται από τον νόμιμο εκπρόσωπο. Τα ποσά προκύπτουν από τα εκδοθέντα παραστατικά της περιόδου.
      </p>
    </>
  );
}
