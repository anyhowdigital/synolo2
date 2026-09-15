import { differenceInCalendarDays } from "date-fns";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { getPlan, planLabel } from "@/lib/billing/plans";
import { issuedThisMonth, monthlyInvoiceLimit, subscriptionBlocked } from "@/lib/billing/limits";
import { stripeEnabled } from "@/lib/billing/stripe";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanCards } from "@/components/billing/plan-cards";
import { BillingActions } from "@/components/billing/billing-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata = { title: "Συνδρομή" };

const STATUS_LABEL: Record<string, string> = {
  active: "Ενεργή",
  trialing: "Δοκιμή",
  past_due: "Εκκρεμεί πληρωμή",
  cancelled: "Ακυρωμένη",
};

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const sp = await searchParams;
  const db = await getDb();
  const ctx = await requireContext(db);
  const { org, role } = ctx;
  const canManage = can(role, "manageBilling");
  const usedThisMonth = await issuedThisMonth(db, org.id);
  const limit = monthlyInvoiceLimit(org);
  const plan = getPlan(org.plan);
  const trialDays = org.trialEndsAt ? differenceInCalendarDays(new Date(org.trialEndsAt), new Date()) : null;
  const blocked = subscriptionBlocked(org);
  const hasSubscription = org.plan !== "trial" && org.planStatus !== "cancelled";
  const stripeOn = stripeEnabled();

  return (
    <>
      <PageHeader title="Συνδρομή" description="Διαχείριση πακέτου και χρήσης. Η χρέωση γίνεται μηνιαία ή ετήσια, με δυνατότητα ακύρωσης ανά πάσα στιγμή.">
        {canManage ? <BillingActions stripeEnabled={stripeOn} hasSubscription={hasSubscription} /> : null}
      </PageHeader>

      {sp.success ? (
        <Alert className="mb-6 border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 />
          <AlertTitle>Η συνδρομή ενεργοποιήθηκε</AlertTitle>
          <AlertDescription>Ευχαριστούμε! Το πακέτο {planLabel(org.plan)} είναι ενεργό. Η απόδειξη συνδρομής αποστέλλεται στο email χρέωσης.</AlertDescription>
        </Alert>
      ) : null}
      {sp.cancelled ? (
        <Alert className="mb-6">
          <Info />
          <AlertTitle>Η πληρωμή δεν ολοκληρώθηκε</AlertTitle>
          <AlertDescription>Δεν έγινε καμία χρέωση. Μπορείτε να ξαναπροσπαθήσετε όποτε θέλετε.</AlertDescription>
        </Alert>
      ) : null}
      {blocked ? (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Η έκδοση παραστατικών είναι σε παύση</AlertTitle>
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Τρέχον πακέτο</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {planLabel(org.plan)}
              <Badge variant={org.planStatus === "active" ? "default" : org.planStatus === "past_due" || org.planStatus === "cancelled" ? "destructive" : "secondary"}>
                {STATUS_LABEL[org.planStatus] ?? org.planStatus}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {org.plan === "trial" && trialDays !== null
              ? trialDays >= 0
                ? `Η δοκιμαστική περίοδος λήγει σε ${trialDays} ημέρες.`
                : "Η δοκιμαστική περίοδος έληξε."
              : org.planStatus === "cancelled"
                ? org.currentPeriodEnd
                  ? `Πρόσβαση έως ${new Date(org.currentPeriodEnd).toLocaleDateString("el-GR")}.`
                  : "Η συνδρομή έχει ακυρωθεί."
                : org.currentPeriodEnd
                  ? `${org.planInterval === "yearly" ? "Ετήσια" : "Μηνιαία"} χρέωση · επόμενη ανανέωση ${new Date(org.currentPeriodEnd).toLocaleDateString("el-GR")}.`
                  : "Ανανέωση αυτόματα κάθε περίοδο."}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Εκδοθέντα τρέχοντος μήνα / όριο πακέτου</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {usedThisMonth}
              <span className="text-base font-normal text-muted-foreground"> / {limit ?? "∞"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${limit && usedThisMonth / limit > 0.9 ? "bg-destructive" : "bg-primary"}`} style={{ width: limit ? `${Math.min(100, (usedThisMonth / limit) * 100)}%` : "8%" }} />
            </div>
            {limit && usedThisMonth >= limit ? <p className="mt-2 text-xs text-destructive">Φτάσατε το όριο του πακέτου. Αναβαθμίστε για να συνεχίσετε.</p> : null}
            {plan?.userLimit ? <p className="mt-2 text-xs text-muted-foreground">Έως {plan.userLimit} χρήστες.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Email χρέωσης</CardDescription>
            <CardTitle className="truncate text-lg">{org.billingEmail || org.email || "—"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stripeOn ? "Πληρωμές μέσω Stripe. Τα τιμολόγια συνδρομής αποστέλλονται εδώ." : "Λειτουργία επίδειξης: η πληρωμή προσομοιώνεται τοπικά μέχρι να ρυθμιστεί το STRIPE_SECRET_KEY."}
          </CardContent>
        </Card>
      </div>

      {!canManage ? (
        <Alert className="mb-6">
          <Info />
          <AlertDescription>Μόνο ο ιδιοκτήτης της επιχείρησης μπορεί να αλλάξει πακέτο ή τρόπο πληρωμής.</AlertDescription>
        </Alert>
      ) : null}

      <PlanCards currentPlan={org.plan} currentInterval={org.planInterval} canManage={canManage} />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Οι τιμές δεν περιλαμβάνουν ΦΠΑ 24%. Η ακύρωση ισχύει στο τέλος της τρέχουσας περιόδου· τα δεδομένα σας παραμένουν διαθέσιμα για ανάγνωση και εξαγωγή.
      </p>
    </>
  );
}
