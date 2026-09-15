"use client";

import { useMemo, useState } from "react";
import { computeOpportunities, LEGAL_FORM_LABELS, type Financials, type TaxProfile } from "@/lib/tax/engine";
import { formatMoney } from "@/lib/invoice/totals";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EFKA = ["0", "7", "1", "2", "3", "4", "5", "6"];

export function WhatIfSimulator({ profile, financials }: { profile: TaxProfile; financials: Financials }) {
  const [sim, setSim] = useState<TaxProfile>(profile);
  const set = <K extends keyof TaxProfile>(k: K, v: TaxProfile[K]) => setSim((p) => ({ ...p, [k]: v }));

  const result = useMemo(() => {
    const ops = computeOpportunities(sim, financials);
    const total = ops.reduce((s, o) => s + Math.max(0, o.estimatedBenefit), 0);
    return { ops, total };
  }, [sim, financials]);

  const baseline = useMemo(() => {
    const ops = computeOpportunities(profile, financials);
    return ops.reduce((s, o) => s + Math.max(0, o.estimatedBenefit), 0);
  }, [profile, financials]);

  const diff = result.total - baseline;

  return (
    <div className="space-y-4" data-testid="what-if-simulator">
      <p className="text-sm text-muted-foreground">Δοκιμάστε σενάρια χωρίς να αλλάξετε το προφίλ σας — άμεσος επανυπολογισμός.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Νομική μορφή</Label>
          <Select value={sim.legalForm || "none"} onValueChange={(v) => set("legalForm", (v === "none" ? "" : v) as TaxProfile["legalForm"])}>
            <SelectTrigger data-testid="whatif-legal-form"><SelectValue placeholder="Επιλέξτε" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {Object.entries(LEGAL_FORM_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Κατηγορία ΕΦΚΑ</Label>
          <Select value={String(sim.efkaCategory)} onValueChange={(v) => set("efkaCategory", Number(v))}>
            <SelectTrigger data-testid="whatif-efka"><SelectValue /></SelectTrigger>
            <SelectContent>{EFKA.map((v) => <SelectItem key={v} value={v}>{v === "0" ? "—" : v === "7" ? "Νέων" : `${v}η`}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="whatif-rnd">Δαπάνες Ε&Α (€)</Label>
          <Input id="whatif-rnd" type="number" min={0} value={sim.rndSpend} onChange={(e) => set("rndSpend", Number(e.target.value))} data-testid="whatif-rnd" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="whatif-green">Πράσινες δαπάνες (€)</Label>
          <Input id="whatif-green" type="number" min={0} value={sim.greenSpend} onChange={(e) => set("greenSpend", Number(e.target.value))} data-testid="whatif-green" />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Δυνητικό όφελος σεναρίου</span>
          <span className="text-lg font-semibold text-emerald-600 tabular-nums" data-testid="whatif-total">~{formatMoney(result.total)}/έτος</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground" data-testid="whatif-diff">
          Έναντι τρέχοντος προφίλ: {diff === 0 ? "καμία διαφορά" : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff))}/έτος`}
        </div>
      </div>
    </div>
  );
}
