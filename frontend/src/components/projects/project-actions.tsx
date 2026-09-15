"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteProjectExpense, deleteTimeEntry, invoiceUnbilled, saveTask, toggleTaskDone, type ActionResult } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney } from "@/lib/invoice/totals";

export function InvoiceUnbilledButton({ projectId, disabled, unbilledTotal }: { projectId: string; disabled?: boolean; unbilledTotal: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={disabled || pending}
      data-testid="invoice-unbilled-btn"
      onClick={() => {
        if (!confirm(`Δημιουργία τιμολογίου με σύνολο περίπου ${formatMoney(unbilledTotal)}·`)) return;
        startTransition(async () => {
          try {
            const res = await invoiceUnbilled(projectId);
            if (res && !res.ok) toast.error(res.error);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // NEXT_REDIRECT is thrown when server action redirects — do not treat as error
            if (!msg.includes("NEXT_REDIRECT")) toast.error(msg);
          }
        });
      }}
    >
      Τιμολόγηση μη χρεωμένων
    </Button>
  );
}

export function TaskAddForm({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3 md:flex-row">
      <Input placeholder="Νέα εργασία…" value={name} onChange={(e) => setName(e.target.value)} className="md:flex-1" data-testid="task-name-input" />
      <Input type="number" step="0.5" min="0" placeholder="Ωριαία τιμή" value={rate} onChange={(e) => setRate(e.target.value)} className="md:w-40" />
      <Button
        type="button"
        disabled={pending}
        data-testid="add-task-btn"
        onClick={() => {
          if (!name.trim()) return;
          startTransition(async () => {
            const res = await saveTask(projectId, name, rate ? Number(rate) : null);
            if (!res.ok) toast.error(res.error);
            else {
              setName("");
              setRate("");
              toast.success("Η εργασία προστέθηκε.");
            }
          });
        }}
      >
        Προσθήκη
      </Button>
    </div>
  );
}

export function TaskToggleForm({ id, projectId, done, name, rate }: { id: string; projectId: string; done: boolean; name: string; rate: number | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex flex-1 cursor-pointer items-center gap-3">
      <Checkbox
        checked={done}
        disabled={pending}
        onCheckedChange={() => {
          startTransition(async () => {
            const res = await toggleTaskDone(id, projectId);
            if (!res.ok) toast.error(res.error);
          });
        }}
      />
      <span className={done ? "line-through text-muted-foreground" : ""}>{name}</span>
      {rate ? <span className="ml-auto text-xs text-muted-foreground">{rate.toFixed(2)} €/ώρα</span> : null}
    </label>
  );
}

export function DeleteTimeEntryButton({ id, projectId }: { id: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={() => {
        if (!confirm("Διαγραφή καταχώρησης;")) return;
        startTransition(async () => {
          const res = await deleteTimeEntry(id, projectId);
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

export function DeleteProjectExpenseButton({ id, projectId }: { id: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={() => {
        if (!confirm("Διαγραφή εξόδου;")) return;
        startTransition(async () => {
          const res = await deleteProjectExpense(id, projectId);
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
