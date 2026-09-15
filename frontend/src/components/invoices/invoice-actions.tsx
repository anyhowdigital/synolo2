"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Ban,
  BellRing,
  Check,
  CloudUpload,
  Copy,
  Download,
  FileCheck,
  FileDown,
  FileMinus,
  Languages,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Printer,
  Repeat,
  ArrowRightLeft,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelInvoiceAction,
  convertQuoteAction,
  deleteDraftAction,
  duplicateInvoiceAction,
  emailInvoiceAction,
  issueInvoiceAction,
  makeRecurringAction,
  publicLinkAction,
  quoteStatusAction,
  recordPaymentAction,
  sendReminderAction,
  transmitInvoiceAction,
} from "@/app/actions/invoices";
import type { ActionResult } from "@/app/actions/customers";
import type { Invoice, Series } from "@/db/schema";
import { getDocumentType, PAYMENT_METHODS } from "@/lib/greek/document-types";
import { formatMoney, round2 } from "@/lib/invoice/totals";
import { INTERVAL_LABELS } from "@/lib/services/recurring-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvoiceConfirmation, issuanceNotice, type InvoiceConfirmationContext } from "./invoice-confirmation";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { DOC_LANG_OPTIONS } from "@/lib/pdf/labels";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  invoice: Invoice;
  companyName: string;
  autoTransmit: boolean;
  autoB2G: boolean;
  mydataEnv: string;
  canWrite: boolean;
  customerEmail?: string | null;
  /** Σειρές για μετατροπή προσφοράς / πιστωτικό. */
  seriesList?: Series[];
  /** Λογαριασμοί ταμείου/τράπεζας για την είσπραξη. */
  accounts?: PaymentAccountOption[];
}

export interface PaymentAccountOption {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
}

