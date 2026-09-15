"use client";

import { useState, useTransition } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { publicStartPaymentAction } from "@/app/actions/public";
import { Button } from "@/components/ui/button";

export function PayOnlineButton({ token, label }: { token: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await publicStartPaymentAction(token);
            if (res.ok) window.location.assign(res.url);
            else setError(res.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CreditCard data-icon="inline-start" />}
        {label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
