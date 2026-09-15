"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Copy, PlayCircle, Loader2, Info } from "lucide-react";
import { checkVivaStatus, simulateVivaWebhook, type VivaStatus } from "@/app/actions/viva-test";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function VivaStatusPanel() {
  const [status, setStatus] = useState<VivaStatus | null>(null);
  const [loading, startLoad] = useTransition();
  const [simulating, startSim] = useTransition();

  const refresh = () =>
    startLoad(async () => {
      const res = await checkVivaStatus();
      if (res.ok) setStatus(res);
      else toast.error(res.error);
    });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSim = () =>
    startSim(async () => {
      const res = await simulateVivaWebhook();
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Προσομοίωση επιτυχής: εξοφλήθηκε τιμολόγιο ${res.invoiceId.slice(0, 8)} με ${res.amount.toFixed(2)}€ (ref ${res.transactionId}).`);
    });

  return (
    <Card data-testid="viva-status-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Viva Wallet — Κατάσταση σύνδεσης
          {status ? (
            status.mode === "live" ? (
              <Badge className="bg-emerald-600">Live</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-700">Demo</Badge>
            )
          ) : null}
        </CardTitle>
        <CardDescription>Έλεγχος διαπιστευτηρίων και προσομοίωση webhook χωρίς κάρτα.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading || !status ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Έλεγχος κατάστασης…
          </div>
        ) : (
          <>
            <ul className="grid gap-2 text-sm">
              <li className="flex items-center gap-2">
                {status.merchantConfigured ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-muted-foreground" />}
                <span>Merchant ID & API Key</span>
                {!status.merchantConfigured ? <span className="text-xs text-muted-foreground">(VIVA_MERCHANT_ID, VIVA_API_KEY)</span> : null}
              </li>
              <li className="flex items-center gap-2">
                {status.webhookKeyConfigured ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-muted-foreground" />}
                <span>Webhook verification key</span>
                {!status.webhookKeyConfigured ? <span className="text-xs text-muted-foreground">(VIVA_WEBHOOK_KEY)</span> : null}
              </li>
            </ul>

            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Info className="size-3.5" /> URL για Viva self-care → Webhooks
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs" data-testid="viva-webhook-url">{status.webhookUrl}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="copy-viva-webhook-url"
                  onClick={async () => { await navigator.clipboard.writeText(status.webhookUrl); toast.success("Αντιγράφηκε."); }}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ρυθμίστε τα webhook events 1796 (Transaction Payment Created) και 1797 (Refund) στο{" "}
                <Link href="https://demo.vivapayments.com/selfcare/en/webhooks" target="_blank" className="underline">Viva self-care</Link>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={simulating}
                onClick={runSim}
                data-testid="simulate-viva-webhook"
              >
                {simulating ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                Προσομοίωση webhook (demo mode)
              </Button>
              <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>Ανανέωση κατάστασης</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Η προσομοίωση θα εντοπίσει το πρώτο ανεξόφλητο τιμολόγιο και θα καταχωρήσει εξόφληση όπως θα έκανε το πραγματικό Viva webhook — για επαλήθευση end-to-end δίχως συναλλαγή με κάρτα.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
