import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { listRuleReviews } from "@/lib/services/tax-advisor";
import { TAX_RULES } from "@/lib/tax/knowledge-base";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KbReviewActions } from "@/components/advisor/kb-review-actions";
import { KbRefreshButton } from "@/components/advisor/kb-refresh-button";

export const metadata = { title: "Έλεγχος φορολογικών κανόνων" };

export default async function KbReviewPage() {
  const db = await getDb();
  await getCurrentUser(db);
  const taxYear = new Date().getFullYear();
  const reviews = await listRuleReviews(db, taxYear);
  const approved = TAX_RULES.filter((r) => reviews.get(r.code)?.status === "approved").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Έλεγχος φορολογικών κανόνων"
        description={`Human sign-off της βάσης γνώσης για το έτος ${taxYear}. Εγκρίνετε ή σημειώστε κανόνες που χρειάζονται ενημέρωση όταν αλλάζει ο νόμος.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Χειροκίνητος επανέλεγχος: σημειώνει αυτόματα για αλλαγή τους κανόνες παλαιότερης χρονιάς.</p>
        <KbRefreshButton />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Κατάσταση έτους {taxYear}</CardDescription>
          <CardTitle className="text-2xl tabular-nums" data-testid="kb-review-progress">
            {approved} / {TAX_RULES.length} εγκεκριμένοι
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid gap-3" data-testid="kb-review-list">
        {TAX_RULES.map((r) => {
          const rev = reviews.get(r.code);
          const status = (rev?.status ?? "none") as "approved" | "needs_change" | "none";
          return (
            <Card key={r.code} data-testid={`kb-rule-${r.code}`} className={status === "needs_change" ? "border-amber-300" : status === "approved" ? "border-emerald-300" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{r.title}</div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                      status === "approved"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : status === "needs_change"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status === "approved" ? "Εγκεκριμένο" : status === "needs_change" ? "Χρειάζεται αλλαγή" : "Εκκρεμεί"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.legalBasis} · Ισχύς από {r.effectiveFrom}
                </p>
                {rev ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Τελευταία απόφαση: {rev.reviewedByName ?? "—"} · {rev.reviewedAt.slice(0, 10)}
                    {rev.note ? ` — «${rev.note}»` : ""}
                  </p>
                ) : null}
                <KbReviewActions ruleCode={r.code} status={status} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
