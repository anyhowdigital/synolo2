"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { logTimeEntry, type ActionResult } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function ManualTimeForm({ projectId, tasks, defaultRate }: { projectId: string; tasks: { id: string; name: string }[]; defaultRate: number }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(logTimeEntry, null);
  const today = new Date().toISOString().slice(0, 16);
  const [minutes, setMinutes] = useState("60");
  if (state && !state.ok) toast.error(state.error);
  if (state && state.ok) {
    // Server action revalidates; no reset needed since form is uncontrolled
  }
  return (
    <form
      action={(fd) => {
        formAction(fd);
      }}
      className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-6"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-1 md:col-span-2">
        <Label htmlFor="tstart">Έναρξη</Label>
        <Input type="datetime-local" id="tstart" name="startedAt" defaultValue={today} required />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="tmin">Λεπτά</Label>
        <Input type="number" id="tmin" name="minutes" min="1" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} required data-testid="manual-minutes-input" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="trate">€/ώρα</Label>
        <Input type="number" id="trate" name="hourlyRate" step="0.01" min="0" defaultValue={defaultRate} required />
      </div>
      <div className="grid gap-1">
        <Label>Εργασία</Label>
        <Select name="taskId" defaultValue="none">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1 md:col-span-5">
        <Label htmlFor="tdesc">Περιγραφή</Label>
        <Input id="tdesc" name="description" placeholder="π.χ. Meeting με πελάτη" />
      </div>
      <div className="flex items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch name="billable" defaultChecked />
          Χρεώσιμο
        </label>
        <Button type="submit" disabled={pending} data-testid="log-time-btn">Καταχώρηση</Button>
      </div>
    </form>
  );
}
