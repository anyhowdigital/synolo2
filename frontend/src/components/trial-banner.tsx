import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrialBanner({
  plan,
  planStatus,
  trialEndsAt,
}: {
  plan: string;
  planStatus: string;
  trialEndsAt: string | null;
}) {
  const days = trialEndsAt ? differenceInCalendarDays(new Date(trialEndsAt), new Date()) : null;
  const expiredTrial = plan === "trial" && days !== null && days < 0;
  const blocked = expiredTrial || planStatus === "cancelled" || planStatus === "past_due";

  if (blocked) {
    const text = expiredTrial
      ? "Η δοκιμαστική περίοδος έληξε. Η έκδοση νέων παραστατικών είναι σε παύση – τα δεδομένα σας παραμένουν διαθέσιμα."
      : planStatus === "past_due"
        ? "Η πληρωμή της συνδρομής εκκρεμεί. Ενημερώστε τον τρόπο πληρωμής για να συνεχίσετε την έκδοση."
        : "Η συνδρομή έχει ακυρωθεί. Επιλέξτε πακέτο για να συνεχίσετε την έκδοση παραστατικών.";
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm print:hidden">
        <TriangleAlert className="size-4 text-destructive" />
        <span className="flex-1 text-foreground/90">{text}</span>
        <Button asChild size="xs">
          <Link href="/billing">Επιλογή πακέτου</Link>
        </Button>
      </div>
    );
  }

  if (plan !== "trial" || planStatus !== "trialing") return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-primary/5 px-4 py-2 text-sm print:hidden">
      <Sparkles className="size-4 text-primary" />
      <span className="flex-1 text-foreground/80">
        Δοκιμαστική περίοδος{days !== null ? ` – απομένουν ${Math.max(0, days)} ημέρες` : ""}. Όλες οι λειτουργίες είναι διαθέσιμες.
      </span>
      <Button asChild size="xs" variant="outline">
        <Link href="/billing">Επιλογή πακέτου</Link>
      </Button>
    </div>
  );
}
