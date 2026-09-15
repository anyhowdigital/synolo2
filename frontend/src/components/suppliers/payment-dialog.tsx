"use client";

import { useState, useTransition, type ReactNode } from "react";
import { format } from "date-fns";
import { Banknote, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpensePaymentAction, recordExpensePaymentAction } from "@/app/actions/suppliers";
import type { Expense } from "@/db/schema";
import { PAYMENT_METHODS } from "@/lib/greek/document-types";
import { formatMoney, round2 } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface PaymentAccountOption {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
}

function suggestedAccount(accounts: PaymentAccountOption[], method: number) {
  if (accounts.length === 0) return "";
  if (method === 3) return accounts.find((a) => a.kind === "cash")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  if (method === 7) return accounts.find((a) => a.kind === "card")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  return accounts.find((a) => a.isDefault && a.kind !== "cash")?.id ?? accounts.find((a) => a.kind === "bank")?.id ?? accounts[0].id;
}

/** Καταχώρηση πληρωμής (μερικής ή ολικής) προς προμηθευτή για ένα τιμολόγιο αγοράς. */
export function ExpensePaymentDialog({
  expense,
  trigger,
  accounts = [],
}: {
  expense: Pick<Expense, "id" | "grossValue" | "paidAmount" | "status" | "supplierName" | "number" | "series">;
  trigger?: ReactNode;
  accounts?: PaymentAccountOption[];
}) {
  const remaining = Math.max(0, round2(expense.grossValue - expense.paidAmount));
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(remaining));
  const [paidAt, setPaidAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("1");
  const [accountId, setAccountId] = useState(suggestedAccount(accounts, 1));
  const [reference, setReference] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await recordExpensePaymentAction({ expenseId: expense.id, amount: Number(amount), paidAt, method: Number(method), reference, accountId: accountId || undefined });
      if (res.ok) {
        toast.success(res.warning ? `Η πληρωμή καταχωρήθηκε. ${res.warning}` : "Το τιμολόγιο εξοφλήθηκε.");
        setOpen(false);
      } else toast.error(res.error);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setAmount(String(remaining));
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" title="Πληρωμή προμηθευτή" disabled={remaining <= 0}>
            <Banknote />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Πληρωμή προμηθευτή</DialogTitle>
          <DialogDescription>
            {expense.supplierName}
            {expense.number ? ` · ${expense.series ? `${expense.series}-` : ""}${expense.number}` : ""} · Ανοιχτό υπόλοιπο {formatMoney(remaining)}
          </DialogDescription>
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
              <Label htmlFor="pay-amount">Ποσό *</Label>
              <Input id="pay-amount" type="number" step="0.01" min={0.01} max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-date">Ημερομηνία *</Label>
              <Input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Τρόπος πληρωμής</Label>
              <Select
                value={method}
                onValueChange={(v) => {
                  setMethod(v);
                  setAccountId(suggestedAccount(accounts, Number(v)));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.code} value={String(m.code)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-ref">Αναφορά</Label>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="π.χ. αρ. εντολής / επιταγής" maxLength={200} />
            </div>
            {accounts.length > 0 ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Λογαριασμός πληρωμής</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger aria-label="Λογαριασμός πληρωμής">
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
            ) : null}
          </div>
          {Number(amount) > 0 && Number(amount) < remaining - 0.005 ? (
            <p className="text-xs text-muted-foreground">Μερική πληρωμή – θα απομείνει υπόλοιπο {formatMoney(round2(remaining - Number(amount)))}.</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !(Number(amount) > 0)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Banknote data-icon="inline-start" />}
              Καταχώρηση πληρωμής
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePaymentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      title="Διαγραφή πληρωμής"
      onClick={() =>
        start(async () => {
          const res = await deleteExpensePaymentAction(id);
          if (res.ok) toast.success("Η πληρωμή διαγράφηκε.");
          else toast.error(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
