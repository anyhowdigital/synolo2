"use client";

import { useState, useTransition, type ReactNode } from "react";
import { format } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Scale, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addAdvanceAction, addManualCreditAction, applyCreditAction, deleteCreditEntryAction, refundCreditAction } from "@/app/actions/credits";
import { PAYMENT_METHODS } from "@/lib/greek/document-types";
import { formatDate, formatMoney, round2 } from "@/lib/invoice/totals";
import type { OpenCreditNote } from "@/lib/services/credits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface CreditAccountOption {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
}

export interface OffsetTarget {
  id: string;
  label: string;
  issueDate: string;
  dueDate: string | null;
  remaining: number;
  currency: string;
}

function suggestedAccount(accounts: CreditAccountOption[], method: number) {
  if (accounts.length === 0) return "";
  if (method === 3) return accounts.find((a) => a.kind === "cash")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  if (method === 7) return accounts.find((a) => a.kind === "card")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  return accounts.find((a) => a.isDefault && a.kind !== "cash")?.id ?? accounts.find((a) => a.kind === "bank")?.id ?? accounts[0].id;
}

/** Προκαταβολή (είσπραξη χωρίς παραστατικό) ή επιστροφή χρημάτων από το πιστωτικό υπόλοιπο. */
export function CreditMoneyDialog({ customerId, mode, accounts, maxRefund = 0, trigger }: { customerId: string; mode: "advance" | "refund"; accounts: CreditAccountOption[]; maxRefund?: number; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(mode === "refund" ? String(maxRefund) : "");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("1");
  const [accountId, setAccountId] = useState(suggestedAccount(accounts, 1));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const isRefund = mode === "refund";

  const submit = () =>
    start(async () => {
      const payload = { customerId, amount: Number(amount), movedAt, method: Number(method), accountId: accountId || undefined, reference, note };
      const res = isRefund ? await refundCreditAction(payload) : await addAdvanceAction(payload);
      if (res.ok) {
        toast.success(isRefund ? "Η επιστροφή καταχωρήθηκε." : "Η προκαταβολή καταχωρήθηκε.");
        setOpen(false);
        setAmount("");
        setReference("");
        setNote("");
      } else toast.error(res.error);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && isRefund) setAmount(String(maxRefund));
      }}
    >
      <DialogTrigger asChild>
        {trigger ??
          (isRefund ? (
            <Button variant="outline" size="sm" disabled={maxRefund <= 0}>
              <ArrowUpFromLine data-icon="inline-start" /> Επιστροφή
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <ArrowDownToLine data-icon="inline-start" /> Προκαταβολή
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRefund ? "Επιστροφή χρημάτων στον πελάτη" : "Προκαταβολή πελάτη"}</DialogTitle>
          <DialogDescription>
            {isRefund
              ? `Επιστρέφετε μέρος ή όλο το πιστωτικό υπόλοιπο από προκαταβολές (${formatMoney(maxRefund)}). Η κίνηση καταχωρείται ως εκροή στον λογαριασμό.`
              : "Χρήματα που εισπράττετε πριν την έκδοση παραστατικού. Πιστώνονται στον πελάτη και συμψηφίζονται αργότερα με τα τιμολόγιά του."}
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
              <Label htmlFor="cr-amount">Ποσό *</Label>
              <Input id="cr-amount" type="number" step="0.01" min={0.01} max={isRefund ? maxRefund : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cr-date">Ημερομηνία *</Label>
              <Input id="cr-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Τρόπος</Label>
              <Select
                value={method}
                onValueChange={(v) => {
                  setMethod(v);
                  setAccountId(suggestedAccount(accounts, Number(v)));
                }}
              >
                <SelectTrigger aria-label="Τρόπος πληρωμής">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((m) => m.code !== 5).map((m) => (
                    <SelectItem key={m.code} value={String(m.code)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cr-ref">Αναφορά</Label>
              <Input id="cr-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} placeholder="π.χ. αρ. συναλλαγής" />
            </div>
            {accounts.length > 0 ? (
              <div className="grid gap-2 sm:col-span-2">
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
            ) : null}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="cr-note">Σημείωση</Label>
              <Input id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={isRefund ? "π.χ. Επιστροφή προκαταβολής – ακύρωση παραγγελίας" : "π.χ. Προκαταβολή για παραγγελία #1023"} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !(Number(amount) > 0)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {isRefund ? "Καταχώρηση επιστροφής" : "Καταχώρηση προκαταβολής"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Χειροκίνητη πίστωση ή διόρθωση πιστωτικού υπολοίπου (χωρίς κίνηση χρημάτων). */
export function ManualCreditDialog({ customerId, ledgerBalance }: { customerId: string; ledgerBalance: number }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const res = await addManualCreditAction({ customerId, amount: (direction === "debit" ? -1 : 1) * Number(amount), movedAt, note });
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
        <Button variant="ghost" size="sm">
          <SlidersHorizontal data-icon="inline-start" /> Πίστωση / διόρθωση
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Πίστωση ή διόρθωση υπολοίπου</DialogTitle>
          <DialogDescription>Για εμπορικές πιστώσεις (π.χ. αποζημίωση) ή διορθώσεις χωρίς κίνηση χρημάτων. Τρέχον πιστωτικό υπόλοιπο από προκαταβολές: {formatMoney(ledgerBalance)}.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label>Είδος</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "credit" | "debit")}>
              <SelectTrigger aria-label="Είδος κίνησης">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">+ Πίστωση προς τον πελάτη</SelectItem>
                <SelectItem value="debit">− Μείωση πιστωτικού υπολοίπου</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mc-amount">Ποσό *</Label>
              <Input id="mc-amount" type="number" step="0.01" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mc-date">Ημερομηνία *</Label>
              <Input id="mc-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mc-note">Αιτιολογία *</Label>
            <Input id="mc-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} required placeholder="π.χ. Εμπορική πίστωση για καθυστέρηση παράδοσης" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !(Number(amount) > 0) || !note.trim()}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Καταχώρηση
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Συμψηφισμός διαθέσιμου πιστωτικού με ανοιχτό παραστατικό. */
export function ApplyCreditDialog({
  customerId,
  available,
  ledgerBalance,
  creditNotes,
  targets,
  fixedInvoiceId,
  trigger,
}: {
  customerId: string;
  available: number;
  ledgerBalance: number;
  creditNotes: OpenCreditNote[];
  targets: OffsetTarget[];
  fixedInvoiceId?: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(fixedInvoiceId ?? targets[0]?.id ?? "");
  const target = targets.find((t) => t.id === invoiceId);
  const maxAmount = target ? round2(Math.min(available, target.remaining)) : 0;
  const [amount, setAmount] = useState(String(maxAmount));
  const [source, setSource] = useState("auto");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [pending, start] = useTransition();

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const t = targets.find((x) => x.id === id);
    setAmount(String(t ? round2(Math.min(sourceMax(source), t.remaining)) : 0));
  };
  const sourceMax = (src: string) => (src === "auto" ? available : (creditNotes.find((c) => c.id === src)?.remaining ?? 0));
  const pickSource = (src: string) => {
    setSource(src);
    if (target) setAmount(String(round2(Math.min(sourceMax(src), target.remaining))));
  };

  const submit = () =>
    start(async () => {
      const res = await applyCreditAction({ customerId, invoiceId, amount: Number(amount), movedAt, sourceCreditNoteId: source === "auto" ? undefined : source });
      if (res.ok) {
        toast.success(`Ο συμψηφισμός καταχωρήθηκε: ${res.warning ?? ""}`.trim());
        setOpen(false);
      } else toast.error(res.error);
    });

  const disabled = available <= 0.005 || targets.length === 0;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          const id = fixedInvoiceId ?? targets[0]?.id ?? "";
          setInvoiceId(id);
          setSource("auto");
          const t = targets.find((x) => x.id === id);
          setAmount(String(t ? round2(Math.min(available, t.remaining)) : 0));
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={disabled}>
            <Scale data-icon="inline-start" /> Συμψηφισμός
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Συμψηφισμός με πιστωτικό υπόλοιπο</DialogTitle>
          <DialogDescription>
            Διαθέσιμο πιστωτικό {formatMoney(available)}
            {creditNotes.length ? ` (${formatMoney(round2(available - ledgerBalance))} από ${creditNotes.length} πιστωτικά τιμολόγια` : ""}
            {creditNotes.length ? `${ledgerBalance > 0 ? `, ${formatMoney(ledgerBalance)} από προκαταβολές` : ""})` : ledgerBalance > 0 ? ` από προκαταβολές` : ""}. Θα καταχωρηθεί είσπραξη-συμψηφισμός στο παραστατικό, χωρίς κίνηση
            χρημάτων.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label>Παραστατικό προς εξόφληση</Label>
            {fixedInvoiceId ? (
              <p className="rounded-md border px-3 py-2 text-sm">
                {target?.label} · υπόλοιπο {formatMoney(target?.remaining ?? 0)}
              </p>
            ) : (
              <Select value={invoiceId} onValueChange={pickInvoice}>
                <SelectTrigger aria-label="Παραστατικό">
                  <SelectValue placeholder="Επιλέξτε παραστατικό" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} · {formatDate(t.issueDate)} · υπόλοιπο {formatMoney(t.remaining)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {creditNotes.length > 0 ? (
            <div className="grid gap-2">
              <Label>Πηγή πιστωτικού</Label>
              <Select value={source} onValueChange={pickSource}>
                <SelectTrigger aria-label="Πηγή πιστωτικού">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Αυτόματα (πρώτα τα πιστωτικά τιμολόγια, έπειτα οι προκαταβολές)</SelectItem>
                  {creditNotes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Πιστωτικό {c.label} · {formatDate(c.issueDate)} · {formatMoney(c.remaining)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ac-amount">Ποσό συμψηφισμού *</Label>
              <Input id="ac-amount" type="number" step="0.01" min={0.01} max={target ? round2(Math.min(sourceMax(source), target.remaining)) : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ac-date">Ημερομηνία *</Label>
              <Input id="ac-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} required />
            </div>
          </div>
          {target && Number(amount) > 0 && Number(amount) < target.remaining - 0.005 ? <p className="text-xs text-muted-foreground">Μερική εξόφληση – θα απομείνει υπόλοιπο {formatMoney(round2(target.remaining - Number(amount)))} στο παραστατικό.</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !invoiceId || !(Number(amount) > 0)}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Scale data-icon="inline-start" />}
              Συμψηφισμός
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCreditButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      disabled={pending}
      aria-label="Διαγραφή κίνησης"
      onClick={() =>
        start(async () => {
          const res = await deleteCreditEntryAction(id);
          if (res.ok) toast.success("Η κίνηση διαγράφηκε.");
          else toast.error(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
