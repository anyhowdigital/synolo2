"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { logProjectExpense, type ActionResult } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ProjectExpenseForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(logProjectExpense, null);
  if (state && !state.ok) toast.error(state.error);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={formAction} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-6">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-1 md:col-span-2">
        <Label htmlFor="edesc">Περιγραφή</Label>
        <Input id="edesc" name="description" placeholder="π.χ. Μετακίνηση Θεσσαλονίκη" required data-testid="expense-desc-input" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="eamt">Ποσό (€)</Label>
        <Input type="number" id="eamt" name="amount" step="0.01" min="0.01" required data-testid="expense-amount-input" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="emk">Markup %</Label>
        <Input type="number" id="emk" name="markupPercent" step="0.5" min="0" defaultValue="0" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="eon">Ημ/νία</Label>
        <Input type="date" id="eon" name="incurredOn" defaultValue={today} required />
      </div>
      <div className="flex items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch name="billable" defaultChecked />
          Χρεώσιμο
        </label>
        <Button type="submit" disabled={pending} data-testid="add-expense-btn">Προσθήκη</Button>
      </div>
    </form>
  );
}
