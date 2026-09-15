"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { publicPostMessageAction } from "@/app/actions/public";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fill, publicText } from "@/lib/i18n/public";
import type { DocumentLanguage } from "@/lib/i18n/languages";

export interface ThreadMessage {
  id: string;
  authorName: string;
  authorType: string;
  body: string;
  createdAt: string;
}

const LOCALE: Record<DocumentLanguage, string> = { el: "el-GR", en: "en-GB", de: "de-DE", it: "it-IT" };

function when(iso: string, lang: DocumentLanguage) {
  return new Date(iso).toLocaleString(LOCALE[lang], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Συζήτηση πελάτη–εκδότη στη δημόσια σελίδα παραστατικού. */
export function PublicThread({ token, messages, orgName, defaultName, closed, lang = "el" }: { token: string; messages: ThreadMessage[]; orgName: string; defaultName?: string; closed?: boolean; lang?: DocumentLanguage }) {
  const tx = publicText(lang);
  const [name, setName] = useState(defaultName ?? "");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setError(null);
      const res = await publicPostMessageAction(token, { name, body });
      if (res.ok) setBody("");
      else setError(res.error);
    });

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm print:hidden">
      <div className="flex items-center gap-2 font-medium">
        <MessageSquare className="size-4 text-muted-foreground" /> {tx.threadTitle}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{fill(tx.threadIntro, { org: orgName })}</p>

      {messages.length ? (
        <ul className="mt-4 space-y-3">
          {messages.map((m) => {
            const mine = m.authorType === "customer";
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-neutral-100")}>
                  <div className={cn("mb-0.5 text-[11px]", mine ? "text-white/80" : "text-muted-foreground")}>
                    {mine ? m.authorName : `${orgName} · ${m.authorName}`} · {when(m.createdAt, lang)}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {closed ? null : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div className="grid gap-1.5">
              <Label htmlFor="thread-name">{tx.yourName}</Label>
              <Input id="thread-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={tx.fullName} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="thread-body">{tx.message}</Label>
              <Textarea id="thread-body" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} required placeholder={tx.messagePlaceholder} />
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending || body.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              {tx.sendMessage}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
