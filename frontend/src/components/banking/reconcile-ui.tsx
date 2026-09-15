"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, EyeOff, Link2, Loader2, MoreHorizontal, Sparkles, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { applyMatchAction, autoReconcileAction, bookAsEntryAction, deleteBatchAction, matchCandidatesAction, setTxStatusAction } from "@/app/actions/banking";
import type { BankTransaction } from "@/db/schema";
import { ENTRY_KIND_LABELS, type EntryKind, type MatchCandidate } from "@/lib/services/banking";
import { formatDate, formatMoney, round2 } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function AutoReconcileButton({ accountId, unmatched }: { accountId: string; unmatched: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending || unmatched === 0}
      onClick={() =>
        start(async () => {
          const res = await autoReconcileAction(accountId);
          if (res.ok) toast.success(res.warning ?? "Η συμφωνία ολοκληρώθηκε.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
      Αυτόματη συμφωνία{unmatched ? ` (${unmatched})` : ""}
    </Button>
  );
}

const ENTRY_KINDS_IN: EntryKind[] = ["other_in", "owner_in", "interest"];
const ENTRY_KINDS_OUT: EntryKind[] = ["fee", "tax", "other_out", "owner_out"];

/** Ενέργειες γραμμής extrait: σύνδεση με παραστατικό, καταχώρηση ως λοιπή κίνηση, παράβλεψη, αποσύνδεση. */
export function TransactionActions({ tx, canWrite }: { tx: BankTransaction; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [matchOpen, setMatchOpen] = useState(false);
  if (!canWrite) return null;
  const run = (fn: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.warning ? `${msg} ${res.warning}` : msg);
      else toast.error(res.error);
    });

  if (tx.status === "matched") {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Αποσύνδεση" title="Αποσύνδεση από την είσπραξη/πληρωμή (η είσπραξη παραμένει)" disabled={pending} onClick={() => run(() => setTxStatusAction(tx.id, "unmatched"), "Η κίνηση αποσυνδέθηκε.")}>
        <Undo2 />
      </Button>
    );
  }
  if (tx.status === "ignored") {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Επαναφορά" title="Επαναφορά σε ασυμφώνητη" disabled={pending} onClick={() => run(() => setTxStatusAction(tx.id, "unmatched"), "Η κίνηση επανήλθε.")}>
        <Undo2 />
      </Button>
    );
  }
  const kinds = tx.amount > 0 ? ENTRY_KINDS_IN : ENTRY_KINDS_OUT;
  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => setMatchOpen(true)}>
          <Link2 data-icon="inline-start" /> Σύνδεση
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Περισσότερες ενέργειες" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Καταχώρηση ως…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Λοιπή κίνηση λογαριασμού</DropdownMenuLabel>
                {kinds.map((k) => (
                  <DropdownMenuItem key={k} onClick={() => run(() => bookAsEntryAction(tx.id, k), `Καταχωρήθηκε ως «${ENTRY_KIND_LABELS[k]}».`)}>
                    {ENTRY_KIND_LABELS[k]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => run(() => bookAsEntryAction(tx.id, "transfer"), "Καταχωρήθηκε ως μεταφορά.")}>Μεταφορά από/προς άλλο λογαριασμό</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => run(() => setTxStatusAction(tx.id, "ignored"), "Η κίνηση παραβλέφθηκε.")}>
              <EyeOff data-icon="inline-start" /> Παράβλεψη (δεν αφορά την επιχείρηση)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {matchOpen ? <MatchDialog tx={tx} onClose={() => setMatchOpen(false)} /> : null}
    </>
  );
}

