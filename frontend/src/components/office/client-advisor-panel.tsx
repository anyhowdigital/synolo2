"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { assignOpportunityAction, emailTaxPlanAction } from "@/app/actions/office-advisor";
import type { FirmTeamMember } from "@/lib/services/firm";

export function TaxPlanEmailButton({ orgId, defaultEmail }: { orgId: string; defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const send = () =>
    start(async () => {
      const res = await emailTaxPlanAction({ orgId, to: email, message });
      if (res.ok) {
        toast.success(res.delivered ? "Το πλάνο στάλθηκε στον πελάτη." : "Το πλάνο καταχωρήθηκε στο Outbox (χωρίς SMTP).");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Σφάλμα αποστολής.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="tax-plan-email-open">
          Αποστολή με email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Αποστολή φορολογικού πλάνου</DialogTitle>
          <DialogDescription>Το PDF θα σταλεί ως συνημμένο στον πελάτη και θα καταχωρηθεί στο μητρώο εγγράφων.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tax-plan-email">Email παραλήπτη</Label>
            <Input id="tax-plan-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pelatis@example.gr" data-testid="tax-plan-email-input" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax-plan-msg">Σημείωμα (προαιρετικό)</Label>
            <Textarea id="tax-plan-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Σύντομο συνοδευτικό μήνυμα…" data-testid="tax-plan-email-message" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Άκυρο
          </Button>
          <Button size="sm" onClick={send} disabled={pending} data-testid="tax-plan-email-send">
            {pending ? "Αποστολή…" : "Αποστολή"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssignOpportunityButton({
  orgId,
  ruleCode,
  title,
  severity,
  team,
}: {
  orgId: string;
  ruleCode: string;
  title: string;
  severity: string;
  team: FirmTeamMember[];
}) {
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState(team[0]?.userId ?? "");
  const [dueDate, setDueDate] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const assign = () =>
    start(async () => {
      const res = await assignOpportunityAction({ orgId, ruleCode, title, severity, assigneeUserId: assignee, dueDate: dueDate || null });
      if (res.ok) {
        toast.success("Η ευκαιρία ανατέθηκε ως εκκρεμότητα γραφείου.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Σφάλμα ανάθεσης.");
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="mt-3" size="sm" variant="outline" data-testid={`assign-open-${ruleCode}`}>
          Ανάθεση σε συνεργάτη
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ανάθεση ευκαιρίας</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`assignee-${ruleCode}`}>Συνεργάτης</Label>
            <select
              id={`assignee-${ruleCode}`}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              data-testid={`assign-member-${ruleCode}`}
            >
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} · {m.role === "owner" ? "Ιδιοκτήτης" : m.role === "partner" ? "Συνεργάτης" : "Υπάλληλος"}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`due-${ruleCode}`}>Προθεσμία (προαιρετικό)</Label>
            <Input id={`due-${ruleCode}`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid={`assign-due-${ruleCode}`} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Άκυρο
          </Button>
          <Button size="sm" onClick={assign} disabled={pending || !assignee} data-testid={`assign-submit-${ruleCode}`}>
            {pending ? "Ανάθεση…" : "Ανάθεση"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
