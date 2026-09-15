"use client";

import { useState, useTransition } from "react";
import { ALL_CAPABILITIES, CAPABILITY_LABELS, type Capability } from "@/lib/billing/plans";
import { setOrgOverridesAction } from "@/app/actions/admin";

type LimitMode = "default" | "unlimited" | "custom";
type OrgOverride = { capabilities?: Partial<Record<Capability, boolean>>; invoiceLimit?: number | null; userLimit?: number | null };

function limitState(v: number | null | undefined): { mode: LimitMode; value: string } {
  if (v === undefined) return { mode: "default", value: "" };
  if (v === null) return { mode: "unlimited", value: "" };
  return { mode: "custom", value: String(v) };
}

function buildLimit(s: { mode: LimitMode; value: string }): number | null | undefined {
  if (s.mode === "default") return undefined;
  if (s.mode === "unlimited") return null;
  const n = parseInt(s.value, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function AdminOrgOverrides({ orgId, initial }: { orgId: string; initial: OrgOverride }) {
  const [caps, setCaps] = useState<Partial<Record<Capability, boolean>>>(initial.capabilities ?? {});
  const [inv, setInv] = useState(limitState(initial.invoiceLimit));
  const [usr, setUsr] = useState(limitState(initial.userLimit));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const capValue = (c: Capability): "plan" | "on" | "off" => (c in caps ? (caps[c] ? "on" : "off") : "plan");
  const setCap = (c: Capability, v: "plan" | "on" | "off") =>
    setCaps((prev) => {
      const next = { ...prev };
      if (v === "plan") delete next[c];
      else next[c] = v === "on";
      return next;
    });

  const save = () =>
    start(async () => {
      const payload: OrgOverride = {};
      if (Object.keys(caps).length) payload.capabilities = caps;
      const il = buildLimit(inv);
      if (il !== undefined) payload.invoiceLimit = il;
      const ul = buildLimit(usr);
      if (ul !== undefined) payload.userLimit = ul;
      const res = await setOrgOverridesAction(orgId, payload);
      setMsg(res.ok ? "Αποθηκεύτηκε." : res.error ?? "Σφάλμα.");
    });

  const reset = () =>
    start(async () => {
      setCaps({});
      setInv({ mode: "default", value: "" });
      setUsr({ mode: "default", value: "" });
      const res = await setOrgOverridesAction(orgId, {});
      setMsg(res.ok ? "Καθαρίστηκαν." : res.error ?? "Σφάλμα.");
    });

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4" data-testid={`admin-overrides-${orgId}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        {ALL_CAPABILITIES.map((c) => (
          <label key={c} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{CAPABILITY_LABELS[c]}</span>
            <select
              value={capValue(c)}
              onChange={(e) => setCap(c, e.target.value as "plan" | "on" | "off")}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              data-testid={`admin-cap-${orgId}-${c}`}
            >
              <option value="plan">Από πλάνο</option>
              <option value="on">Ενεργό</option>
              <option value="off">Ανενεργό</option>
            </select>
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LimitField label="Όριο παραστατικών/μήνα" testid={`admin-invlimit-${orgId}`} state={inv} setState={setInv} />
        <LimitField label="Όριο χρηστών" testid={`admin-userlimit-${orgId}`} state={usr} setState={setUsr} />
      </div>
      {msg ? <p className="text-xs text-emerald-600" data-testid={`admin-overrides-msg-${orgId}`}>{msg}</p> : null}
      <div className="flex gap-2">
        <button onClick={save} disabled={pending} className="h-8 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground" data-testid={`admin-overrides-save-${orgId}`}>
          Αποθήκευση
        </button>
        <button onClick={reset} disabled={pending} className="h-8 rounded-lg border px-4 text-xs" data-testid={`admin-overrides-reset-${orgId}`}>
          Καθαρισμός
        </button>
      </div>
    </div>
  );
}

function LimitField({
  label,
  testid,
  state,
  setState,
}: {
  label: string;
  testid: string;
  state: { mode: LimitMode; value: string };
  setState: (s: { mode: LimitMode; value: string }) => void;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <select
          value={state.mode}
          onChange={(e) => setState({ ...state, mode: e.target.value as LimitMode })}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          data-testid={`${testid}-mode`}
        >
          <option value="default">Από πλάνο</option>
          <option value="unlimited">Απεριόριστα</option>
          <option value="custom">Συγκεκριμένο</option>
        </select>
        {state.mode === "custom" ? (
          <input
            type="number"
            min={0}
            value={state.value}
            onChange={(e) => setState({ ...state, value: e.target.value })}
            className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
            data-testid={`${testid}-value`}
          />
        ) : null}
      </div>
    </div>
  );
}
