"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { completeMockCheckoutAction } from "@/app/actions/billing";
import type { ActionResult } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MockCheckoutForm({ plan, interval }: { plan: string; interval: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(completeMockCheckoutAction, null);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={interval} />
      <div className="grid gap-2">
        <Label htmlFor="cardholder">Όνομα κατόχου</Label>
        <Input id="cardholder" name="cardholder" required placeholder="ΟΝΟΜΑ ΕΠΩΝΥΜΟ" autoComplete="cc-name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="card">Αριθμός κάρτας</Label>
        <Input id="card" name="card" required inputMode="numeric" placeholder="4242 4242 4242 4242" autoComplete="cc-number" defaultValue="4242 4242 4242 4242" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="exp">Λήξη</Label>
          <Input id="exp" name="exp" required placeholder="MM/YY" autoComplete="cc-exp" defaultValue="12/29" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cvc">CVC</Label>
          <Input id="cvc" name="cvc" required inputMode="numeric" placeholder="123" autoComplete="cc-csc" defaultValue="123" />
        </div>
      </div>
      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
        Πληρωμή & ενεργοποίηση
      </Button>
      <Button asChild variant="ghost">
        <Link href="/billing?cancelled=1">Άκυρο</Link>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Δοκιμαστικές κάρτες: <code className="rounded bg-muted px-1">4242 4242 4242 4242</code> επιτυχία · <code className="rounded bg-muted px-1">4000 0000 0000 0002</code> απόρριψη.
      </p>
    </ActionForm>
  );
}
