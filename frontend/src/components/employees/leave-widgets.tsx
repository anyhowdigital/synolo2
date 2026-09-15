"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideLeaveAction, submitErganiAction } from "@/app/actions/payroll";
import { staffLeaveRequestAction } from "@/app/actions/staff";

export function LeaveDecisionButtons({ orgId, id }: { orgId: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (d: "approved" | "rejected") =>
    start(async () => {
      const res = await decideLeaveAction(orgId, id, d);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${d === "approved" ? "Η άδεια εγκρίθηκε." : "Η άδεια απορρίφθηκε."} ${res.ergani}`.trim());
      router.refresh();
    });
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" disabled={pending} onClick={() => act("approved")} data-testid={`leave-approve-${id}`}>
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Έγκριση
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("rejected")} data-testid={`leave-reject-${id}`}>
        <X /> Απόρριψη
      </Button>
    </span>
  );
}

export function LeaveSubmitButton({ orgId, id, month }: { orgId: string; id: string; month: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button size="sm" variant="outline" disabled={pending} data-testid={`leave-submit-ergani-${id}`} onClick={() => {
    if (!confirm("Θα διαβιβαστεί η εγκεκριμένη άδεια στο ρυθμισμένο περιβάλλον ΕΡΓΑΝΗ. Η έγκριση από μόνη της δεν αποτελεί υποβολή. Συνέχεια;")) return;
    start(async () => {
      const result = await submitErganiAction(orgId, "LEAVE", month, id);
      if (!result.ok) toast.error(result.error);
      else { toast.success(`Η άδεια διαβιβάστηκε. Πρωτόκολλο: ${result.protocol}`); router.refresh(); }
    });
  }}>{pending ? <Loader2 className="animate-spin" /> : null} Υποβολή ΕΡΓΑΝΗ</Button>;
}


export function StaffLeaveForm({ token, types }: { token: string; types: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ leaveType: "ΑΔΚΑΝ", fromDate: today, toDate: today, reason: "" });
  return (
    <Card data-testid="staff-leave-card">
      <CardHeader>
        <CardTitle className="text-base">Αίτημα άδειας</CardTitle>
        <CardDescription>Ο εργοδότης ή ο λογιστής θα εγκρίνει το αίτημα· θα το δείτε εδώ.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label className="text-xs">Τύπος</Label>
          <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="staff-leave-type">
            {Object.entries(types).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Από</Label>
          <Input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} data-testid="staff-leave-from" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Έως</Label>
          <Input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} data-testid="staff-leave-to" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Αιτιολογία</Label>
          <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="staff-leave-reason" />
        </div>
        <Button
          className="sm:col-span-4 sm:w-fit"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await staffLeaveRequestAction(token, form);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(`Το αίτημα υποβλήθηκε (${res.days} εργάσιμες ημέρες).`);
              router.refresh();
            })
          }
          data-testid="staff-leave-submit"
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Υποβολή αιτήματος
        </Button>
      </CardContent>
    </Card>
  );
}
