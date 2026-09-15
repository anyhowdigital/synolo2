"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, PenLine, X } from "lucide-react";
import { publicQuoteDecisionAction } from "@/app/actions/public";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "./signature-pad";
import { fill, publicText } from "@/lib/i18n/public";
import type { DocumentLanguage } from "@/lib/i18n/languages";

export function QuoteDecision({ token, defaultName, orgName, lang = "el" }: { token: string; defaultName?: string; orgName: string; lang?: DocumentLanguage }) {
  const tx = publicText(lang);
  const [mode, setMode] = useState<"idle" | "accept" | "reject">("idle");
  const [name, setName] = useState(defaultName ?? "");
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (status: "accepted" | "rejected") =>
    start(async () => {
      setError(null);
      const res = await publicQuoteDecisionAction(token, status, { name, note, signature, agree });
      if (!res.ok) setError(res.error);
    });

  if (mode === "idle") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={() => setMode("accept")}>
          <PenLine data-icon="inline-start" /> {tx.acceptSign}
        </Button>
        <Button size="lg" variant="outline" onClick={() => setMode("reject")}>
          <X data-icon="inline-start" /> {tx.reject}
        </Button>
      </div>
    );
  }

  const accepting = mode === "accept";
  return (
    <form
      className="grid gap-4 rounded-lg border bg-neutral-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(accepting ? "accepted" : "rejected");
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="decision-name">
          {tx.fullName} {accepting ? tx.signatory : ""}
        </Label>
        <Input id="decision-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} placeholder={tx.namePlaceholder} autoFocus />
      </div>
      {accepting ? (
        <div className="grid gap-2">
          <Label>{tx.signature}</Label>
          <SignaturePad onChange={setSignature} lang={lang} />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="decision-note">{accepting ? tx.commentOptional : tx.rejectReason}</Label>
        <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder={accepting ? tx.acceptPlaceholder : tx.rejectPlaceholder} />
      </div>
      {accepting ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
          <span>
            {fill(tx.agree, { org: orgName })}
          </span>
        </label>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" variant={accepting ? "default" : "destructive"} disabled={pending || (accepting && (!signature || !agree))}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : accepting ? <Check data-icon="inline-start" /> : <X data-icon="inline-start" />}
          {accepting ? tx.confirmAccept : tx.confirmReject}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => setMode("idle")} disabled={pending}>
          {tx.back}
        </Button>
      </div>
    </form>
  );
}
