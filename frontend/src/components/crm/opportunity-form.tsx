"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveOpportunity, deleteOpportunity, type ActionResult } from "@/app/actions/crm";
import { OPP_STAGES } from "@/lib/crm/stages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Opportunity } from "@/db/schema";

export function OpportunityForm({ opportunity, customers }: { opportunity?: Opportunity; customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(saveOpportunity, null);
  useEffect(() => {
    if (!state) return;
    if (!state.ok) toast.error(state.error);
    else if (state.id) {
      toast.success("Η ευκαιρία αποθηκεύτηκε.");
      router.push("/crm");
    }
  }, [state, router]);
  return (
    <form action={formAction} className="grid max-w-3xl gap-6 rounded-xl border bg-card p-6">
      {opportunity ? <input type="hidden" name="id" value={opportunity.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="title">Τίτλος ευκαιρίας *</Label>
          <Input id="title" name="title" required defaultValue={opportunity?.title ?? ""} placeholder="π.χ. Website redesign για ΠΛΑΤΕΙΑ Α.Ε." data-testid="opp-title-input" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="customerId">Πελάτης</Label>
          <Select name="customerId" defaultValue={opportunity?.customerId ?? "none"}>
            <SelectTrigger data-testid="opp-customer-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— κανένας —</SelectItem>
              {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="stage">Στάδιο</Label>
          <Select name="stage" defaultValue={opportunity?.stage ?? "lead"}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPP_STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="amount">Αξία (€)</Label>
          <Input type="number" step="0.01" min="0" id="amount" name="amount" defaultValue={opportunity?.amount ?? 0} data-testid="opp-amount-input" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="probability">Πιθανότητα %</Label>
          <Input type="number" min="0" max="100" id="probability" name="probability" defaultValue={opportunity?.probability ?? 20} />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="expectedCloseDate">Προβλεπόμενο κλείσιμο</Label>
          <Input type="date" id="expectedCloseDate" name="expectedCloseDate" defaultValue={opportunity?.expectedCloseDate ?? ""} />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="description">Σημειώσεις</Label>
          <Textarea id="description" name="description" defaultValue={opportunity?.description ?? ""} rows={3} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t pt-4">
        {opportunity ? (
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              if (!confirm("Διαγραφή ευκαιρίας;")) return;
              const res = await deleteOpportunity(opportunity.id);
              if (!res.ok) toast.error(res.error);
              else router.push("/crm");
            }}
          >
            Διαγραφή
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Άκυρο</Button>
          <Button type="submit" disabled={pending} data-testid="opp-submit-btn">Αποθήκευση</Button>
        </div>
      </div>
    </form>
  );
}
