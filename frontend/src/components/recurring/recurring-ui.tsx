"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useTransition } from "react";
import { format } from "date-fns";
import { Loader2, Pause, Play, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { deleteTemplateAction, runDueNowAction, runTemplateNowAction, saveTemplateAction, toggleTemplateAction } from "@/app/actions/recurring";
import type { ActionResult } from "@/app/actions/customers";
import type { Customer, Product, RecurringTemplate, Series } from "@/db/schema";
import { getDocumentType, PAYMENT_METHODS } from "@/lib/greek/document-types";
import { VAT_CATEGORIES } from "@/lib/greek/vat";
import { computeInvoice, formatMoney } from "@/lib/invoice/totals";
import { INTERVAL_LABELS } from "@/lib/services/recurring-labels";
import type { InvoicePayload } from "@/lib/invoice/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Line = InvoicePayload["lines"][number] & { key: string };
let k = 0;
const newKey = () => `r${Date.now()}-${k++}`;

interface RefData {
  customers: Customer[];
  products: Product[];
  seriesList: Series[];
}

export function RunDueButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runDueNowAction();
          if (res.ok) toast.success(`Εκτελέστηκαν τα ληξιπρόθεσμα πρότυπα (${res.id} νέα παραστατικά).`);
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Zap data-icon="inline-start" />}
      Εκτέλεση ληξιπρόθεσμων
    </Button>
  );
}

export function TemplateRowActions({ template, refData }: { template: RecurringTemplate; refData: RefData }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, msg: string | ((r: ActionResult) => string)) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(typeof msg === "function" ? msg(res) : msg);
      else toast.error(res.error);
    });
  return (
    <div className="flex justify-end gap-1">
      <TemplateDialog refData={refData} template={template} />
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => runTemplateNowAction(template.id), "Δημιουργήθηκε παραστατικό από το πρότυπο.")} title="Εκτέλεση τώρα">
        <Zap />
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => toggleTemplateAction(template.id), template.active ? "Το πρότυπο τέθηκε σε παύση." : "Το πρότυπο ενεργοποιήθηκε.")} title={template.active ? "Παύση" : "Ενεργοποίηση"}>
        {template.active ? <Pause /> : <Play />}
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => run(() => deleteTemplateAction(template.id), "Το πρότυπο διαγράφηκε.")} title="Διαγραφή">
        <Trash2 />
      </Button>
    </div>
  );
}

