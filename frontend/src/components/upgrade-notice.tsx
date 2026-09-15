import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { CAPABILITY_LABELS, minimumPlanFor, type Capability } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Εμφανίζεται στη θέση μιας δυνατότητας που δεν περιλαμβάνεται στο πακέτο. */
export function UpgradeNotice({ capability, description, className, compact = false }: { capability: Capability; description?: string; className?: string; compact?: boolean }) {
  const plan = minimumPlanFor(capability);
  if (compact) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm", className)}>
        <Lock className="size-4 text-muted-foreground" />
        <span>
          <span className="font-medium">{CAPABILITY_LABELS[capability]}</span> – διαθέσιμο από το πακέτο {plan.name}.
        </span>
        <Button asChild size="sm" variant="link" className="ml-auto h-auto p-0">
          <Link href="/billing">Αναβάθμιση</Link>
        </Button>
      </div>
    );
  }
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="flex-1">
          <div className="font-medium">
            {CAPABILITY_LABELS[capability]} – περιλαμβάνεται από το πακέτο {plan.name}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description ?? `Αναβαθμίστε για να ξεκλειδώσετε τη δυνατότητα. ${plan.name}: ${plan.monthlyPrice} €/μήνα ή ${plan.yearlyPrice} €/έτος.`}</p>
        </div>
        <Button asChild>
          <Link href={`/billing/checkout?plan=${plan.id}`}>Αναβάθμιση σε {plan.name}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
