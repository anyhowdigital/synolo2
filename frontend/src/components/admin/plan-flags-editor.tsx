"use client";

import { useState, useTransition } from "react";
import { ALL_CAPABILITIES, CAPABILITY_LABELS, type Capability, type PlanId, type PlatformPlanOverrides } from "@/lib/billing/plans";
import { savePlanOverridesAction } from "@/app/actions/admin";

export type PlanState = { id: PlanId; name: string; capabilities: Capability[]; invoiceLimit: number | null; userLimit: number | null };

export function PlanFlagsEditor({ plans }: { plans: PlanState[] }) {
  const [state, setState] = useState<PlanState[]>(plans);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const toggleCap = (pid: PlanId, cap: Capability) =>
    setState((prev) => prev.map((p) => (p.id === pid ? { ...p, capabilities: p.capabilities.includes(cap) ? p.capabilities.filter((c) => c !== cap) : [...p.capabilities, cap] } : p)));

  const setLimit = (pid: PlanId, key: "invoiceLimit" | "userLimit", v: number | null) =>
    setState((prev) => prev.map((p) => (p.id === pid ? { ...p, [key]: v } : p)));

  const save = () =>
    start(async () => {
      const overrides: PlatformPlanOverrides = {};
      for (const p of state) overrides[p.id] = { capabilities: p.capabilities, invoiceLimit: p.invoiceLimit, userLimit: p.userLimit };
      const res = await savePlanOverridesAction(overrides);
      setMsg(res.ok ? "Οι αλλαγές αποθηκεύτηκαν." : res.error ?? "Σφάλμα.");
    });

  return (
    <div className="space-y-6" data-testid="plan-flags-editor">
      <div className="grid gap-4 lg:grid-cols-2">
        {state.map((p) => (
          <div key={p.id} className="space-y-4 rounded-xl border p-4" data-testid={`plan-card-${p.id}`}>
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <div className="grid gap-2">
              {ALL_CAPABILITIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={p.capabilities.includes(c)}
                    onChange={() => toggleCap(p.id, c)}
                    className="size-4"
                    data-testid={`plan-cap-${p.id}-${c}`}
                  />
                  <span className="text-muted-foreground">{CAPABILITY_LABELS[c]}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlanLimit label="Παραστατικά/μήνα" testid={`plan-invlimit-${p.id}`} value={p.invoiceLimit} onChange={(v) => setLimit(p.id, "invoiceLimit", v)} />
              <PlanLimit label="Χρήστες" testid={`plan-userlimit-${p.id}`} value={p.userLimit} onChange={(v) => setLimit(p.id, "userLimit", v)} />
            </div>
          </div>
        ))}
      </div>
      {msg ? <p className="text-sm text-emerald-600" data-testid="plan-flags-msg">{msg}</p> : null}
      <button onClick={save} disabled={pending} className="h-10 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground" data-testid="plan-flags-save">
        Αποθήκευση αλλαγών
      </button>
    </div>
  );
}

function PlanLimit({ label, testid, value, onChange }: { label: string; testid: string; value: number | null; onChange: (v: number | null) => void }) {
  const unlimited = value === null;
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          disabled={unlimited}
          value={unlimited ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? 0 : parseInt(e.target.value, 10))}
          className="h-9 w-24 rounded-lg border bg-background px-2 text-sm disabled:opacity-50"
          data-testid={`${testid}-value`}
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={unlimited} onChange={(e) => onChange(e.target.checked ? null : 0)} className="size-4" data-testid={`${testid}-unlimited`} />
          Απεριόριστα
        </label>
      </div>
    </div>
  );
}