function MatchDialog({ tx, onClose }: { tx: BankTransaction; onClose: () => void }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [selected, setSelected] = useState<MatchCandidate | null>(null);
  const [amount, setAmount] = useState(String(Math.abs(tx.amount)));
  const [pending, start] = useTransition();
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    matchCandidatesAction(tx.id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCandidates(res.candidates);
        if (res.candidates[0]) {
          setSelected(res.candidates[0]);
          setAmount(String(round2(Math.min(Math.abs(tx.amount), res.candidates[0].remaining))));
        }
      } else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [tx.id, tx.amount]);

  const pick = (c: MatchCandidate) => {
    setSelected(c);
    setAmount(String(round2(Math.min(Math.abs(tx.amount), c.remaining))));
  };

  const submit = () =>
    start(async () => {
      if (!selected) return;
      const res = await applyMatchAction(tx.id, selected.type, selected.id, Number(amount));
      if (res.ok) {
        toast.success(res.warning ? `Συνδέθηκε. ${res.warning}` : "Η κίνηση συνδέθηκε.");
        onClose();
        router.refresh();
      } else toast.error(res.error);
    });

  const inflow = tx.amount > 0;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Σύνδεση κίνησης με {inflow ? "τιμολόγιο πώλησης" : "τιμολόγιο αγοράς"}</DialogTitle>
          <DialogDescription>
            {formatDate(tx.bookedAt)} · {tx.description} · <span className={cn("font-mono", inflow ? "text-emerald-700" : "text-destructive")}>{formatMoney(tx.amount)}</span>
            <br />
            Θα δημιουργηθεί {inflow ? "είσπραξη" : "πληρωμή προμηθευτή"} στον λογαριασμό με το ποσό που θα επιλέξετε.
          </DialogDescription>
        </DialogHeader>
        {candidates === null && !loadError ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Αναζήτηση ανοιχτών παραστατικών…
          </p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : candidates && candidates.length === 0 ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">Δεν βρέθηκαν ανοιχτά {inflow ? "τιμολόγια πώλησης" : "τιμολόγια αγοράς"}. Καταχωρήστε πρώτα το παραστατικό ή καταχωρήστε την κίνηση ως λοιπή κίνηση.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-auto rounded-md border" role="listbox" aria-label="Υποψήφια παραστατικά">
            {candidates!.map((c) => {
              const active = selected?.id === c.id;
              return (
                <li key={c.id}>
                  <button type="button" role="option" aria-selected={active} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted", active && "bg-muted")} onClick={() => pick(c)}>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", active && "border-primary bg-primary text-primary-foreground")}>{active ? <Check className="size-3" /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.counterparty} · {formatDate(c.date)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono tabular-nums">{formatMoney(c.remaining)}</span>
                      <Badge variant={c.score >= 85 ? "default" : c.score >= 45 ? "secondary" : "outline"} className="text-[10px]">
                        {c.score >= 85 ? "Πολύ πιθανό" : c.score >= 45 ? "Πιθανό" : "Χαμηλή πιθανότητα"}
                      </Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected ? (
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="match-amount">Ποσό {inflow ? "είσπραξης" : "πληρωμής"}</Label>
            <Input id="match-amount" type="number" step="0.01" min={0.01} max={Math.min(Math.abs(tx.amount), selected.remaining)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {Number(amount) < Math.abs(tx.amount) - 0.005 ? <p className="text-xs text-muted-foreground">Το υπόλοιπο της κίνησης ({formatMoney(round2(Math.abs(tx.amount) - Number(amount)))}) δεν θα συνδεθεί.</p> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !selected || !(Number(amount) > 0)}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
            Σύνδεση & καταχώρηση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteBatchButton({ batchId, count }: { batchId: string; count: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      title="Διαγραφή αυτής της εισαγωγής (μόνο ασυμφώνητες κινήσεις)"
      onClick={() => {
        if (!confirm(`Διαγραφή εισαγωγής με ${count} κινήσεις;`)) return;
        start(async () => {
          const res = await deleteBatchAction(batchId);
          if (res.ok) toast.success(res.warning ?? "Η εισαγωγή διαγράφηκε.");
          else toast.error(res.error);
        });
      }}
    >
      <Trash2 data-icon="inline-start" /> Αναίρεση εισαγωγής
    </Button>
  );
}
