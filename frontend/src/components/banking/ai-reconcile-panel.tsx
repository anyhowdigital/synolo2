"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Scissors, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/invoice/totals";
import { ENTRY_KIND_LABELS, type MatchCandidate } from "@/lib/services/banking";
import { RULE_ACTION_LABELS, type AiSuggestion } from "@/lib/services/bank-ai";
import { aiSuggestAction, applyRulesAction, applySuggestionsAction, deleteRuleAction, splitMatchAction } from "@/app/actions/bank-ai";
import { matchCandidatesAction } from "@/app/actions/banking";

type Rule = { id: string; keyword: string; action: string; entryKind: string; targetName: string; hits: number };
type Tx = { id: string; bookedAt: string; amount: number; description: string; counterparty: string };

export function AiReconcilePanel({ accountId, unmatched, rules, unmatchedTxs }: { accountId: string; unmatched: number; rules: Rule[]; unmatchedTxs: Tx[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [splitTx, setSplitTx] = useState<Tx | null>(null);
  const [cands, setCands] = useState<MatchCandidate[]>([]);
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const openSplit = (tx: Tx) => {
    setSplitTx(tx);
    setCands([]);
    setAlloc({});
    start(async () => {
      const res = await matchCandidatesAction(tx.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCands(res.candidates);
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="size-4 text-primary" /> AI συμφωνία & κανόνες
          </CardTitle>
          <CardDescription>
            Πρώτα εφαρμόζονται οι κανόνες που έχει μάθει η εφαρμογή (χωρίς AI). Για τις υπόλοιπες κινήσεις το AI προτείνει ταύτιση ή χαρακτηρισμό — τίποτα δεν εκτελείται χωρίς την έγκρισή σας.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={pending || unmatched === 0}
            data-testid="apply-rules-btn"
            onClick={() =>
              start(async () => {
                const res = await applyRulesAction(accountId);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(res.message);
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
            Εφαρμογή κανόνων ({rules.length})
          </Button>
          <Button
            disabled={pending || unmatched === 0}
            data-testid="ai-suggest-btn"
            onClick={() =>
              start(async () => {
                const res = await aiSuggestAction(accountId);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                setSuggestions(res.suggestions);
                setSelected(res.suggestions.filter((s) => s.confidence >= 75).map((s) => s.txId));
                toast.success(`${res.suggestions.length} προτάσεις από ${res.scanned} κινήσεις.`);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            AI προτάσεις ({unmatched})
          </Button>
        </CardContent>
      </Card>

      {suggestions ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Προτάσεις AI ({suggestions.length})</CardTitle>
            <CardDescription>Επιλέξτε ό,τι εγκρίνετε. Με την έγκριση δημιουργείται και κανόνας, ώστε οι επόμενες ίδιες κινήσεις να ταιριάζουν αυτόματα.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3" data-testid="ai-suggestions-list">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Το AI δεν βρήκε ασφαλείς προτάσεις για αυτές τις κινήσεις.</p>
            ) : (
              <>
                {suggestions.map((s) => (
                  <div key={s.txId} className="flex flex-wrap items-start gap-3 rounded-lg border p-3" data-testid={`ai-suggestion-${s.txId}`}>
                    <Checkbox checked={selected.includes(s.txId)} onCheckedChange={() => toggle(s.txId)} data-testid={`ai-select-${s.txId}`} />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">{formatMoney(s.txAmount)}</span>
                        <span className="text-xs text-muted-foreground">{s.txDate}</span>
                        <Badge variant={s.confidence >= 80 ? "secondary" : "outline"}>βεβαιότητα {s.confidence}%</Badge>
                        <Badge variant="outline">
                          {s.kind === "match" ? "Ταύτιση παραστατικού" : s.kind === "entry" ? `Λοιπή κίνηση: ${ENTRY_KIND_LABELS[s.entryKind ?? "other_out"]}` : "Παράβλεψη"}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{s.txLabel}</div>
                      {s.candidateLabel ? <div className="mt-1 text-xs">→ {s.candidateLabel}</div> : null}
                      {s.reason ? <div className="mt-1 text-xs text-muted-foreground">{s.reason}</div> : null}
                    </div>
                  </div>
                ))}
                <Button
                  disabled={pending || selected.length === 0}
                  data-testid="ai-apply-selected"
                  onClick={() =>
                    start(async () => {
                      const list = suggestions.filter((s) => selected.includes(s.txId));
                      const res = await applySuggestionsAction(list);
                      if (!res.ok) {
                        toast.error(res.error);
                        return;
                      }
                      toast.success(res.message);
                      setSuggestions(null);
                      setSelected([]);
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Έγκριση επιλεγμένων ({selected.length})
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {unmatchedTxs.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Επιμερισμός κίνησης σε πολλά παραστατικά</CardTitle>
            <CardDescription>Χρήσιμο όταν μία κατάθεση εξοφλεί πολλά τιμολόγια ή καλύπτει μέρος ενός.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y" data-testid="split-tx-list">
            {unmatchedTxs.slice(0, 12).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0">
                <div className="min-w-0">
                  <div className="truncate">{t.description || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.bookedAt} · {t.counterparty || "χωρίς αντισυμβαλλόμενο"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatMoney(t.amount)}</span>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => openSplit(t)} data-testid={`split-open-${t.id}`}>
                    <Scissors data-icon="inline-start" />
                    Επιμερισμός
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {rules.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Κανόνες που έχει μάθει η εφαρμογή ({rules.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm" data-testid="bank-rules-list">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate font-medium">«{r.keyword}»</div>
                  <div className="text-xs text-muted-foreground">
                    {RULE_ACTION_LABELS[(r.action as keyof typeof RULE_ACTION_LABELS) ?? "entry"]}
                    {r.entryKind ? ` · ${ENTRY_KIND_LABELS[r.entryKind as keyof typeof ENTRY_KIND_LABELS] ?? r.entryKind}` : ""}
                    {r.targetName ? ` · ${r.targetName}` : ""} · {r.hits} εφαρμογές
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  data-testid={`rule-delete-${r.id}`}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteRuleAction(r.id);
                      if (!res.ok) {
                        toast.error(res.error);
                        return;
                      }
                      toast.success("Ο κανόνας διαγράφηκε.");
                      router.refresh();
                    })
                  }
                >
                  <Trash2 data-icon="inline-start" />
                  Διαγραφή
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={!!splitTx} onOpenChange={(o) => !o && setSplitTx(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Επιμερισμός {splitTx ? formatMoney(splitTx.amount) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3" data-testid="split-dialog">
            {cands.length === 0 ? (
              <p className="text-sm text-muted-foreground">{pending ? "Φόρτωση υποψηφίων…" : "Δεν βρέθηκαν υποψήφια παραστατικά."}</p>
            ) : (
              cands.map((c) => (
                <div key={c.id} className="grid gap-1">
                  <Label htmlFor={`alloc-${c.id}`} className="text-xs">
                    {c.label} · {c.counterparty} · υπόλοιπο {formatMoney(c.remaining)}
                  </Label>
                  <Input
                    id={`alloc-${c.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max={c.remaining}
                    placeholder="0,00"
                    value={alloc[c.id] ?? ""}
                    onChange={(e) => setAlloc((a) => ({ ...a, [c.id]: e.target.value }))}
                    data-testid={`alloc-input-${c.id}`}
                  />
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !splitTx}
              data-testid="split-apply"
              onClick={() =>
                start(async () => {
                  const allocations = cands
                    .map((c) => ({ type: c.type, id: c.id, amount: Number(alloc[c.id] ?? 0) }))
                    .filter((a) => a.amount > 0);
                  const res = await splitMatchAction(splitTx!.id, allocations);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(res.message);
                  setSplitTx(null);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Καταχώρηση επιμερισμού
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
