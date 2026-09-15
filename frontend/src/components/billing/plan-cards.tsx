"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startCheckoutAction } from "@/app/actions/billing";
import { PLANS } from "@/lib/billing/plans";
import { formatMoney } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PlanCards({
  currentPlan,
  currentInterval,
  canManage = true,
  mode = "app",
}: {
  currentPlan?: string;
  currentInterval?: string | null;
  canManage?: boolean;
  mode?: "app" | "marketing";
}) {
  const [interval, setInterval] = useState<"monthly" | "yearly">(currentInterval === "yearly" ? "yearly" : "monthly");
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const select = (planId: string) => {
    setTarget(planId);
    start(async () => {
      // Σε επιτυχία γίνεται redirect προς Stripe Checkout ή την τοπική σελίδα πληρωμής.
      const res = await startCheckoutAction(planId, interval);
      if (res && !res.ok) toast.error(res.error);
      setTarget(null);
    });
  };

  return (
    <div>
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full border bg-muted p-1 text-sm">
          {(["monthly", "yearly"] as const).map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={interval === i}
              data-testid={`pricing-interval-${i}`}
              onClick={() => setInterval(i)}
              className={cn("rounded-full px-4 py-1.5 font-medium transition-colors", interval === i ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {i === "monthly" ? "Μηνιαία" : "Ετήσια (-17%)"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const price = interval === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          const isCurrent = currentPlan === plan.id && (currentInterval ?? "monthly") === interval;
          return (
            <Card key={plan.id} data-testid={`pricing-plan-${plan.id}`} className={cn("relative flex flex-col", plan.highlighted ? "border-primary shadow-lg" : "")}>
              {plan.highlighted ? <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2" data-testid={`pricing-highlight-${plan.id}`}>{mode === "marketing" ? "Για την επόμενη κίνηση" : "Πιο δημοφιλές"}</Badge> : null}
              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.tagline}</CardDescription>
                <div className="pt-3">
                  <span className="text-4xl font-semibold tabular-nums" data-testid={`pricing-price-${plan.id}`}>{formatMoney(price).replace(",00", "")}</span>
                  <span className="text-sm text-muted-foreground"> / {interval === "monthly" ? "μήνα" : "έτος"} + ΦΠΑ</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {mode === "marketing" ? (
                  <Button asChild className="w-full" variant={plan.highlighted ? "default" : "outline"} data-testid={`pricing-register-${plan.id}`}>
                    <Link href="/register?type=business">Δωρεάν δοκιμή 14 ημερών</Link>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "secondary" : plan.highlighted ? "default" : "outline"}
                    disabled={isCurrent || pending || !canManage}
                    title={!canManage ? "Μόνο ο ιδιοκτήτης μπορεί να αλλάξει πακέτο." : undefined}
                    onClick={() => select(plan.id)}
                  >
                    {pending && target === plan.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                    {isCurrent ? "Τρέχον πακέτο" : currentPlan === plan.id ? "Αλλαγή χρέωσης" : "Επιλογή πακέτου"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
