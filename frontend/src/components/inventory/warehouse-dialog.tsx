"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWarehouseAction, saveWarehouseAction } from "@/app/actions/inventory";
import type { ActionResult } from "@/app/actions/customers";
import type { Warehouse } from "@/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function WarehouseDialog({ warehouse, trigger }: { warehouse?: Warehouse; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await saveWarehouseAction(prev, fd);
    if (res.ok) {
      toast.success(warehouse ? "Η αποθήκη ενημερώθηκε." : "Η αποθήκη δημιουργήθηκε.");
      setOpen(false);
    }
    return res;
  }, null);
  const [isDefault, setIsDefault] = useState(warehouse?.isDefault ?? false);
  const [active, setActive] = useState(warehouse?.active ?? true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ??
          (warehouse ? (
            <Button variant="ghost" size="icon-sm" aria-label="Επεξεργασία αποθήκης">
              <Pencil />
            </Button>
          ) : (
            <Button variant="outline">
              <Plus data-icon="inline-start" /> Νέα αποθήκη
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{warehouse ? "Επεξεργασία αποθήκης" : "Νέα αποθήκη"}</DialogTitle>
          <DialogDescription>Αποθηκευτικός χώρος (κατάστημα, κεντρική, υποκατάστημα). Το απόθεμα παρακολουθείται ανά αποθήκη.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {warehouse ? <input type="hidden" name="id" value={warehouse.id} /> : null}
          <input type="hidden" name="isDefault" value={isDefault ? "on" : "off"} />
          <input type="hidden" name="active" value={active ? "on" : "off"} />
          <div className="grid gap-2">
            <Label htmlFor="wh-name">Όνομα *</Label>
            <Input id="wh-name" name="name" defaultValue={warehouse?.name ?? ""} required autoFocus placeholder="π.χ. Κατάστημα Σύνταγμα" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="wh-code">Κωδικός</Label>
              <Input id="wh-code" name="code" defaultValue={warehouse?.code ?? ""} maxLength={16} className="font-mono uppercase" placeholder="MAIN" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wh-address">Διεύθυνση</Label>
              <Input id="wh-address" name="address" defaultValue={warehouse?.address ?? ""} maxLength={200} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>
              Προεπιλεγμένη αποθήκη
              <span className="block text-xs text-muted-foreground">Χρησιμοποιείται για πωλήσεις/αγορές όταν δεν επιλέγεται άλλη.</span>
            </span>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} disabled={warehouse?.isDefault} />
          </label>
          {warehouse && !warehouse.isDefault ? (
            <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>Ενεργή</span>
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

export function DeleteWarehouseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      disabled={pending}
      aria-label="Διαγραφή αποθήκης"
      onClick={() =>
        start(async () => {
          const res = await deleteWarehouseAction(id);
          if (res.ok) toast.success("Η αποθήκη διαγράφηκε.");
          else toast.error(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
