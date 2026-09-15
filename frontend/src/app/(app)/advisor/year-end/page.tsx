import Link from "next/link";
import { CalendarClock, ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { yearEndPlan } from "@/lib/tax/engine";
import { formatMoney } from "@/lib/invoice/totals";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Βελτιστοποίηση τέλους χρήσης" };

export default async function YearEndPage() {
  const db = await getDb();
  const { org } = await requireContext(db);
  const { profile, financials } = await taxAdvisor(db, org);
  const plan = yearEndPlan(profile, financials);

  return (
    <>
      <PageHeader title="Βελτιστοποίηση τέλους χρήσης" description={`Ενέργειες πριν τις 31/12/${financials.year} για νόμιμη μείωση του φόρου.`} />

      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/advisor" data-testid="year-end-back"><ArrowLeft data-icon="inline-start" /> Πίσω στον Σύμβουλο</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Ημέρες έως 31/12</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums" data-testid="year-end-days">{plan.daysLeft}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Εκτιμώμενος φόρος έτους</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{formatMoney(plan.projectedTax)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Οριακός συντελεστής</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{plan.marginalRatePct}%</div></CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="size-4 text-primary" /> Ενέργειες πριν το κλείσιμο</CardTitle>
          <CardDescription>Πρακτικές, νόμιμες κινήσεις χρονισμού — επιβεβαιώστε με τον λογιστή σας.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="year-end-actions">
          {plan.actions.map((a, i) => (
            <div key={i} className="rounded-lg border p-3" data-testid={`year-end-action-${i}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{a.title}</div>
                {a.impact > 0 ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">~{formatMoney(a.impact)}</span> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">{a.legalBasis}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
