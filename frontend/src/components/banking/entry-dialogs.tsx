"use client";

import { useState, useTransition, type ReactNode } from "react";
import { format } from "date-fns";
import { ArrowRightLeft, Loader2, PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addEntryAction, deleteEntryAction, transferAction } from "@/app/actions/banking";
import { ENTRY_KIND_LABELS, type EntryKind } from "@/lib/services/banking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface AccountOption {
  id: string;
  name: string;
  kind: string;
}

const MANUAL_KINDS: EntryKind[] = ["other_in", "owner_in", "interest", "other_out", "owner_out", "fee", "tax"];
const INFLOW_KINDS: EntryKind[] = ["other_in", "owner_in", "interest", "transfer"];

/** Λοιπή κίνηση λογαριασμού (προμήθεια, τόκοι, κατάθεση/ανάληψη επιχειρηματία κ.λπ.). */
export function EntryDialog({ accounts, defaultAccountId, trigger }: { accounts: AccountOption[]; defaultAccountId?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [kind, setKind] = useState<EntryKind>("other_out");
  const [amount, setAmount] = useState("");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await addEntryAction({ accountId, kind, amount: Number(amount), movedAt, note });
      if (res.ok) {
        toast.success("Η κίνηση καταχωρήθηκε.");
        setOpen(false);
        setAmount("");
        setNote("");
      } else toast.error(res.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <PlusCircle data-icon="inline-start" /> Λοιπή κίνηση
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Λοιπή κίνηση λογαριασμού</DialogTitle>
          <DialogDescription>Κινήσεις που δεν αφορούν παραστατικά: προμήθειες τράπεζας, τόκοι, καταθέσεις/αναλήψεις επιχειρηματία, φόροι.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label>Λογαριασμός</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger aria-label="Λογαριασμός">
                <SelectValue placeholder="Επιλέξτε λογαριασμό" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Τύπος κίνησης</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as EntryKind)}>
              <SelectTrigger aria-label="Τύπος κίνησης">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {INFLOW_KINDS.includes(k) ? "+ " : "− "}
                    {ENTRY_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="entry-amount">Ποσό *</Label>
              <Input id="entry-amount" type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="entry-date">Ημερομηνία *</Label>
              <Input id="entry-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="entry-note">Σημείωση</Label>
            <Input id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="π.χ. Προμήθεια εμβάσματος" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !accountId || !(Number(amount) > 0)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Καταχώρηση
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Μεταφορά ποσού μεταξύ δύο λογαριασμών (π.χ. κατάθεση μετρητών ταμείου στην τράπεζα). */
export function TransferDialog({ accounts, defaultFromId, trigger }: { accounts: AccountOption[]; defaultFromId?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [fromAccountId, setFrom] = useState(defaultFromId ?? accounts[0]?.id ?? "");
  const [toAccountId, setTo] = useState(accounts.find((a) => a.id !== (defaultFromId ?? accounts[0]?.id))?.id ?? "");
  const [amount, setAmount] = useState("");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await transferAction({ fromAccountId, toAccountId, amount: Number(amount), movedAt, note });
      if (res.ok) {
        toast.success("Η μεταφορά καταχωρήθηκε.");
        setOpen(false);
        setAmount("");
        setNote("");
      } else toast.error(res.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={accounts.length < 2}>
            <ArrowRightLeft data-icon="inline-start" /> Μεταφορά
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Μεταφορά μεταξύ λογαριασμών</DialogTitle>
          <DialogDescription>Δημιουργεί εκροή στον λογαριασμό προέλευσης και ισόποση εισροή στον λογαριασμό προορισμού.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Από</Label>
              <Select value={fromAccountId} onValueChange={setFrom}>
                <SelectTrigger aria-label="Από λογαριασμό">
                  <SelectValue placeholder="Λογαριασμός" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Προς</Label>
              <Select value={toAccountId} onValueChange={setTo}>
                <SelectTrigger aria-label="Προς λογαριασμό">
                  <SelectValue placeholder="Λογαριασμός" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== fromAccountId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-amount">Ποσό *</Label>
              <Input id="tr-amount" type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-date">Ημερομηνία *</Label>
              <Input id="tr-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tr-note">Σημείωση</Label>
            <Input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="π.χ. Κατάθεση εισπράξεων ημέρας" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !fromAccountId || !toAccountId || fromAccountId === toAccountId || !(Number(amount) > 0)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ArrowRightLeft data-icon="inline-start" />}
              Μεταφορά
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteEntryButton({ id, isTransfer }: { id: string; isTransfer?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      disabled={pending}
      aria-label="Διαγραφή κίνησης"
      title={isTransfer ? "Διαγράφει και τα δύο σκέλη της μεταφοράς" : "Διαγραφή κίνησης"}
      onClick={() =>
        start(async () => {
          const res = await deleteEntryAction(id);
          if (res.ok) toast.success("Η κίνηση διαγράφηκε.");
          else toast.error(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
