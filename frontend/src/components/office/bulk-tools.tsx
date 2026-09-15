"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, CloudUpload, Download, Loader2, Lock, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { bulkBooksCsvAction, bulkClassifyExpensesAction, bulkTransmitAction } from "@/app/actions/office";
import { bulkPeriodLockAction, createDeadlineTasksAction } from "@/app/actions/office-tools";

interface Client {
  orgId: string;
  name: string;
  afm: string;
  readOnly: boolean;
}

export function OfficeBulkTools({ month, clients, initialSelected = [], focusAction }: { month: string; clients: Client[]; initialSelected?: string[]; focusAction?: "transmit" | "classify" }) {
  const [sel, setSel] = useState<string[]>(initialSelected);
  const [period, setPeriod] = useState(month);
  const [pending, start] = useTransition();
  const [log, setLog] = useState<string[]>([]);

  const selectable = clients.filter((c) => !c.readOnly);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    if (!sel.length) {
      toast.error("Επιλέξτε τουλάχιστον έναν πελάτη.");
      return;
    }
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Η ενέργεια απέτυχε.");
        return;
      }
      const msg = `${label}: ${res.message ?? "ολοκληρώθηκε"}`;
      setLog((l) => [msg, ...l].slice(0, 8));
      toast.success(msg);
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Μαζικές ενέργειες πελατών</h1>
        <p className="text-sm text-muted-foreground">Διαβίβαση myDATA, χαρακτηρισμοί, εξαγωγή βιβλίων, κλείδωμα περιόδου και εκκρεμότητες προθεσμιών — σε πολλούς πελάτες μαζί.</p>
        {focusAction && initialSelected.length ? (
          <p className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" data-testid="bulk-focus-hint">
            Ήρθατε από τα «Λάθη & προσοχή»: ο πελάτης <strong>{clients.find((c) => c.orgId === initialSelected[0])?.name}</strong> είναι ήδη επιλεγμένος — πατήστε «{focusAction === "transmit" ? "Διαβίβαση myDATA" : "Χαρακτηρισμοί εξόδων"}» παρακάτω.
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Επιλογή πελατών</CardTitle>
          <CardDescription>
            {sel.length} επιλεγμένοι από {selectable.length} διαθέσιμους (οι πελάτες με περιορισμένη πρόσβαση εξαιρούνται).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSel(selectable.map((c) => c.orgId))} data-testid="bulk-select-all">
              Επιλογή όλων
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSel([])} data-testid="bulk-clear">
              Καθαρισμός
            </Button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="bulk-client-list">
            {clients.map((c) => (
              <label key={c.orgId} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={sel.includes(c.orgId)} disabled={c.readOnly} onCheckedChange={() => toggle(c.orgId)} data-testid={`bulk-client-${c.orgId}`} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.readOnly ? <Badge variant="outline">περιορισμένη</Badge> : <span className="text-xs text-muted-foreground">{c.afm}</span>}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. Ενέργειες</CardTitle>
          <CardDescription>Κάθε ενέργεια εκτελείται μόνο στους επιλεγμένους πελάτες και καταγράφεται στο ιστορικό τους.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run("Διαβίβαση myDATA", async () => { const r = await bulkTransmitAction(sel); return { ok: r.ok, error: "error" in r ? r.error : undefined, message: "message" in r ? String(r.message) : undefined }; })} data-testid="bulk-transmit">
              <CloudUpload data-icon="inline-start" /> Διαβίβαση myDATA
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => run("Χαρακτηρισμοί εξόδων", async () => { const r = await bulkClassifyExpensesAction(sel); return { ok: r.ok, error: "error" in r ? r.error : undefined, message: "message" in r ? String(r.message) : undefined }; })} data-testid="bulk-classify">
              <Tags data-icon="inline-start" /> Χαρακτηρισμοί εξόδων
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => run("Εκκρεμότητες προθεσμιών", async () => { const r = await createDeadlineTasksAction(sel); return { ok: r.ok, error: "error" in r ? r.error : undefined, message: r.ok ? `${r.created} νέες εκκρεμότητες` : undefined }; })} data-testid="bulk-deadline-tasks">
              <CalendarPlus data-icon="inline-start" /> Εκκρεμότητες από προθεσμίες
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run("Εξαγωγή βιβλίων", async () => {
                  const r = await bulkBooksCsvAction(sel);
                  if (!r.ok) return { ok: false, error: "error" in r ? r.error : "Αποτυχία" };
                  const blob = new Blob([(r as { csv: string }).csv], { type: "text/csv;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `books-${sel.length}-clients.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  return { ok: true, message: "το αρχείο κατέβηκε" };
                })
              }
              data-testid="bulk-books-csv"
            >
              <Download data-icon="inline-start" /> Εξαγωγή βιβλίων CSV
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="lock-period">
                Κλείδωμα περιόδου
              </label>
              <Input id="lock-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" data-testid="bulk-lock-period" />
            </div>
            <Button variant="destructive" disabled={pending} onClick={() => run("Κλείδωμα περιόδου", async () => { const r = await bulkPeriodLockAction(sel, period); return { ok: r.ok, error: "error" in r ? r.error : undefined, message: r.ok ? `${r.locked} κλείδωσαν · ${r.skipped} ήταν ήδη κλειστές` : undefined }; })} data-testid="bulk-lock">
              <Lock data-icon="inline-start" /> Κλείδωμα
            </Button>
            {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
        </CardContent>
      </Card>

      {log.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Τελευταίες ενέργειες</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm" data-testid="bulk-log">
            {log.map((l, i) => (
              <div key={i} className="text-muted-foreground">
                {l}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
