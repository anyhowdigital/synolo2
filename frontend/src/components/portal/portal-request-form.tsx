"use client";

import { useState, useTransition } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { requestPortalLinkAction } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PortalRequestForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <Alert>
        <MailCheck />
        <AlertDescription>
          Αν υπάρχουν παραστατικά που έχουν εκδοθεί σε αυτό το email, θα λάβετε σε λίγα λεπτά έναν προσωπικό σύνδεσμο πρόσβασης. Ελέγξτε και τον φάκελο ανεπιθύμητων.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await requestPortalLinkAction(email);
          if (r.ok) setDone(true);
          else setError(r.error);
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="portal-email">Το email σας</Label>
        <Input id="portal-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="onoma@etaireia.gr" />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        Αποστολή συνδέσμου πρόσβασης
      </Button>
    </form>
  );
}
