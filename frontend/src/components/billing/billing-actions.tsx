"use client";

import { useTransition } from "react";
import { ExternalLink, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cancelSubscriptionAction, openBillingPortalAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";

export function BillingActions({ stripeEnabled, hasSubscription }: { stripeEnabled: boolean; hasSubscription: boolean }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {stripeEnabled && hasSubscription ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await openBillingPortalAction();
              if (res && !res.ok) toast.error(res.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ExternalLink data-icon="inline-start" />}
          Κάρτα & αποδείξεις
        </Button>
      ) : null}
      {hasSubscription ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            if (!confirm("Να ακυρωθεί η συνδρομή στο τέλος της τρέχουσας περιόδου; Τα δεδομένα σας παραμένουν διαθέσιμα για ανάγνωση.")) return;
            start(async () => {
              const res = await cancelSubscriptionAction();
              if (res.ok) toast.success("Η συνδρομή θα ακυρωθεί στο τέλος της περιόδου.");
              else toast.error(res.error);
            });
          }}
        >
          <XCircle data-icon="inline-start" /> Ακύρωση συνδρομής
        </Button>
      ) : null}
    </div>
  );
}
