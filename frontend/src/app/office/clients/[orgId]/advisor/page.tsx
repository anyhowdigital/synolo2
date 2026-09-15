import Link from "next/link";
import { notFound } from "next/navigation";
import { Lightbulb, BarChart3 } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClient, firmClients, firmTeam, canWrite, ACCESS_LEVELS } from "@/lib/services/firm";
import { taxAdvisor, firmBenchmark } from "@/lib/services/tax-advisor";
import { taxForecast } from "@/lib/tax/engine";
import { formatMoney } from "@/lib/invoice/totals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssignOpportunityButton, TaxPlanEmailButton } from "@/components/office/client-advisor-panel";
import { TaxProfileForm } from "@/components/advisor/tax-profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Σύμβουλος πελάτη" };

const SEV: Record<string, { label: string; cls: string }> = {
  high: { label: "Υψηλή", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  medium: { label: "Μεσαία", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  info: { label: "Ενημερωτικό", cls: "bg-muted text-muted-foreground" },
};

export default async function OfficeClientAdvisorPage({ params }: PageProps<"/office/clients/[orgId]/advisor">) {
  const { orgId } = await params;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();
  const org = client.org;
  const writable = canWrite(client.accessLevel);

  const [{ profile, financials, active, totalBenefit }, clients, team] = await Promise.all([
    taxAdvisor(db, org),
    firmClients(db, firm),
    firmTeam(db, firm),
  ]);
  const forecast = taxForecast(profile, financials);
  const benchmark = await firmBenchmark(db, clients, org.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold" data-testid="client-advisor-title">
            Σύμβουλος — {org.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            ΑΦΜ {org.afm || "—"} · {ACCESS_LEVELS[client.accessLevel].label} · χρήση {financials.year}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/office/clients/${org.id}`}>← Καρτέλα πελάτη</Link>
          </Button>
          <Button asChild size="sm" variant="secondary" data-testid="client-advisor-pdf-link">
            <a href={`/api/office/tax-plan/pdf?org=${org.id}`} target="_blank" rel="noreferrer">
              Λήψη PDF πλάνου
            </a>
          </Button>
          {writable ? <TaxPlanEmailButton orgId={org.id} defaultEmail={org.email ?? ""} /> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Δυνητικό όφελος/έτος", `~${formatMoney(totalBenefit)}`],
          ["Εκτιμώμενος φόρος", formatMoney(forecast.projectedTax)],
          ["Σύνολο υποχρεώσεων", formatMoney(forecast.totalObligations)],
          ["Μηνιαία κράτηση", formatMoney(forecast.monthlyReserve)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" /> Σύγκριση με το χαρτοφυλάκιο του γραφείου
          </CardTitle>
          <CardDescription>
            Έναντι πελατών ίδιας νομικής μορφής ({benchmark?.legalFormLabel ?? "—"}) στο δικό σας χαρτοφυλάκιο — ενδεικτικό, βάσει των βιβλίων σας.
          </CardDescription>
        </CardHeader>
        <CardContent data-testid="client-advisor-benchmark">
          {!benchmark ? (
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν αρκετά δεδομένα (χρειάζεται θετικό κέρδος) για σύγκριση.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Αποτ. φορ. συντελεστής</div>
                <div className="text-lg font-semibold tabular-nums">{benchmark.target.effTaxRatePct}%</div>
                <div className="text-xs text-muted-foreground">διάμεσος ομοειδών: {benchmark.peerMedian.effTaxRatePct}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Όφελος ως % κέρδους</div>
                <div className="text-lg font-semibold tabular-nums text-emerald-600">{benchmark.target.benefitRatioPct}%</div>
                <div className="text-xs text-muted-foreground">διάμεσος ομοειδών: {benchmark.peerMedian.benefitRatioPct}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Κατάταξη οφέλους</div>
                <div className="text-lg font-semibold tabular-nums">#{benchmark.benefitRank} / {benchmark.benefitTotal}</div>
                <div className="text-xs text-muted-foreground">{benchmark.peerCount} ομοειδείς πελάτες</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Φορολογικό προφίλ</CardTitle>
          <CardDescription>
            Ίδιο πεδίο με την επιχείρηση — <span className="font-medium text-emerald-600">συγχρονισμένο</span>. Οι αλλαγές εδώ ενημερώνουν άμεσα και τον Σύμβουλο της επιχείρησης.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxProfileForm initial={profile} readOnly={!writable} orgId={org.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4 text-primary" /> Ευκαιρίες βελτιστοποίησης ({active.length})
          </CardTitle>
          <CardDescription>Αναθέστε μια ευκαιρία σε συνεργάτη με προθεσμία ώστε να μη χαθεί.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="client-advisor-opportunities">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Δεν εντοπίστηκαν ευκαιρίες στα τρέχοντα δεδομένα.</p>
          ) : (
            active.map((o) => (
              <div key={o.ruleCode} className="rounded-lg border p-3" data-testid={`client-advisor-opp-${o.ruleCode}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{o.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${SEV[o.severity]?.cls ?? ""}`}>{SEV[o.severity]?.label ?? o.severity}</span>
                      {o.status === "applied" ? <Badge variant="outline">Εφαρμόστηκε</Badge> : null}
                    </div>
                  </div>
                  {o.estimatedBenefit > 0 ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      ~{formatMoney(o.estimatedBenefit)}/έτος
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{o.rationale}</p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">Ενέργεια:</span> {o.action}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{o.legalBasis}</p>
                {writable && team.length > 0 ? (
                  <AssignOpportunityButton orgId={org.id} ruleCode={o.ruleCode} title={o.title} severity={o.severity} team={team} />
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
