"use client";

import { useState, useTransition } from "react";
import { InvoiceConfirmation, type InvoiceConfirmationContext } from "./invoice-confirmation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Clock, Download, Landmark, Loader2, RefreshCw, Send, TriangleAlert, XCircle } from "lucide-react";
import { refreshB2GStatusAction, sendB2GAction } from "@/app/actions/b2g";
import { B2G_STATUS_LABELS } from "@/lib/b2g/providers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { B2GRefsForm, type B2GRefsValues } from "./b2g-refs-form";

interface Props {
  invoiceId: string;
  confirmationContext: InvoiceConfirmationContext;
  environment: string;
  customerId: string | null;
  status: string;
  providerLabel: string;
  providerId: string | null;
  rawStatus: string | null;
  error: string | null;
  sentAt: string | null;
  statusAt: string | null;
  validationErrors: string[];
  refs: B2GRefsValues;
  canWrite: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const label = B2G_STATUS_LABELS[status] ?? status;
  if (status === "accepted") return <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 size-3" /> {label}</Badge>;
  if (status === "rejected" || status === "error") return <Badge variant="destructive"><XCircle className="mr-1 size-3" /> {label}</Badge>;
  if (status === "sent") return <Badge className="bg-blue-600">{label}</Badge>;
  if (status === "pending") return <Badge variant="secondary"><Clock className="mr-1 size-3" /> {label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

export function B2GCard({ invoiceId, confirmationContext, environment, customerId, status, providerLabel, providerId, rawStatus, error, sentAt, statusAt, validationErrors, refs, canWrite }: Props) {
  const [confirmSend, setConfirmSend] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const blocked = validationErrors.length > 0;
  const simulation = providerLabel.includes("Προσομοίωση") || rawStatus?.startsWith("simulation:") || providerId?.startsWith("SIM-");
  const alreadySent = !!providerId && ["pending", "sent", "accepted"].includes(status);
  const [downloading, startDownload] = useTransition();
  const download = () => startDownload(async () => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/ubl`);
      if (!response.ok) {
        const result = await response.json();
        toast.error(result.error || "Δεν ήταν δυνατή η λήψη XML.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `UBL-${invoiceId}.xml`; link.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Η λήψη δεν ολοκληρώθηκε. Δοκιμάστε ξανά."); }
  });

  const send = () =>
    startSend(async () => {
      setSendError(null);
      const res = await sendB2GAction(invoiceId);
      if (!res.ok) { setSendError(res.error); toast.error(res.error); return; }
      toast.success(res.message || `Ο πάροχος παρέλαβε το παραστατικό — ${B2G_STATUS_LABELS[res.status] ?? res.status}.`);
    });

  const refresh = () =>
    startRefresh(async () => {
      const res = await refreshB2GStatusAction(invoiceId);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Κατάσταση: ${B2G_STATUS_LABELS[res.status] ?? res.status}${res.message ? ` — ${res.message}` : ""}`);
    });

  return (
    <Card data-testid="b2g-card">
      <InvoiceConfirmation open={confirmSend} onOpenChange={setConfirmSend} context={confirmationContext} title="Αποστολή παραστατικού B2G" description={simulation ? "Θα γίνει μόνο προσομοίωση B2G. Δεν θα σταλεί το παραστατικό σε πραγματικό πάροχο ή δημόσιο φορέα." : `Θα σταλεί αυτό το παραστατικό μέσω ${providerLabel} στο ${environment === "prod" ? "παραγωγικό" : "δοκιμαστικό"} περιβάλλον. Η παραλαβή από τον πάροχο δεν σημαίνει αποδοχή από τον φορέα. Η αποστολή δεν αναιρείται με διαγραφή του παραστατικού.`} confirmLabel={simulation ? "Εκτέλεση προσομοίωσης" : "Επιβεβαίωση αποστολής B2G"} testId="b2g-confirm-send" pending={sending} onConfirm={() => { setConfirmSend(false); send(); }} />
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Landmark className="size-4 text-primary" /> Τιμολόγηση Δημοσίου
          <span data-testid="b2g-status"><StatusBadge status={status} /></span>
        </CardTitle>
        <CardDescription>{providerLabel} · PEPPOL BIS Billing 3.0 (UBL 2.1)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <B2GRefsForm invoiceId={invoiceId} values={refs} locked={!canWrite || alreadySent} />
        {simulation && <Alert data-testid="b2g-simulation-notice"><AlertDescription>Προσομοίωση: δεν έχει σταλεί τίποτα σε πάροχο ή φορέα Δημοσίου. Οι παρακάτω καταστάσεις είναι δοκιμαστικές.</AlertDescription></Alert>}
        {alreadySent && <p className="text-xs text-muted-foreground" data-testid="b2g-already-sent">Δεν απαιτείται νέα αποστολή. Ο έλεγχος κατάστασης ανανεώνει την απάντηση του παρόχου.</p>}
        {blocked ? (
          <Alert variant="destructive" data-testid="b2g-validation">
            <TriangleAlert className="size-4" />
            <AlertDescription>
              <ul className="list-disc pl-4">
                {validationErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {(blocked || error || sendError) && canWrite && <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm" data-testid="b2g-correction-links">{customerId && <Link className="text-primary underline underline-offset-4" href={`/customers/${customerId}/edit`} data-testid="b2g-fix-customer">Στοιχεία φορέα στην καρτέλα πελάτη</Link>}<Link className="text-primary underline underline-offset-4" href="/settings?tab=b2g" data-testid="b2g-fix-settings">Ρυθμίσεις παρόχου B2G</Link></p>}
        {error || sendError ? (
          <Alert variant="destructive">
            <AlertDescription data-testid="b2g-error">{sendError || error}</AlertDescription>
          </Alert>
        ) : null}

        <dl className="grid gap-1">
          {providerId ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Κωδικός παρόχου</dt>
              <dd className="font-mono text-xs" data-testid="b2g-provider-id">{providerId}</dd>
            </div>
          ) : null}
          {rawStatus ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Κατάσταση παρόχου</dt>
              <dd className="font-mono text-xs">{rawStatus}</dd>
            </div>
          ) : null}
          {sentAt ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Αποστολή</dt>
              <dd>{new Date(sentAt).toLocaleString("el-GR")}</dd>
            </div>
          ) : null}
          {statusAt && statusAt !== sentAt ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Τελευταίος έλεγχος</dt>
              <dd>{new Date(statusAt).toLocaleString("el-GR")}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2">
          {canWrite ? (
            <Button size="sm" onClick={() => setConfirmSend(true)} disabled={sending || refreshing || blocked || alreadySent} data-testid="b2g-send-btn">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {status === "not_sent" || status === "error" ? "Αποστολή στο Δημόσιο" : "Επαναποστολή"}
            </Button>
          ) : null}
          {canWrite && providerId ? (
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing || sending} data-testid="b2g-refresh-btn">
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Έλεγχος κατάστασης
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={download} disabled={downloading} data-testid="b2g-download-ubl">
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Λήψη UBL XML
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