export function InvoiceActions({ invoice, companyName, autoTransmit, autoB2G, mydataEnv, canWrite, customerEmail, seriesList = [], accounts = [] }: Props) {
  const [pending, start] = useTransition();
  const [confirmation, setConfirmation] = useState<"issue" | "transmit" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const context: InvoiceConfirmationContext = { companyName, documentLabel: invoiceDisplayNumber(invoice), customerName: invoice.customerName, total: formatMoney(invoice.totalGrossValue, invoice.currency) };
  const run = (fn: () => Promise<ActionResult>, successMsg: string) =>
    start(async () => {
      setActionError(null);
      const res = await fn();
      if (res.ok) {
        toast.success(successMsg);
        if (res.warning) toast.warning(res.warning);
      } else { setActionError(res.error); toast.error(res.error); }
    });

  const dt = getDocumentType(invoice.invoiceType);
  const isQuote = dt.kind === "quote";
  const isDraft = invoice.status === "draft";
  const isCancelled = invoice.status === "cancelled";
  const canTransmit = !isQuote && !isDraft && !isCancelled && invoice.mydataStatus !== "sent";
  const canPay = dt.kind === "invoice" && (invoice.status === "issued" || invoice.status === "partially_paid") && invoice.totalGrossValue - invoice.paidAmount > 0.005;
  const canCancel = !isQuote && !isDraft && !isCancelled && invoice.paidAmount === 0;
  const overdue = canPay && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const creditSeries = seriesList.filter((s) => s.active && getDocumentType(s.invoiceType).credit && getDocumentType(s.invoiceType).retail === dt.retail);
  const canCredit = dt.kind === "invoice" && !dt.credit && invoice.mydataStatus === "sent" && !isCancelled && creditSeries.length > 0;

  if (!canWrite) {
    return (
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {!isDraft ? (
          <>
            <Button asChild variant="outline">
              <a href={`/api/invoices/${invoice.id}/pdf`} download>
                <FileDown data-icon="inline-start" /> PDF
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/print/invoices/${invoice.id}`} target="_blank">
                <Printer data-icon="inline-start" /> Εκτύπωση
              </Link>
            </Button>
            {!isQuote ? (
              <Button asChild variant="outline">
                <a href={`/api/invoices/${invoice.id}/xml`} download>
                  <Download data-icon="inline-start" /> XML myDATA
                </a>
              </Button>
            ) : null}
          </>
        ) : null}
        <span className="text-xs text-muted-foreground">Πρόσβαση μόνο για ανάγνωση.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {actionError && <Alert variant="destructive" className="basis-full" data-testid="invoice-action-error"><AlertDescription>{actionError}</AlertDescription></Alert>}
      <InvoiceConfirmation open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }} context={context} title={confirmation === "issue" ? "Έκδοση παραστατικού" : "Διαβίβαση στο myDATA"} description={confirmation === "issue" ? issuanceNotice({ quote: isQuote, autoTransmit, environment: mydataEnv, autoB2G }) : mydataEnv === "mock" ? "Θα εκτελεστεί προσομοίωση διαβίβασης. Δεν θα σταλεί αίτημα στην παραγωγή της ΑΑΔΕ." : `Θα σταλούν τα στοιχεία αυτού του εκδοθέντος παραστατικού στο ${mydataEnv === "prod" ? "παραγωγικό" : "δοκιμαστικό"} myDATA. Δεν πρόκειται για αποστολή email στον πελάτη. Μετά από επιτυχή διαβίβαση, τυχόν διόρθωση απαιτεί την κατάλληλη διαδικασία ακύρωσης ή πιστωτικού.`} confirmLabel={confirmation === "issue" ? "Έκδοση τώρα" : "Επιβεβαίωση διαβίβασης"} pending={pending} testId="invoice-confirm-action" onConfirm={() => { const selected = confirmation; setConfirmation(null); if (selected === "issue") run(() => issueInvoiceAction(invoice.id), isQuote ? "Η προσφορά εκδόθηκε." : "Το παραστατικό εκδόθηκε."); else if (selected === "transmit") run(() => transmitInvoiceAction(invoice.id), mydataEnv === "mock" ? "Η προσομοίωση διαβίβασης ολοκληρώθηκε." : "Το παραστατικό διαβιβάστηκε στο myDATA."); }} />
      {isDraft ? (
        <>
          <Button onClick={() => setConfirmation("issue")} disabled={pending} data-testid="invoice-issue-open">
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FileCheck data-icon="inline-start" />}
            Έκδοση
          </Button>
          <Button asChild variant="outline">
            <Link href={`/invoices/${invoice.id}/edit`}>
              <Pencil data-icon="inline-start" /> Επεξεργασία
            </Link>
          </Button>
          <ConfirmButton
            label="Διαγραφή"
            icon={<Trash2 data-icon="inline-start" />}
            title="Διαγραφή πρόχειρου"
            description="Θα διαγραφούν οριστικά αυτό το πρόχειρο και οι γραμμές του. Δεν υπάρχει αναίρεση. Δεν θα ακυρωθεί κανένα εκδοθέν παραστατικό και δεν θα γίνει διαβίβαση."
            context={context}
            testId="invoice-delete-draft"
            pending={pending}
            confirmLabel="Διαγραφή"
            onConfirm={() => run(() => deleteDraftAction(invoice.id), "Το πρόχειρο διαγράφηκε.")}
            variant="ghost"
          />
        </>
      ) : null}

      {canTransmit ? (
        <Button onClick={() => setConfirmation("transmit")} disabled={pending} data-testid="invoice-transmit-open">
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CloudUpload data-icon="inline-start" />}
          {invoice.mydataStatus === "error" ? "Επανάληψη διαβίβασης" : "Διαβίβαση στο myDATA"}
          {mydataEnv === "mock" ? " (προσομοίωση)" : ""}
        </Button>
      ) : null}

      {isQuote && invoice.status === "issued" ? (
        <>
          <Button onClick={() => run(() => quoteStatusAction(invoice.id, "accepted"), "Η προσφορά σημάνθηκε ως αποδεκτή.")} disabled={pending} variant="outline">
            <Check data-icon="inline-start" /> Αποδοχή
          </Button>
          <Button onClick={() => run(() => quoteStatusAction(invoice.id, "rejected"), "Η προσφορά σημάνθηκε ως απορριφθείσα.")} disabled={pending} variant="ghost">
            <X data-icon="inline-start" /> Απόρριψη
          </Button>
        </>
      ) : null}
      {isQuote && (invoice.status === "issued" || invoice.status === "accepted") ? <ConvertQuoteDialog invoice={invoice} seriesList={seriesList} /> : null}

      {canPay ? <PaymentDialog invoice={invoice} accounts={accounts} /> : null}

      {!isDraft ? <EmailDialog invoice={invoice} defaultTo={customerEmail ?? ""} /> : null}

      {!isDraft ? (
        <Button asChild variant="outline">
          <a href={`/api/invoices/${invoice.id}/pdf`} download>
            <FileDown data-icon="inline-start" /> PDF
          </a>
        </Button>
      ) : null}
      {!isDraft ? (
        <Button asChild variant="outline">
          <Link href={`/print/invoices/${invoice.id}`} target="_blank">
            <Printer data-icon="inline-start" /> Εκτύπωση
          </Link>
        </Button>
      ) : null}

      {canCredit ? (
        <Button asChild variant="outline">
          <Link href={`/invoices/new?creditOf=${invoice.id}`}>
            <FileMinus data-icon="inline-start" /> Πιστωτικό
          </Link>
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Περισσότερα">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={() => run(() => duplicateInvoiceAction(invoice.id), "Δημιουργήθηκε αντίγραφο.")}>
            <Copy /> Αντιγραφή σε νέο πρόχειρο
          </DropdownMenuItem>
          {!isDraft ? (
            <DropdownMenuItem
              onClick={() =>
                start(async () => {
                  const res = await publicLinkAction(invoice.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(res.id!);
                    toast.success("Ο δημόσιος σύνδεσμος αντιγράφηκε.");
                  } catch {
                    toast.info(res.id!);
                  }
                })
              }
            >
              <Link2 /> Αντιγραφή δημόσιου συνδέσμου
            </DropdownMenuItem>
          ) : null}
          {overdue ? (
            <DropdownMenuItem onClick={() => run(() => sendReminderAction(invoice.id), "Η υπενθύμιση στάλθηκε.")}>
              <BellRing /> Αποστολή υπενθύμισης πληρωμής
            </DropdownMenuItem>
          ) : null}
          {!isDraft && !isQuote ? (
            <DropdownMenuItem asChild>
              <a href={`/api/invoices/${invoice.id}/xml`} download>
                <Download /> Λήψη XML myDATA
              </a>
            </DropdownMenuItem>
          ) : null}
          {!isDraft ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages /> PDF σε άλλη γλώσσα
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {DOC_LANG_OPTIONS.map((o) => (
                  <DropdownMenuItem key={o.id} asChild>
                    <a href={`/api/invoices/${invoice.id}/pdf?lang=${o.id}`} download>
                      {o.label}
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {dt.kind === "invoice" && invoice.customerId ? (
            <>
              <DropdownMenuSeparator />
              <RecurringDialog invoice={invoice} />
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canCancel ? (
        <ConfirmButton
          label="Ακύρωση"
          icon={<Ban data-icon="inline-start" />}
          title="Ακύρωση εκδοθέντος παραστατικού"
          context={context}
          testId="invoice-cancel-issued"
          pending={pending}
          description={
            (invoice.mydataStatus === "sent" && invoice.mydataMark
              ? `Θα σταλεί αίτημα ακύρωσης στο myDATA για το MARK ${invoice.mydataMark} (${mydataEnv === "prod" ? "παραγωγή" : mydataEnv === "mock" ? "προσομοίωση" : "δοκιμαστικό περιβάλλον"}). `
              : "Δεν υπάρχει επιτυχής διαβίβαση που να χρειάζεται ακύρωση στο myDATA. ") + "Το παραστατικό θα παραμείνει στο αρχείο ως ακυρωμένο και θα αντιστραφούν οι σχετικές κινήσεις αποθέματος. Δεν θα επιστρέψει σε επεξεργάσιμο πρόχειρο. Τυχόν αποστολή B2G δεν ανακαλείται από αυτή την ενέργεια."
          }
          confirmLabel="Ακύρωση παραστατικού"
          onConfirm={() => run(() => cancelInvoiceAction(invoice.id), "Το παραστατικό ακυρώθηκε.")}
          variant="ghost"
        />
      ) : null}
    </div>
  );
}

function ConfirmButton({ label, icon, title, description, confirmLabel, onConfirm, variant, context, testId, pending }: { label: string; icon: React.ReactNode; title: string; description: string; confirmLabel: string; onConfirm: () => void; variant: "ghost" | "outline"; context: InvoiceConfirmationContext; testId: string; pending: boolean }) {
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant={variant} className="text-destructive" onClick={() => setOpen(true)} disabled={pending} data-testid={`${testId}-open`}>{icon}{label}</Button><InvoiceConfirmation open={open} onOpenChange={setOpen} context={context} title={title} description={description} confirmLabel={confirmLabel} destructive pending={pending} testId={testId} onConfirm={() => { setOpen(false); onConfirm(); }} /></>;
}

function suggestedAccount(accounts: PaymentAccountOption[], method: number) {
  if (accounts.length === 0) return "";
  if (method === 3) return accounts.find((a) => a.kind === "cash")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  if (method === 7) return accounts.find((a) => a.kind === "card")?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  return accounts.find((a) => a.isDefault && a.kind !== "cash")?.id ?? accounts.find((a) => a.kind === "bank")?.id ?? accounts[0].id;
}

function PaymentDialog({ invoice, accounts }: { invoice: Invoice; accounts: PaymentAccountOption[] }) {
  const [open, setOpen] = useState(false);
  const initialMethod = invoice.paymentMethod === 5 ? 6 : invoice.paymentMethod;
  const [method, setMethod] = useState(String(initialMethod));
  const [accountId, setAccountId] = useState(suggestedAccount(accounts, initialMethod));
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await recordPaymentAction(prev, fd);
    if (res.ok) {
      toast.success("Η είσπραξη καταχωρήθηκε.");
      setOpen(false);
    }
    return res;
  }, null);
  const remaining = round2(invoice.totalGrossValue - invoice.paidAmount);
  const isCredit = getDocumentType(invoice.invoiceType).credit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Wallet data-icon="inline-start" /> {isCredit ? "Επιστροφή χρημάτων" : "Είσπραξη"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCredit ? "Επιστροφή χρημάτων στον πελάτη" : "Καταχώρηση είσπραξης"}</DialogTitle>
          <DialogDescription>
            {isCredit ? "Ανεξόφλητο πιστωτικό" : "Υπόλοιπο παραστατικού"}: {formatMoney(remaining, invoice.currency)}
            {isCredit ? " · Εναλλακτικά συμψηφίστε το με ανοιχτό τιμολόγιο από τη σελίδα του πελάτη." : ""}
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div className="grid gap-2">
            <Label htmlFor="amount">{isCredit ? "Ποσό επιστροφής" : "Ποσό"}</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min={0.01} max={remaining} defaultValue={remaining} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="paidAt">Ημερομηνία</Label>
              <Input id="paidAt" name="paidAt" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required />
            </div>
            <div className="grid gap-2">
              <Label>Τρόπος</Label>
              <Select
                name="method"
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
                  {PAYMENT_METHODS.filter((m) => m.code !== 5).map((m) => (
                    <SelectItem key={m.code} value={String(m.code)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {accounts.length > 0 ? (
            <div className="grid gap-2">
              <Label>{isCredit ? "Λογαριασμός επιστροφής" : "Λογαριασμός είσπραξης"}</Label>
              <input type="hidden" name="accountId" value={accountId} />
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger aria-label="Λογαριασμός είσπραξης">
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
          <div className="grid gap-2">
            <Label htmlFor="reference">Αναφορά (προαιρετικό)</Label>
            <Input id="reference" name="reference" placeholder="π.χ. αριθμός συναλλαγής, επιταγής" />
          </div>
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
              Καταχώρηση
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({ invoice, defaultTo }: { invoice: Invoice; defaultTo: string }) {
  const [open, setOpen] = useState(false);
  const isQuote = getDocumentType(invoice.invoiceType).kind === "quote";
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await emailInvoiceAction(prev, fd);
    if (res.ok) {
      toast.success("Το email στάλθηκε.");
      if (res.warning) toast.info(res.warning);
      setOpen(false);
    }
    return res;
  }, null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail data-icon="inline-start" /> {invoice.emailedAt ? "Επαναποστολή" : "Αποστολή email"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Αποστολή με email</DialogTitle>
          <DialogDescription>
            Ο πελάτης λαμβάνει σύνδεσμο προβολής/εκτύπωσης {isQuote ? "με δυνατότητα αποδοχής της προσφοράς online" : "και το XML myDATA (εάν έχει διαβιβαστεί)"}.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div className="grid gap-2">
            <Label htmlFor="to">Προς</Label>
            <Input id="to" name="to" type="email" defaultValue={defaultTo} placeholder="logistirio@pelatis.gr" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="message">Μήνυμα (προαιρετικό)</Label>
            <Textarea id="message" name="message" rows={3} placeholder="Προσωπικό σημείωμα προς τον πελάτη." />
          </div>
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
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
              Αποστολή
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function ConvertQuoteDialog({ invoice, seriesList }: { invoice: Invoice; seriesList: Series[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const targets = seriesList.filter((s) => s.active && getDocumentType(s.invoiceType).kind !== "quote" && !getDocumentType(s.invoiceType).credit && !getDocumentType(s.invoiceType).retail);
  const [seriesId, setSeriesId] = useState(targets[0]?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <ArrowRightLeft data-icon="inline-start" /> Μετατροπή σε τιμολόγιο
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Μετατροπή προσφοράς</DialogTitle>
          <DialogDescription>Δημιουργείται πρόχειρο παραστατικό με τις γραμμές της προσφοράς. Η προσφορά σημαίνεται ως «Μετατράπηκε».</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Σειρά προορισμού</Label>
          <Select value={seriesId} onValueChange={setSeriesId}>
            <SelectTrigger>
              <SelectValue placeholder="Επιλέξτε σειρά" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} – {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Άκυρο
          </Button>
          <Button
            disabled={!seriesId || pending}
            onClick={() =>
              start(async () => {
                const res = await convertQuoteAction(invoice.id, seriesId);
                if (!res.ok) toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Μετατροπή
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecurringDialog({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await makeRecurringAction(prev, fd);
    if (res.ok) {
      toast.success("Το επαναλαμβανόμενο πρότυπο δημιουργήθηκε. Διαχείριση από τη σελίδα «Επαναλαμβανόμενα».");
      setOpen(false);
    }
    return res;
  }, null);
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <Repeat /> Μετατροπή σε επαναλαμβανόμενο
        </DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Επαναλαμβανόμενο παραστατικό</DialogTitle>
          <DialogDescription>Θα δημιουργείται αυτόματα νέο παραστατικό με τις ίδιες γραμμές στην επιλεγμένη συχνότητα.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div className="grid gap-2">
            <Label htmlFor="rname">Όνομα προτύπου</Label>
            <Input id="rname" name="name" defaultValue={`${invoice.customerName} – ${invoice.seriesCode}`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Συχνότητα</Label>
              <Select name="interval" defaultValue="monthly">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nextRunAt">Πρώτη εκτέλεση</Label>
              <Input id="nextRunAt" name="nextRunAt" type="date" defaultValue={format(nextMonth, "yyyy-MM-dd")} required />
            </div>
          </div>
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
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Repeat data-icon="inline-start" />}
              Δημιουργία
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
