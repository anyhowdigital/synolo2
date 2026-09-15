"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAccountAction, saveAccountAction } from "@/app/actions/banking";
import type { ActionResult } from "@/app/actions/customers";
import type { CashAccount } from "@/db/schema";
import { ACCOUNT_KIND_LABELS, type AccountKind } from "@/lib/services/banking";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AccountDialog({ account, trigger }: { account?: CashAccount; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await saveAccountAction(prev, fd);
    if (res.ok) {
      toast.success(account ? "Ο λογαριασμός ενημερώθηκε." : "Ο λογαριασμός δημιουργήθηκε.");
      setOpen(false);
    }
    return res;
  }, null);
  const [kind, setKind] = useState<AccountKind>((account?.kind as AccountKind) ?? "bank");
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);
  const [active, setActive] = useState(account?.active ?? true);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setKind((account?.kind as AccountKind) ?? "bank");
          setIsDefault(account?.isDefault ?? false);
          setActive(account?.active ?? true);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ??
          (account ? (
            <Button variant="ghost" size="icon-sm" aria-label="Επεξεργασία λογαριασμού">
              <Pencil />
            </Button>
          ) : (
            <Button>
              <Plus data-icon="inline-start" /> Νέος λογαριασμός
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Επεξεργασία λογαριασμού" : "Νέος λογαριασμός"}</DialogTitle>
          <DialogDescription>Τραπεζικός λογαριασμός, ταμείο μετρητών ή λογαριασμός καρτών/POS. Οι εισπράξεις και πληρωμές καταχωρούνται ανά λογαριασμό.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {account ? <input type="hidden" name="id" value={account.id} /> : null}
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="isDefault" value={isDefault ? "on" : "off"} />
          <input type="hidden" name="active" value={active ? "on" : "off"} />
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="grid gap-2">
              <Label htmlFor="acc-name">Όνομα *</Label>
              <Input id="acc-name" name="name" defaultValue={account?.name ?? ""} required autoFocus placeholder="π.χ. Eurobank όψεως" />
            </div>
            <div className="grid gap-2">
              <Label>Τύπος</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
                <SelectTrigger aria-label="Τύπος λογαριασμού">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ACCOUNT_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {kind === "bank" || kind === "card" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="acc-bank">Τράπεζα</Label>
                <Input id="acc-bank" name="bankName" defaultValue={account?.bankName ?? ""} placeholder="π.χ. Eurobank" maxLength={120} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acc-iban">IBAN</Label>
                <Input id="acc-iban" name="iban" defaultValue={account?.iban ?? ""} placeholder="GR16 0110 1250 0000 0001 2300 695" className="font-mono" maxLength={40} />
              </div>
            </div>
          ) : (
            <>
              <input type="hidden" name="bankName" value={account?.bankName ?? ""} />
              <input type="hidden" name="iban" value="" />
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="acc-opening">Υπόλοιπο έναρξης</Label>
              <Input id="acc-opening" name="openingBalance" type="number" step="0.01" defaultValue={account?.openingBalance ?? 0} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-opening-date">Ημ/νία έναρξης</Label>
              <Input id="acc-opening-date" name="openingDate" type="date" defaultValue={account?.openingDate ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-currency">Νόμισμα</Label>
              <Input id="acc-currency" name="currency" defaultValue={account?.currency ?? "EUR"} maxLength={3} className="uppercase" />
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>
              Προεπιλεγμένος λογαριασμός
              <span className="block text-xs text-muted-foreground">Χρησιμοποιείται για εισπράξεις/πληρωμές όταν δεν επιλέγεται άλλος (τα μετρητά πάνε στο ταμείο).</span>
            </span>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} disabled={account?.isDefault} />
          </label>
          {account && !account.isDefault ? (
            <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>Ενεργός</span>
              <Switch checked={active} onCheckedChange={setActive} />
            </label>
          ) : null}
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAccountButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      disabled={pending}
      aria-label="Διαγραφή λογαριασμού"
      onClick={() => {
        if (!confirm("Διαγραφή λογαριασμού; Επιτρέπεται μόνο αν δεν έχει κινήσεις.")) return;
        start(async () => {
          const res = await deleteAccountAction(id);
          if (res.ok) toast.success("Ο λογαριασμός διαγράφηκε.");
          else toast.error(res.error);
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
