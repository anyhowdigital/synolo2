"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { publicDemoPayAction } from "@/app/actions/public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DemoPayForm({ token, amountLabel }: { token: string; amountLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState("4242 4242 4242 4242");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (card.replace(/\s/g, "") === "4000000000000002") {
      setError("Η κάρτα απορρίφθηκε από την εκδότρια τράπεζα (προσομοίωση).");
      return;
    }
    start(async () => {
      const res = await publicDemoPayAction(token);
      if (res.ok) router.push(`/p/${token}?paid=1`);
      else setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="cardholder">Όνομα κατόχου</Label>
        <Input id="cardholder" name="cardholder" required placeholder="ΟΝΟΜΑ ΕΠΩΝΥΜΟ" autoComplete="cc-name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="card">Αριθμός κάρτας</Label>
        <Input id="card" name="card" required inputMode="numeric" autoComplete="cc-number" value={card} onChange={(e) => setCard(e.target.value)} />
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
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-2">
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
        Πληρωμή {amountLabel}
      </Button>
      <Button asChild variant="ghost">
        <Link href={`/p/${token}?cancelled=1`}>Άκυρο</Link>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Δοκιμαστικές κάρτες: <code className="rounded bg-muted px-1">4242 4242 4242 4242</code> επιτυχία · <code className="rounded bg-muted px-1">4000 0000 0000 0002</code> απόρριψη.
      </p>
    </form>
  );
}
