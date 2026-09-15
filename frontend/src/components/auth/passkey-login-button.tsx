"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, browserSupportsWebAuthnAutofill } from "@simplewebauthn/browser";
import { Fingerprint, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { passkeyLoginOptionsAction, passkeyLoginVerifyAction } from "@/app/actions/passkeys";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export function PasskeyLoginButton({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (typeof window === "undefined" || !window.PublicKeyCredential) { if (mounted) setSupported(false); return; }
      const autofill = await browserSupportsWebAuthnAutofill().catch(() => false);
      if (mounted) setSupported(true);
      // Conditional UI: activate autofill so the browser prompts the passkey inside the email/password field.
      if (autofill) tryAuthenticate({ useBrowserAutofill: true });
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryAuthenticate(extra: { useBrowserAutofill?: boolean } = {}) {
    try {
      const opt = await passkeyLoginOptionsAction();
      if (!opt.ok) return;
      const response = await startAuthentication({ optionsJSON: opt.options, useBrowserAutofill: extra.useBrowserAutofill });
      const verify = await passkeyLoginVerifyAction(opt.challengeId, response);
      if (!verify.ok) { if (!extra.useBrowserAutofill) toast.error(verify.error); return; }
      toast.success("Συνδέθηκες με passkey.");
      router.push(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      if (!extra.useBrowserAutofill) toast.error((err as Error).message || "Η σύνδεση ακυρώθηκε.");
    }
  }

  if (supported === false) return null;

  return (
    <div className="grid gap-2">
      <div className="relative flex items-center py-1 text-xs text-muted-foreground">
        <span className="flex-1 border-t" />
        <span className="px-2">ή</span>
        <span className="flex-1 border-t" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => start(() => tryAuthenticate())}
        disabled={pending}
        data-testid="passkey-login-btn"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
        Σύνδεση με passkey
      </Button>
    </div>
  );
}
