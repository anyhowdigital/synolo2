import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/invoice/totals";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { taxForecast } from "@/lib/tax/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Πρόβλεψη φόρου & ταμείου" };

export default async function ForecastPage() {
  const db = await getDb();
  const { org } = await requireContext(db);
  const { profile, financials } = await taxAdvisor(db, org);
  const f = taxForecast(profile, financials);
  const cards: [string, number][] = [
    ["Εκτιμώμενος φόρος έτους", f.projectedTax],
    ["Προκαταβολή φόρου (επόμ. έτος)", f.advanceTax],
    ["Εισφορές ΕΦΚΑ (έτος)", f.efkaAnnual],
    ["Σύνολο υποχρεώσεων", f.totalObligations],
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link href="/advisor">
          <ArrowLeft data-icon="inline-start" /> Σύμβουλος
        </Link>
      </Button>
      <PageHeader title="Πρόβλεψη φόρου & ταμείου" description={`Με βάση καθαρό κέρδος ${formatMoney(financials.netProfit)} (${financials.year}).`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value], i) => (
          <Card key={label} data-testid={`forecast-card-${i}`}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{formatMoney(value)}</CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="forecast-reserve">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Συνιστώμενη μηνιαία κράτηση
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold tabular-nums" data-testid="forecast-monthly">
            {formatMoney(f.monthlyReserve)}
            <span className="text-base font-normal text-muted-foreground">/μήνα</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Βάλτε αυτό το ποσό κατά μέρος κάθε μήνα ώστε να καλύψετε φόρο, προκαταβολή και εισφορές χωρίς πίεση ταμείου.
            Ενδεικτικός υπολογισμός — επιβεβαιώστε με τον λογιστή σας.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
