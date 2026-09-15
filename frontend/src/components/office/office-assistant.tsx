"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { officeBriefAction, type OfficeBrief } from "@/app/actions/office-ai";

const PROMPTS = ["Τι εκκρεμεί σήμερα σε όλους τους πελάτες;", "Ποιοι πελάτες κινδυνεύουν με πρόστιμο;", "Ετοίμασε πλάνο για την υποβολή ΦΠΑ", "Ποιες εκκρεμότητες να ανατεθούν πρώτες;"];

export function OfficeAssistant() {
  const [instruction, setInstruction] = useState("");
  const [brief, setBrief] = useState<OfficeBrief | null>(null);
  const [pending, start] = useTransition();

  const run = (text: string) =>
    start(async () => {
      const res = await officeBriefAction(text);
      if (!res.ok) { toast.error(res.error); return; }
      setBrief(res.brief);
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Βοηθός γραφείου</h1>
        <p className="text-sm text-muted-foreground">Διαβάζει την πραγματική κατάσταση όλων των πελατών σας (κίνδυνοι, myDATA, προθεσμίες, εκκρεμότητες) και προτείνει πλάνο ημέρας.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <Button key={p} size="sm" variant="outline" disabled={pending} data-testid={`assistant-prompt-${PROMPTS.indexOf(p)}`} onClick={() => run(p)}>
                {p}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Δική σας οδηγία (προαιρετικά)…" data-testid="assistant-input" />
            <Button disabled={pending} data-testid="assistant-run" onClick={() => run(instruction)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              Πλάνο ημέρας
            </Button>
          </div>
        </CardContent>
      </Card>

      {brief ? (
        <div className="space-y-4" data-testid="assistant-result">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Σύνοψη</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed">{brief.summary || "—"}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ενέργειες σήμερα ({brief.todayActions.length})</CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {brief.todayActions.length === 0 ? (
                <p className="py-4 text-muted-foreground">Καμία άμεση ενέργεια.</p>
              ) : (
                brief.todayActions.map((a, idx) => (
                  <div key={idx} className="flex flex-wrap items-start justify-between gap-2 py-2 first:pt-0" data-testid={`assistant-action-${idx}`}>
                    <div className="min-w-0">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.clientName} · {a.why}
                      </div>
                    </div>
                    <Badge variant={a.priority === "high" ? "destructive" : a.priority === "medium" ? "outline" : "secondary"}>{a.priority}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {brief.perClient.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ανά πελάτη</CardTitle>
              </CardHeader>
              <CardContent className="divide-y text-sm">
                {brief.perClient.map((c, idx) => (
                  <div key={idx} className="py-3 first:pt-0">
                    <div className="font-medium">{c.clientName}</div>
                    <div className="text-xs text-muted-foreground">{c.headline}</div>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {c.actions.map((a) => (
                        <li key={a}>· {a}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Οι προτάσεις είναι συμβουλευτικές. Δείτε τις{" "}
            <Link href="/office/inbox" className="underline">
              ειδοποιήσεις
            </Link>{" "}
            για τα ακριβή δεδομένα.
          </p>
        </div>
      ) : null}
    </div>
  );
}
