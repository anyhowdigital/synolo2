"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { portalSaveCardAction } from "@/app/actions/portal-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PortalSaveCard({ token, brand, last4, hasCard }: { token: string; brand: string; last4: string; hasCard: boolean }) {
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await portalSaveCardAction(token);
      if (!res.ok) { toast.error(res.error); return; }
      window.location.href = res.url;
    });

  return (
    <Card data-testid="portal-save-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-primary" /> Αυτόματη πληρωμή με κάρτα
          {hasCard ? (
            <Badge className="bg-emerald-600">
              {brand} •••• {last4}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {hasCard
            ? "Οι επόμενες συνδρομές σας θα εξοφλούνται αυτόματα. Μπορείτε να αντικαταστήσετε την κάρτα όποτε θέλετε."
            : "Αποθηκεύστε κάρτα μία φορά και τα τιμολόγια συνδρομής εξοφλούνται αυτόματα — χωρίς να χρειάζεται να πληρώνετε κάθε μήνα."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending} data-testid="portal-save-card-btn">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          {hasCard ? "Αλλαγή κάρτας" : "Αποθήκευση κάρτας"}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Τα στοιχεία της κάρτας καταχωρούνται απευθείας στο Stripe – δεν αποθηκεύονται στην εφαρμογή.
        </p>
      </CardContent>
    </Card>
  );
}
