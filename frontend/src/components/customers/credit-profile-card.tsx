import { ShieldAlert, ShieldCheck, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/invoice/totals";
import { CREDIT_RATING_LABELS, type CreditProfile } from "@/lib/services/credit-profile";
import type { PaymentBehaviour } from "@/lib/services/payment-prediction";

export function CreditProfileCard({ profile, behaviour }: { profile: CreditProfile; behaviour?: PaymentBehaviour | null }) {
  const tone = profile.rating === "risk" ? "destructive" : profile.rating === "watch" ? "secondary" : "default";
  const Icon = profile.rating === "risk" || profile.rating === "watch" ? ShieldAlert : ShieldCheck;
  const overLimit = profile.available !== null && profile.available < 0;
  return (
    <Card data-testid="credit-profile-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4" /> Πιστωτικό προφίλ
          </CardTitle>
          <Badge variant={tone} data-testid="credit-rating-badge">
            {CREDIT_RATING_LABELS[profile.rating]}
          </Badge>
        </div>
        <CardDescription>Συνέπεια πληρωμών βάσει {profile.paidCount} εξοφλημένων παραστατικών.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-center text-sm">
        <Cell label="Μέσος χρόνος πληρωμής" value={profile.avgPaymentDays !== null ? `${profile.avgPaymentDays} ημέρες` : "—"} />
        <Cell label="Εντός προθεσμίας" value={profile.onTimeRatio !== null ? `${profile.onTimeRatio}%` : "—"} />
        {behaviour ? (
          <p className="col-span-2 rounded-md bg-muted/60 p-2 text-xs" data-testid="credit-behaviour-note">
            Πρόβλεψη: πληρώνει συνήθως <strong>{behaviour.medianDaysLate > 0 ? `${behaviour.medianDaysLate} ημέρες μετά την προθεσμία` : "εντός προθεσμίας"}</strong> (διάμεσος από {behaviour.samples} παραστατικά
            {behaviour.worstDaysLate > behaviour.medianDaysLate ? `, στο χειρότερο +${behaviour.worstDaysLate} ημέρες` : ""}). Οι ανοιχτές απαιτήσεις μπαίνουν στην πρόβλεψη ρευστότητας σε αυτήν
            την ημερομηνία.
          </p>
        ) : null}
        <Cell label="Πιστωτικό όριο" value={profile.creditLimit > 0 ? formatMoney(profile.creditLimit) : "Χωρίς όριο"} />
        <Cell
          label="Διαθέσιμο όριο"
          value={profile.available !== null ? formatMoney(profile.available) : "—"}
          className={overLimit ? "text-destructive" : profile.available !== null ? "text-emerald-700" : ""}
        />
        {profile.overdue > 0.005 ? (
          <p className="col-span-2 flex items-center justify-center gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="credit-overdue-note">
            <TrendingDown className="size-3.5" /> Ληξιπρόθεσμο υπόλοιπο {formatMoney(profile.overdue)} από σύνολο {formatMoney(profile.outstanding)}.
          </p>
        ) : null}
        {overLimit ? (
          <p className="col-span-2 rounded-md bg-destructive/10 p-2 text-xs font-medium text-destructive" data-testid="credit-over-limit-note">
            Το ανοιχτό υπόλοιπο υπερβαίνει το πιστωτικό όριο κατά {formatMoney(Math.abs(profile.available!))}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Cell({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
