"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshKbReviewAction } from "@/app/actions/tax-advisor";

export function KbRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  const refresh = () =>
    start(async () => {
      const res = await refreshKbReviewAction();
      if (res.ok) {
        toast.success(res.flagged ? `Σημειώθηκαν ${res.flagged} κανόνες για επανέλεγχο.` : "Όλοι οι κανόνες είναι ενημερωμένοι για φέτος.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Σφάλμα ανανέωσης.");
      }
    });

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={refresh} data-testid="kb-refresh-button">
      <RefreshCw data-icon="inline-start" className={pending ? "animate-spin" : ""} /> {pending ? "Έλεγχος…" : "Ανανέωση βάσης γνώσης"}
    </Button>
  );
}
