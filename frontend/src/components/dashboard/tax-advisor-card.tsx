import Link from "next/link";
import { Lightbulb, ArrowRight } from "lucide-react";
import type { Opportunity } from "@/lib/tax/engine";
import { formatMoney } from "@/lib/invoice/totals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SEVERITY: Record<Opportunity["severity"], string> = {
  high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  info: "bg-muted text-muted-foreground",
};

export function TaxAdvisorCard({ opportunities, totalBenefit }: { opportunities: Opportunity[]; totalBenefit: number }) {
  return (
    <Card data-testid="tax-advisor-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="size-4 text-amber-500" /> Σύμβουλος: Ευκαιρίες εξοικονόμησης
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalBenefit > 0 ? (
          <div className="rounded-lg border bg-emerald-50 p-3 text-sm dark:bg-emerald-950" data-testid="tax-advisor-total">
            Εκτιμώμενο ετήσιο όφελος: <span className="font-semibold tabular-nums">{formatMoney(totalBenefit)}</span>
          </div>
        ) : null}
        {opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Συμπληρώστε το φορολογικό προφίλ για εξατομικευμένες προτάσεις.</p>
        ) : (
          opportunities.map((o) => (
            <div key={o.ruleCode} className="rounded-md border p-2.5 text-sm" data-testid={`tax-opp-${o.ruleCode}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{o.title}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${SEVERITY[o.severity]}`}>
                  {o.estimatedBenefit > 0 ? `~${formatMoney(o.estimatedBenefit)}` : "Ενημέρωση"}
                </span>
              </div>
            </div>
          ))
        )}
        <Button asChild variant="ghost" size="sm" className="w-full" data-testid="tax-advisor-open">
          <Link href="/advisor">Άνοιγμα Συμβούλου <ArrowRight data-icon="inline-end" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
