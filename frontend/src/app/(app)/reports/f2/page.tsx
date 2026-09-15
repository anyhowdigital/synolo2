
import Link from "next/link";
import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { getCurrentOrg } from "@/lib/services/org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/invoice/totals";
import { f2Reconciliation } from "@/lib/services/f2-recon";
import { monthPeriod, currentMonth } from "@/lib/services/monthly-close";

export const dynamic = "force-dynamic";

export default async function F2Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: qsMonth } = await searchParams;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const month = /^\d{4}-\d{2}$/.test(qsMonth ?? "") ? qsMonth! : currentMonth();
  const recon = await f2Reconciliation(db, org, monthPeriod(month));

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  const tone = { ok: "text-emerald-600", warn: "text-amber-600", blocker: "text-destructive" } as const;

  return (
    <>
      <PageHeader title="Προσυμπληρωμένο Φ2 & συμφωνία myDATA" description="Σύγκριση βιβλίων με τα διαβιβασμένα ποσά, γραμμή-γραμμή, πριν την υποβολή της δήλωσης ΦΠΑ." />

      <div className="mb-4 flex flex-wrap gap-1.5" data-testid="f2-months">
        {months.map((m) => (
          <Button key={m} asChild size="sm" variant={m === month ? "default" : "outline"}>
            <Link href={`/reports/f2?month=${m}`}>{m}</Link>
          </Button>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="f2-summary">
        {[
          ["Εκροές (καθαρά)", formatMoney(recon.f2.outputsNet)],
          ["ΦΠΑ εκροών", formatMoney(recon.f2.outputsVat)],
          ["ΦΠΑ εισροών (εκπιπτόμενο)", formatMoney(recon.f2.deductibleVat)],
          [recon.f2.payable >= 0 ? "Χρεωστικό υπόλοιπο" : "Πιστωτικό υπόλοιπο", formatMoney(Math.abs(recon.f2.payable))],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Συμφωνία γραμμή-γραμμή</CardTitle>
          <Badge variant={recon.verdict === "ok" ? "secondary" : recon.verdict === "warn" ? "outline" : "destructive"} data-testid="f2-verdict">
            {recon.verdict === "ok" ? "Συμφωνεί" : recon.verdict === "warn" ? "Μικρές αποκλίσεις" : "Απόκλιση άνω του 30%"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {recon.lines.map((l) => (
            <div key={l.label} className="min-w-0 rounded-lg border p-3" data-testid={`f2-line-${l.status}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-medium">{l.label}</div>
                <div className={`text-sm tabular-nums ${tone[l.status]}`}>
                  Διαφορά {formatMoney(l.diff)} ({l.diffPct > 0 ? "+" : ""}
                  {l.diffPct}%)
                </div>
              </div>
              <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span>Βιβλία: {formatMoney(l.books)}</span>
                <span>Διαβιβασμένα myDATA: {formatMoney(l.mydata)}</span>
              </div>
              {l.status !== "ok" ? <p className="mt-2 text-xs">{l.hint}</p> : null}
            </div>
          ))}

          {recon.notTransmitted > 0 ? (            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="f2-not-transmitted">
              {recon.notTransmitted} παραστατικά της περιόδου δεν έχουν ΜΑΡΚ.{" "}
              <Link href="/mydata" className="underline">
                Διαβίβαση τώρα
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Η ΑΑΔΕ προσυμπληρώνει τη δήλωση ΦΠΑ από τα διαβιβασμένα δεδομένα και δέχεται απόκλιση εσόδων έως 30%. Μεγαλύτερη διαφορά οδηγεί σε σημείωμα συμμόρφωσης.
      </p>
    </>
  );
}