export function TemplateDialog({ refData, template }: { refData: RefData; template?: RecurringTemplate }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await saveTemplateAction(prev, fd);
    if (res.ok) {
      toast.success("Το πρότυπο αποθηκεύτηκε.");
      setOpen(false);
    }
    return res;
  }, null);

  const invoiceSeries = refData.seriesList.filter((s) => s.active && getDocumentType(s.invoiceType).kind === "invoice" && !getDocumentType(s.invoiceType).credit);
  const [seriesId, setSeriesId] = useState(template?.seriesId ?? invoiceSeries[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(template?.customerId ?? "");
  const [interval, setInterval] = useState(template?.interval ?? "monthly");
  const [paymentMethod, setPaymentMethod] = useState(String(template?.paymentMethod ?? 1));
  const [lines, setLines] = useState<Line[]>(() => {
    if (template) return (JSON.parse(template.linesJson) as InvoicePayload["lines"]).map((l) => ({ ...l, key: newKey() }));
    return [emptyLine(invoiceSeries[0]?.invoiceType ?? "2.1")];
  });

  const docType = getDocumentType(invoiceSeries.find((s) => s.id === seriesId)?.invoiceType ?? "2.1");
  const totals = (() => {
    try {
      return computeInvoice(lines);
    } catch {
      return null;
    }
  })();
  const update = (key: string, patch: Partial<Line>) => setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const applyProduct = (key: string, productId: string) => {
    const p = refData.products.find((x) => x.id === productId);
    if (!p) return update(key, { productId: null });
    update(key, {
      productId: p.id,
      description: p.name,
      unitPrice: p.unitPrice,
      vatCategory: p.vatCategory,
      vatExemptionCategory: p.vatExemptionCategory,
      measurementUnit: p.measurementUnit,
      classificationCategory: p.classificationCategory,
      classificationType: p.classificationType,
    });
  };
  const linesJson = JSON.stringify(
    lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      vatCategory: l.vatCategory,
      vatExemptionCategory: l.vatExemptionCategory,
      measurementUnit: l.measurementUnit,
      classificationCategory: l.classificationCategory,
      classificationType: l.classificationType,
      withholdingCategory: l.withholdingCategory,
      stampDutyCategory: l.stampDutyCategory,
    })),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {template ? (
          <Button variant="ghost" size="sm">
            Επεξεργασία
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Νέο πρότυπο
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? `Πρότυπο: ${template.name}` : "Νέο επαναλαμβανόμενο πρότυπο"}</DialogTitle>
          <DialogDescription>Σε κάθε εκτέλεση δημιουργείται παραστατικό με αυτές τις γραμμές. Η εκτέλεση γίνεται αυτόματα (cron) ή χειροκίνητα.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {template ? <input type="hidden" name="id" value={template.id} /> : null}
          <input type="hidden" name="seriesId" value={seriesId} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="interval" value={interval} />
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          <input type="hidden" name="linesJson" value={linesJson} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="tname">Όνομα προτύπου *</Label>
              <Input id="tname" name="name" defaultValue={template?.name ?? ""} placeholder="π.χ. Συντήρηση – Αφοί Γεωργίου" required />
            </div>
            <div className="grid gap-2">
              <Label>Πελάτης *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Επιλέξτε πελάτη" />
                </SelectTrigger>
                <SelectContent>
                  {refData.customers
                    .filter((c) => c.afm || docType.retail)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.afm ? ` · ${c.afm}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Σειρά</Label>
              <Select value={seriesId} onValueChange={setSeriesId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invoiceSeries.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} – {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Συχνότητα</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_LABELS).map(([kk, v]) => (
                    <SelectItem key={kk} value={kk}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nextRunAt">Επόμενη εκτέλεση</Label>
              <Input id="nextRunAt" name="nextRunAt" type="date" defaultValue={template?.nextRunAt ?? format(new Date(), "yyyy-MM-dd")} required />
            </div>
            <div className="grid gap-2">
              <Label>Τρόπος πληρωμής</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
              <Label htmlFor="tnotes">Παρατηρήσεις</Label>
              <Textarea id="tnotes" name="notes" rows={1} defaultValue={template?.notes ?? ""} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Γραμμές</Label>
            {lines.map((line) => (
              <div key={line.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[150px_1fr_70px_100px_110px_36px]">
                <Select value={line.productId ?? "__free"} onValueChange={(v) => (v === "__free" ? update(line.key, { productId: null }) : applyProduct(line.key, v))}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__free">Ελεύθερη</SelectItem>
                    {refData.products
                      .filter((p) => p.active)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input value={line.description} onChange={(e) => update(line.key, { description: e.target.value })} placeholder="Περιγραφή" />
                <Input type="number" step="0.01" value={line.quantity} onChange={(e) => update(line.key, { quantity: Number(e.target.value) })} className="text-right" aria-label="Ποσότητα" />
                <Input type="number" step="0.01" value={line.unitPrice} onChange={(e) => update(line.key, { unitPrice: Number(e.target.value) })} className="text-right" aria-label="Τιμή" />
                <Select value={String(line.vatCategory)} onValueChange={(v) => update(line.key, { vatCategory: Number(v), vatExemptionCategory: Number(v) === 7 ? 4 : null })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_CATEGORIES.map((v) => (
                      <SelectItem key={v.code} value={String(v.code)}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" disabled={lines.length === 1} onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine(docType.code)])}>
                <Plus data-icon="inline-start" /> Γραμμή
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">Σύνολο ανά εκτέλεση: {totals ? formatMoney(totals.totalGrossValue) : "—"}</span>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-2 text-sm">
              Αυτόματη έκδοση <Switch name="autoIssue" defaultChecked={template?.autoIssue ?? true} />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              Αυτόματη διαβίβαση myDATA <Switch name="autoTransmit" defaultChecked={template?.autoTransmit ?? false} />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              Αυτόματο email στον πελάτη <Switch name="autoEmail" defaultChecked={template?.autoEmail ?? false} />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm sm:col-span-3">
              <span>
                Αυτόματη χρέωση αποθηκευμένης κάρτας
                <span className="block text-xs text-muted-foreground">Μόλις εκδοθεί το παραστατικό, χρεώνεται η κάρτα του πελάτη χωρίς να χρειάζεται να κάνει κάτι.</span>
              </span>
              <Switch name="autoCharge" defaultChecked={template?.autoCharge ?? false} data-testid="template-autocharge" />
            </label>
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
            <Button type="submit" disabled={pending || !customerId || !seriesId}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function emptyLine(seriesType: string): Line {
  const dt = getDocumentType(seriesType);
  return {
    key: newKey(),
    productId: null,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    vatCategory: 1,
    vatExemptionCategory: null,
    measurementUnit: dt.defaultClassificationCategory === "category1_3" ? 7 : 1,
    classificationCategory: dt.defaultClassificationCategory,
    classificationType: dt.defaultClassificationType,
    withholdingCategory: 0,
    stampDutyCategory: 0,
  };
}
