"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomer } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteCustomerButton({ id, disabled }: { id: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive" disabled={disabled} title={disabled ? "Ο πελάτης έχει παραστατικά" : undefined}>
          <Trash2 data-icon="inline-start" /> Διαγραφή πελάτη
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Διαγραφή πελάτη;</DialogTitle>
          <DialogDescription>Η ενέργεια δεν αναιρείται. Θα διαγραφεί και το ιστορικό επικοινωνίας.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Άκυρο
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteCustomer(id);
                if (res && !res.ok) toast.error(res.error);
              })
            }
          >
            Διαγραφή
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
