"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Loader2, Mail, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { getPortalLinkAction, rotatePortalLinkAction, sendPortalInviteAction } from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PortalCard({ customerId, email, initialUrl, lastSeenAt, canWrite }: { customerId: string; email: string; initialUrl: string | null; lastSeenAt: string | null; canWrite: boolean }) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const ensureUrl = async () => {
    if (url) return url;
    const r = await getPortalLinkAction(customerId);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    setUrl(r.url);
    return r.url;
  };

  const copy = () =>
    start(async () => {
      const u = await ensureUrl();
      if (!u) return;
      try {
        await navigator.clipboard.writeText(u);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.message("Αντιγράψτε τον σύνδεσμο από το πεδίο.");
      }
    });

  const invite = () =>
    start(async () => {
      const r = await sendPortalInviteAction(customerId);
      if (!r.ok) return void toast.error(r.error);
      if (r.warning) toast.warning(r.warning);
      else toast.success("Η πρόσκληση στάλθηκε στον πελάτη.");
      await ensureUrl();
    });

  const rotate = () =>
    start(async () => {
      if (!confirm("Ο υπάρχων σύνδεσμος θα σταματήσει να ισχύει. Συνέχεια;")) return;
      const r = await rotatePortalLinkAction(customerId);
      if (!r.ok) return void toast.error(r.error);
      setUrl(r.url);
      toast.success("Ο σύνδεσμος ανανεώθηκε.");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" /> Σελίδα πελάτη (portal)
        </CardTitle>
        <CardDescription>
          Ο πελάτης βλέπει όλα τα παραστατικά, το υπόλοιπο και τις πληρωμές του, κατεβάζει PDF και πληρώνει online – χωρίς κωδικό, με προσωπικό σύνδεσμο.
          {lastSeenAt ? ` Τελευταία επίσκεψη ${new Date(lastSeenAt).toLocaleString("el-GR")}.` : " Δεν έχει επισκεφθεί ακόμη τη σελίδα."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {url ? (
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" size="icon" onClick={copy} disabled={pending} title="Αντιγραφή">
              {copied ? <Check className="text-emerald-600" /> : <Copy />}
            </Button>
            <Button asChild variant="outline" size="icon" title="Άνοιγμα (προεπισκόπηση)">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink />
              </a>
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!url ? (
            <Button type="button" variant="outline" size="sm" onClick={copy} disabled={pending || !canWrite}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              Δημιουργία συνδέσμου
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={invite} disabled={pending || !canWrite || !email} title={!email ? "Ο πελάτης δεν έχει email" : undefined}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
            Αποστολή πρόσκλησης{email ? ` στο ${email}` : ""}
          </Button>
          {url && canWrite ? (
            <Button type="button" variant="ghost" size="sm" onClick={rotate} disabled={pending}>
              <RefreshCw data-icon="inline-start" /> Ανανέωση συνδέσμου
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
