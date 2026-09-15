"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { saveB2GInvoiceRefsAction } from "@/app/actions/b2g";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface B2GRefsValues {
  b2gBuyerReference: string;
  b2gContractAdam: string;
  b2gProjectReference: string;
  b2gOrderReference: string;
  b2gCpv: string;
  b2gSoftReject: boolean;
}

/** Στοιχεία σύμβασης ανά παραστατικό (Greek CIUS BT-10/11/12/13/158 + soft reject). */
export function B2GRefsForm({ invoiceId, values, locked }: { invoiceId: string; values: B2GRefsValues; locked: boolean }) {
  const [state, action, pending] = useActionState(async (prev: { ok: boolean; error?: string } | null, fd: FormData) => {
    const res = await saveB2GInvoiceRefsAction(prev, fd);
    if (res.ok) toast.success("Τα στοιχεία σύμβασης αποθηκεύτηκαν.");
    else toast.error(res.error ?? "Αποτυχία.");
    return res;
  }, null);
  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-muted/30 p-3" data-testid="b2g-refs-form">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="text-xs font-medium text-muted-foreground">Στοιχεία σύμβασης για αυτό το παραστατικό (κενό = από την καρτέλα του φορέα)</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="ref-bt11" className="text-xs">Προϋπολογισμός/έργο (BT-11) *</Label>
          <Input id="ref-bt11" name="b2gProjectReference" defaultValue={values.b2gProjectReference} placeholder="1|ΑΔΑ ανάληψης · 2|ενάριθμος · 3|ΑΔΑ" disabled={locked} className="h-8" data-testid="b2g-ref-project" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ref-bt12" className="text-xs">ΑΔΑΜ σύμβασης (BT-12) *</Label>
          <Input id="ref-bt12" name="b2gContractAdam" defaultValue={values.b2gContractAdam} placeholder="24SYMV001234567 ή 0" disabled={locked} className="h-8" data-testid="b2g-ref-adam" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ref-bt10" className="text-xs">Buyer reference (BT-10)</Label>
          <Input id="ref-bt10" name="b2gBuyerReference" defaultValue={values.b2gBuyerReference} placeholder="Μονάδα/τμήμα λήπτη" disabled={locked} className="h-8" data-testid="b2g-ref-buyer" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ref-bt13" className="text-xs">Αρ. παραγγελίας (BT-13)</Label>
          <Input id="ref-bt13" name="b2gOrderReference" defaultValue={values.b2gOrderReference} disabled={locked} className="h-8" data-testid="b2g-ref-order" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ref-cpv" className="text-xs">CPV (BT-158)</Label>
          <Input id="ref-cpv" name="b2gCpv" defaultValue={values.b2gCpv} placeholder="72000000-5" pattern="\d{8}(-\d)?" disabled={locked} className="h-8" data-testid="b2g-ref-cpv" />
        </div>
        <label className="flex items-center gap-2 self-end text-xs">
          <input type="checkbox" name="b2gSoftReject" defaultChecked={values.b2gSoftReject} disabled={locked} data-testid="b2g-ref-softreject" />
          Επανυποβολή μετά από Soft Reject του φορέα
        </label>
      </div>
      {!locked ? (
        <div className="flex items-center justify-between gap-2">
          {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : <span />}
          <Button type="submit" size="sm" variant="outline" disabled={pending} data-testid="b2g-refs-save">Αποθήκευση στοιχείων</Button>
        </div>
      ) : null}
    </form>
  );
}
