"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveProject, deleteProject, type ActionResult } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Project } from "@/db/schema";

export function ProjectForm({ project, customers }: { project?: Project; customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(saveProject, null);
  if (state && !state.ok) toast.error(state.error);

  return (
    <form action={formAction} className="grid max-w-3xl gap-6 rounded-xl border bg-card p-6">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="name">Όνομα έργου *</Label>
          <Input id="name" name="name" defaultValue={project?.name ?? ""} required data-testid="project-name-input" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="code">Κωδικός</Label>
          <Input id="code" name="code" defaultValue={project?.code ?? ""} placeholder="π.χ. PRJ-001" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="customerId">Πελάτης</Label>
          <Select name="customerId" defaultValue={project?.customerId ?? "none"}>
            <SelectTrigger data-testid="project-customer-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— χωρίς πελάτη —</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="description">Περιγραφή</Label>
          <Textarea id="description" name="description" defaultValue={project?.description ?? ""} rows={3} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">Κατάσταση</Label>
          <Select name="status" defaultValue={project?.status ?? "active"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ενεργό</SelectItem>
              <SelectItem value="on_hold">Σε αναμονή</SelectItem>
              <SelectItem value="completed">Ολοκληρωμένο</SelectItem>
              <SelectItem value="archived">Αρχείο</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="hourlyRate">Ωριαία τιμή (€)</Label>
          <Input type="number" step="0.01" min="0" id="hourlyRate" name="hourlyRate" defaultValue={project?.hourlyRate ?? 0} data-testid="project-rate-input" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="budgetHours">Προϋπολογισμός ωρών</Label>
          <Input type="number" step="0.5" min="0" id="budgetHours" name="budgetHours" defaultValue={project?.budgetHours ?? ""} placeholder="π.χ. 100" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="budgetAmount">Προϋπολογισμός (€)</Label>
          <Input type="number" step="0.01" min="0" id="budgetAmount" name="budgetAmount" defaultValue={project?.budgetAmount ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="startsOn">Έναρξη</Label>
          <Input type="date" id="startsOn" name="startsOn" defaultValue={project?.startsOn ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsOn">Λήξη</Label>
          <Input type="date" id="endsOn" name="endsOn" defaultValue={project?.endsOn ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="color">Χρώμα</Label>
          <Input type="color" id="color" name="color" defaultValue={project?.color ?? "#2563eb"} className="h-10 p-1" />
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Switch id="billable" name="billable" defaultChecked={project?.billable ?? true} />
          <Label htmlFor="billable">Χρεώσιμο έργο (οι ώρες προτείνονται προς τιμολόγηση)</Label>
        </div>
      </div>
      <div className="flex items-center justify-between border-t pt-4">
        {project ? (
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              if (!confirm("Διαγραφή έργου; Οι ώρες και τα έξοδα θα διαγραφούν.")) return;
              const res = await deleteProject(project.id);
              if (res && !res.ok) toast.error(res.error);
            }}
          >
            Διαγραφή
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Άκυρο</Button>
          <Button type="submit" disabled={pending} data-testid="project-submit-btn">Αποθήκευση</Button>
        </div>
      </div>
    </form>
  );
}
