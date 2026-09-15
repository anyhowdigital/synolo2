"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { decideOpportunityAction } from "@/app/actions/tax-advisor";

type Status = "new" | "applied" | "dismissed";

export function OpportunityActions({
  ruleCode,
  title,
  estimatedBenefit,
  status,
}: {
  ruleCode: string;
  title: string;
  estimatedBenefit: number;
  status: Status;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const decide = (s: Status) =>
    start(async () => {
      const res = await decideOpportunityAction({ ruleCode, title, estimatedBenefit, status: s });
      if (res.ok) {
        toast.success(s === "applied" ? "Σημειώθηκε ως εφαρμοσμένο" : s === "dismissed" ? "Απορρίφθηκε" : "Επαναφορά");
        router.refresh();
      } else {
        toast.error(res.error || "Σφάλμα");
      }
    });

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {status !== "applied" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("applied")} data-testid={`opp-apply-${ruleCode}`}>
          Το εφάρμοσα
        </Button>
      ) : null}
      {status !== "dismissed" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("dismissed")} data-testid={`opp-dismiss-${ruleCode}`}>
          Απόρριψη
        </Button>
      ) : null}
      {status !== "new" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("new")} data-testid={`opp-reset-${ruleCode}`}>
          Επαναφορά
        </Button>
      ) : null}
    </div>
  );
}
