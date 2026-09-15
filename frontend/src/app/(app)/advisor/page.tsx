import Link from "next/link";
import { Lightbulb, Sparkles, CalendarClock, TrendingUp } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { TAX_RULES, CATEGORY_LABELS, type TaxCategory } from "@/lib/tax/knowledge-base";
import { formatMoney } from "@/lib/invoice/totals";
import { PageHeader } from "@/components/page-header";
import { TaxProfileForm } from "@/components/advisor/tax-profile-form";
import { OpportunityActions } from "@/components/advisor/opportunity-actions";
import { WhatIfSimulator } from "@/components/advisor/what-if-simulator";
import { SalaryDividendSimulator } from "@/components/advisor/salary-dividend-simulator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Σύμβουλος" };

const SEV: Record<"high" | "medium" | "info", string> = {
  high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  info: "bg-muted text-muted-foreground",
};

export default async function AdvisorPage() {
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const readOnly = !can(role, "write");
  const { profile, financials, opportunities, totalBenefit } = await taxAdvisor(db, org);

  const rulesByCat = TAX_RULES.reduce<Record<string, typeof TAX_RULES>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Σύμβουλος βελτιστοποίησης" description="Νόμιμες ευκαιρίες εξοικονόμησης φόρων & εισφορών, με βάση τα δεδομένα σας." />

      <Alert className="mb-6" data-testid="advisor-disclaimer">
        <Lightbulb className="size-4" />
        <AlertTitle>Νόμιμος φορολογικός σχεδιασμός</AlertTitle>
        <AlertDescription>
          Οι προτάσεις αφορούν αποκλειστικά νόμιμη βελτιστοποίηση και είναι ενδεικτικές (έτος {financials.year}). Κάθε κανόνας φέρει νομική βάση και έχει ελεγχθεί από φοροτεχνικό. Η τελική εφαρμογή γίνεται σε συνεννόηση με τον λογιστή σας.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto flex-wrap" data-testid="advisor-tabs">
          <TabsTrigger value="overview" data-testid="advisor-tab-overview">Επισκόπηση</TabsTrigger>
          <TabsTrigger value="opportunities" data-testid="advisor-tab-opportunities">Ευκαιρίες</TabsTrigger>
          <TabsTrigger value="profile" data-testid="advisor-tab-profile">Προφίλ & Προσομοιώσεις</TabsTrigger>
          <TabsTrigger value="kb" data-testid="advisor-tab-kb">Βάση γνώσης</TabsTrigger>
        </TabsList>

        {/* ΕΠΙΣΚΟΠΗΣΗ */}
        <TabsContent value="overview" className="mt-4 space-y-6" data-testid="advisor-overview">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Καθαρά έσοδα", formatMoney(financials.grossRevenue)],
              ["Δαπάνες", formatMoney(financials.expenses)],
              ["Κέρδος", formatMoney(financials.netProfit)],
              ["Δυνητικό όφελος/έτος", `~${formatMoney(totalBenefit)}`],
            ].map(([label, value], i) => (
              <Card key={label} className={i === 3 ? "border-emerald-300" : ""}>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className={`text-xl font-semibold tabular-nums ${i === 3 ? "text-emerald-600" : ""}`} data-testid={i === 3 ? "advisor-total-benefit" : undefined}>{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" data-testid="year-end-link">
              <Link href="/advisor/year-end"><CalendarClock data-icon="inline-start" /> Βελτιστοποίηση τέλους χρήσης</Link>
            </Button>
            <Button asChild variant="outline" data-testid="forecast-link">
              <Link href="/advisor/forecast"><TrendingUp data-icon="inline-start" /> Πρόβλεψη φόρου & ταμείου</Link>
            </Button>
            <Button asChild variant="secondary" data-testid="advisor-ask-copilot">
              <Link href="/copilot?tab=tax"><Sparkles data-icon="inline-start" /> Ρωτήστε τον Βοηθό AI (φορολογικά)</Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Κορυφαίες ευκαιρίες</CardTitle>
              <CardDescription>Οι 3 με το μεγαλύτερο εκτιμώμενο όφελος — δείτε όλες στην καρτέλα «Ευκαιρίες».</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {opportunities.filter((o) => o.estimatedBenefit > 0).slice(0, 3).map((o) => (
                <div key={o.ruleCode} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                  <span className="min-w-0 truncate text-sm">{o.title}</span>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">~{formatMoney(o.estimatedBenefit)}</span>
                </div>
              ))}
              {opportunities.filter((o) => o.estimatedBenefit > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground">Συμπληρώστε το φορολογικό προφίλ για εξατομικευμένες προτάσεις.</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ΕΥΚΑΙΡΙΕΣ */}
        <TabsContent value="opportunities" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>Ευκαιρίες για εσάς</span>
                {totalBenefit > 0 ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">~{formatMoney(totalBenefit)}/έτος</span> : null}
              </CardTitle>
              <CardDescription>
                Καθαρά έσοδα {formatMoney(financials.grossRevenue)} · Δαπάνες {formatMoney(financials.expenses)} · Κέρδος {formatMoney(financials.netProfit)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3" data-testid="advisor-opportunities">
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Συμπληρώστε το φορολογικό προφίλ (καρτέλα «Προφίλ & Προσομοιώσεις») για εξατομικευμένες προτάσεις.</p>
              ) : (
                opportunities.map((o) => (
                  <div key={o.ruleCode} className={`rounded-lg border p-3 ${o.status === "dismissed" ? "opacity-60" : ""} ${o.status === "applied" ? "border-emerald-300" : ""}`} data-testid={`advisor-opp-${o.ruleCode}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">
                        {o.title}
                        {o.status === "applied" ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Εφαρμόστηκε</span> : null}
                        {o.status === "dismissed" ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Απορρίφθηκε</span> : null}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${SEV[o.severity]}`}>
                        {o.estimatedBenefit > 0 ? `~${formatMoney(o.estimatedBenefit)}` : "Ενημέρωση"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{o.rationale}</p>
                    <p className="mt-2 text-sm"><span className="font-medium">Ενέργεια: </span>{o.action}</p>
                    <a href={o.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-muted-foreground underline">
                      Νομική βάση: {o.legalBasis}
                    </a>
                    {o.decidedByName ? <p className="mt-1 text-xs text-muted-foreground">Απόφαση: {o.decidedByName}{o.decidedAt ? ` · ${o.decidedAt.slice(0, 10)}` : ""}</p> : null}
                    {!readOnly ? <OpportunityActions ruleCode={o.ruleCode} title={o.title} estimatedBenefit={o.estimatedBenefit} status={o.status} /> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ΠΡΟΦΙΛ & ΠΡΟΣΟΜΟΙΩΣΕΙΣ */}
        <TabsContent value="profile" className="mt-4 grid gap-6 lg:grid-cols-2" data-testid="advisor-profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Φορολογικό προφίλ</CardTitle>
              <CardDescription>Όσο πιο πλήρες, τόσο ακριβέστερες οι προτάσεις. Κοινό με τον λογιστή σας (συγχρονισμένο).</CardDescription>
            </CardHeader>
            <CardContent>
              <TaxProfileForm initial={profile} readOnly={readOnly} />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card data-testid="what-if-card">
              <CardHeader>
                <CardTitle className="text-base">Προσομοίωση σεναρίων (what-if)</CardTitle>
                <CardDescription>Δείτε πώς αλλάζει το όφελος σε διαφορετικές επιλογές — χωρίς αποθήκευση.</CardDescription>
              </CardHeader>
              <CardContent>
                <WhatIfSimulator profile={profile} financials={financials} />
              </CardContent>
            </Card>
            <SalaryDividendSimulator netProfit={financials.netProfit} />
          </div>
        </TabsContent>

        {/* ΒΑΣΗ ΓΝΩΣΗΣ */}
        <TabsContent value="kb" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Κατάλογος παραθύρων (πλήρης βάση γνώσης)</CardTitle>
              <CardDescription>Όλες οι νόμιμες δυνατότητες που παρακολουθεί ο Σύμβουλος — με παραπομπές.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {Object.entries(rulesByCat).map(([cat, rules]) => (
                <div key={cat}>
                  <div className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{CATEGORY_LABELS[cat as TaxCategory]}</div>
                  <div className="space-y-2">
                    {rules.map((r) => (
                      <div key={r.code} className="rounded-md border p-2.5 text-sm" data-testid={`advisor-rule-${r.code}`}>
                        <div className="font-medium">{r.title}</div>
                        <p className="mt-0.5 text-muted-foreground">{r.summary}</p>
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-muted-foreground underline">{r.legalBasis} · ισχύς {r.effectiveFrom.slice(0, 4)}</a>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
