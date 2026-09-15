"use client";

import { useState } from "react";
import { CreditCard, QrCode, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildIrisPayload } from "@/lib/payments/iris";

export function VivaIrisPaymentOptions({ amount, currency, invoiceNumber, orgName, iban }: { amount: number; currency: string; invoiceNumber: string; orgName: string; iban?: string }) {
  const [copied, setCopied] = useState(false);
  const irisPayload = iban ? buildIrisPayload({ beneficiaryName: orgName, iban, amount, invoiceNumber }) : "";
  const qrSrc = iban
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(irisPayload)}`
    : "";

  function copyIban() {
    if (!iban) return;
    navigator.clipboard.writeText(iban).then(() => {
      setCopied(true);
      toast.success("IBAN αντιγράφηκε.");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function payWithViva() {
    if (typeof window === "undefined") return;
    fetch("/api/viva/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: (window.location.pathname.split("/")[2] ?? "") }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { toast.error(d.error ?? "Αποτυχία Viva"); return; }
        if (d.mode === "demo") toast.info(d.message ?? "Demo mode — ρυθμίστε Viva credentials.");
        window.location.href = d.checkoutUrl;
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Πληρωμή για Έλληνες πελάτες</span>
          <Badge variant="secondary" className="text-[10px]">Beta</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><QrCode className="size-4" /> Πληρωμή με IRIS</div>
          <div className="flex flex-col items-center gap-2 rounded-md bg-white p-3">
            <img src={qrSrc} alt="IRIS QR" width={160} height={160} className="rounded" />
            <div className="text-xs text-muted-foreground">Σκανάρετε από την τραπεζική εφαρμογή</div>
          </div>
          {iban ? (
            <button type="button" onClick={copyIban} className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted">
              {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              <span className="font-mono">{iban}</span>
            </button>
          ) : null}
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><CreditCard className="size-4" /> Κάρτα μέσω Viva Wallet</div>
          <p className="mb-3 text-xs text-muted-foreground">Ασφαλής πληρωμή με χρεωστική/πιστωτική κάρτα, στην πλατφόρμα Viva Wallet Smart Checkout.</p>
          <Button type="button" className="w-full" onClick={payWithViva} data-testid="viva-pay-btn">
            Πληρωμή {amount.toFixed(2)} {currency} με Viva
          </Button>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Πληρώνετε στο <strong>{orgName}</strong> για το παραστατικό <strong>{invoiceNumber}</strong>.
            Δεκτές: Visa, Mastercard, Maestro, Amex, Apple Pay, Google Pay.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
