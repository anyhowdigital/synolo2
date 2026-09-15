"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setOrgPlanAction, setOrgFrozenAction } from "@/app/actions/admin";
import { AdminOrgOverrides } from "./admin-org-overrides";

const PLAN_OPTIONS = [
  { id: "trial", label: "Δοκιμαστική" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

export function AdminOrgRow({
  orgId,
  name,
  afm,
  plan,
  status,
  overridesJson,
}: {
  orgId: string;
  name: string;
  afm: string;
  plan: string;
  planLabel: string;
  status: string;
  overridesJson: string;
}) {
  const [pending, start] = useTransition();
  const [p, setP] = useState(plan);
  const [open, setOpen] = useState(false);
  const frozen = status === "frozen";
  const hasOverrides = !!overridesJson && overridesJson !== "{}";

  let initial: Record<string, unknown> = {};
  try {
    initial = overridesJson ? JSON.parse(overridesJson) : {};
  } catch {
    initial = {};
  }

  const changePlan = (next: string) => start(async () => { setP(next); await setOrgPlanAction(orgId, next); });
  const toggleFreeze = () => start(async () => { await setOrgFrozenAction(orgId, !frozen); });

  return (
    <>
      <tr className="border-t" data-testid={`admin-org-${orgId}`}>
        <td className="p-3 font-medium">{name}</td>
        <td className="p-3 tabular-nums text-muted-foreground">{afm || "—"}</td>
        <td className="p-3">
          <select value={p} onChange={(e) => changePlan(e.target.value)} disabled={pending} className="h-9 rounded-lg border bg-background px-2 text-sm" data-testid={`admin-plan-${orgId}`}>
            {PLAN_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </td>
        <td className="p-3">
          <span className={frozen ? "text-red-600" : "text-emerald-600"} data-testid={`admin-status-${orgId}`}>{frozen ? "Παγωμένος" : "Ενεργός"}</span>
        </td>
        <td className="p-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Link href={`/admin/orgs/${orgId}`} className="h-8 rounded-lg border px-3 text-sm leading-8" data-testid={`admin-detail-${orgId}`}>Λεπτομέρειες</Link>
            <button onClick={() => setOpen((v) => !v)} className="h-8 rounded-lg border px-3 text-sm" data-testid={`admin-overrides-toggle-${orgId}`}>
              Δυνατότητες{hasOverrides ? " ●" : ""}
            </button>
            <button onClick={toggleFreeze} disabled={pending} className="h-8 rounded-lg border px-3 text-sm" data-testid={`admin-freeze-${orgId}`}>
              {frozen ? "Ενεργοποίηση" : "Πάγωμα"}
            </button>
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-t bg-muted/10">
          <td colSpan={5} className="p-3">
            <AdminOrgOverrides orgId={orgId} initial={initial} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
