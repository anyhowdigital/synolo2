"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, Percent, RefreshCw, Trash2 } from "lucide-react";
import { changePlanAction, previewProrationAction, removeSavedCardAction, retryChargeAction, sendSaveCardLinkAction, unpaidSubscriptionInvoicesAction } from "@/app/actions/customer-subscriptions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SavedCardCell({ customerId, brand, last4, hasCard }: { customerId: string; brand: string; last4: string; hasCard: boolean }) {
  const [pending, start] = useTransition();
  const sendLink = () =>
    start(async () => {
      const res = await sendSaveCardLinkAction(customerId);
      if (!res.ok) { toast.error(res.error); return; }
      await navigator.clipboard.writeText(res.url).catch(() => undefined);
      toast.success("Ο σύνδεσμος αποθήκευσης κάρτας δημιουργήθηκε και αντιγράφηκε (στάλθηκε και email αν υπάρχει).");
    });
  const remove = () =>
    start(async () => {
      const res = await removeSavedCardAction(customerId);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Η κάρτα αφαιρέθηκε.");
    });

  if (hasCard) {
    return (
      <div className="flex items-center gap-1.5" data-testid={`saved-card-${customerId}`}>
        <Badge variant="outline" className="gap-1 border-emerald-600 text-emerald-700">
          <CreditCard className="size-3" /> {brand} •••• {last4}
        </Badge>
        <Button variant="ghost" size="sm" onClick={remove} disabled={pending} title="Αφαίρεση κάρτας" data-testid={`remove-card-${customerId}`}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={sendLink} disabled={pending} data-testid={`send-card-link-${customerId}`}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />} Σύνδεσμος κάρτας
    </Button>
  );
}

export function ChangePlanDialog({ templateId, templateName }: { templateId: string; templateName: string }) {
  const [open, setOpen] = useState(false);
  const [newNet, setNewNet] = useState("");
  const [preview, setPreview] = useState<{ remainingDays: number; totalDays: number; unusedCredit: number; newCharge: number; difference: number } | null>(null);
  const [pending, start] = useTransition();

  const doPreview = () =>
    start(async () => {
      const res = await previewProrationAction(templateId, Number(newNet));
      if (!res.ok) { toast.error(res.error); return; }
      setPreview(res.preview);
    });

  const apply = () =>
    start(async () => {
      const res = await changePlanAction(templateId, Number(newNet), templateName);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message ?? "Το πλάνο άλλαξε.");
      setOpen(false);
      setPreview(null);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Αλλαγή πλάνου με αναλογία" data-testid={`change-plan-${templateId}`}>
          <Percent />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Αλλαγή πλάνου — «{templateName}»</DialogTitle>
          <DialogDescription>
            Η αλλαγή ισχύει από σήμερα. Υπολογίζεται αναλογικά (proration) ο αχρησιμοποίητος χρόνος της τρέχουσας περιόδου και εκδίδεται παραστατικό διαφοράς ή πίστωσης.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="newNet">Νέα καθαρή αξία ανά περίοδο (€)</Label>
            <Input id="newNet" type="number" step="0.01" min="0" value={newNet} onChange={(e) => { setNewNet(e.target.value); setPreview(null); }} data-testid="new-plan-amount" />
          </div>
          {preview ? (
            <Alert data-testid="proration-preview">
              <AlertDescription className="text-sm">
                Απομένουν <strong>{preview.remainingDays}</strong> από {preview.totalDays} ημέρες. Πίστωση αχρησιμοποίητου {preview.unusedCredit.toFixed(2)}€ · νέα αναλογική χρέωση {preview.newCharge.toFixed(2)}€ ·{" "}
                <strong>{preview.difference >= 0 ? `χρέωση ${preview.difference.toFixed(2)}€` : `πίστωση ${Math.abs(preview.difference).toFixed(2)}€`}</strong>.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={doPreview} disabled={pending || !newNet} data-testid="preview-proration-btn">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Υπολογισμός
          </Button>
          <Button onClick={apply} disabled={pending || !newNet} data-testid="apply-plan-btn">
            Εφαρμογή αλλαγής
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RetryChargeButton({ templateId }: { templateId: string }) {
  const [pending, start] = useTransition();
  const retry = () =>
    start(async () => {
      const list = await unpaidSubscriptionInvoicesAction(templateId);
      if (!list.ok) { toast.error(list.error); return; }
      if (!list.rows.length) { toast.info("Δεν υπάρχουν ανεξόφλητα παραστατικά αυτής της συνδρομής."); return; }
      const res = await retryChargeAction(templateId, list.rows[0].id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message ?? "Η χρέωση ολοκληρώθηκε.");
    });
  return (
    <Button variant="ghost" size="sm" onClick={retry} disabled={pending} title="Επανάληψη χρέωσης κάρτας" data-testid={`retry-charge-${templateId}`}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw />}
    </Button>
  );
}
