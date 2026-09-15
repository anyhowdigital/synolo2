"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CloudDownload,
  CloudUpload,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteExpenseAction,
  saveExpenseAction,
  sendExpenseClassificationAction,
  sendPendingClassificationsAction,
  syncExpensesAction,
} from "@/app/actions/expenses";
import { createSupplierFromExpenseAction } from "@/app/actions/suppliers";
import type { ActionResult } from "@/app/actions/customers";
import type { Expense, ExpenseLine, Product, Supplier, Warehouse } from "@/db/schema";
import { DOCUMENT_TYPES } from "@/lib/greek/document-types";
import { VAT_CATEGORIES, getVatCategory } from "@/lib/greek/vat";
import {
  EXPENSE_CLASSIFICATION_CATEGORIES,
  EXPENSE_CLASSIFICATION_TYPES,
} from "@/lib/services/expense-labels";
import { formatMoney, round2 } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TagInput } from "@/components/tags/tag-input";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import {
  parseCustomFieldValues,
  parseTags,
  type CustomFieldDef,
} from "@/lib/services/custom-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExpensePaymentDialog, type PaymentAccountOption } from "@/components/suppliers/payment-dialog";

export function SyncExpensesButton({
  from,
  to,
  mock,
}: {
  from: string;
  to: string;
  mock: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await syncExpensesAction(from, to);
          if (res.ok) {
            toast.success(
              `Εισήχθησαν ${res.id} παραστατικά προμηθευτών από το myDATA.`,
            );
            if (res.warning) toast.info(res.warning);
          } else toast.error(res.error);
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <CloudDownload data-icon="inline-start" />
      )}
      Λήψη από myDATA{mock ? " (προσομοίωση)" : ""}
    </Button>
  );
}

export function SendClassificationsButton({
  from,
  to,
  count,
  mock,
}: {
  from: string;
  to: string;
  count: number;
  mock: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending || count === 0}
      title={
        count === 0
          ? "Δεν υπάρχουν χαρακτηρισμένα έξοδα προς διαβίβαση στην περίοδο"
          : undefined
      }
      onClick={() =>
        start(async () => {
          const res = await sendPendingClassificationsAction(from, to);
          if (res.ok) {
            toast.success(
              `Διαβιβάστηκαν ${res.id} χαρακτηρισμοί εξόδων στο myDATA${mock ? " (προσομοίωση)" : ""}.`,
            );
            if (res.warning) toast.warning(res.warning);
          } else toast.error(res.error);
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <CloudUpload data-icon="inline-start" />
      )}
      Διαβίβαση χαρακτηρισμών{count ? ` (${count})` : ""}
    </Button>
  );
}

export type SupplierOption = Pick<
  Supplier,
  | "id"
  | "name"
  | "afm"
  | "country"
  | "paymentTermsDays"
  | "defaultClassificationCategory"
  | "defaultClassificationType"
>;

export type PurchaseProductOption = Pick<Product, "id" | "name" | "sku" | "costPrice" | "avgCost" | "vatCategory" | "trackStock">;

export interface ExpenseDialogExtras {
  defs: CustomFieldDef[];
  tagSuggestions: string[];
  suppliers?: SupplierOption[];
  /** Είδη για τις γραμμές αγορών (τα εμπορεύματα με παρακολούθηση κινούν την αποθήκη). */
  products?: PurchaseProductOption[];
  warehouses?: Pick<Warehouse, "id" | "name" | "isDefault">[];
  /** Λογαριασμοί ταμείου/τράπεζας για την καταχώρηση πληρωμών. */
  accounts?: PaymentAccountOption[];
}

type ExpenseWithLines = Expense & { lines?: ExpenseLine[] };

export function ExpenseRowActions({
  expense,
  extras,
}: {
  expense: ExpenseWithLines;
  extras?: ExpenseDialogExtras;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (
    fn: () => Promise<ActionResult>,
    msg: string,
    after?: (res: ActionResult) => void,
  ) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(msg);
        after?.(res);
      } else toast.error(res.error);
    });
  const canSendClassification =
    !!expense.mark &&
    !!expense.classificationCategory &&
    !!expense.classificationType &&
    !expense.classificationSentAt;
  const canCreateSupplier = !expense.supplierId && !!expense.supplierName;
  return (
    <div className="flex justify-end gap-1">
      <ExpenseDialog expense={expense} extras={extras} />
      {canSendClassification ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => sendExpenseClassificationAction(expense.id),
              "Ο χαρακτηρισμός διαβιβάστηκε στο myDATA.",
            )
          }
          title="Διαβίβαση χαρακτηρισμού (SendExpensesClassification)"
        >
          <CloudUpload />
        </Button>
      ) : null}
      {canCreateSupplier ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => createSupplierFromExpenseAction(expense.id),
              "Δημιουργήθηκε καρτέλα προμηθευτή.",
              (res) => {
                if (res.ok && res.id) router.push(`/suppliers/${res.id}`);
              },
            )
          }
          title="Δημιουργία καρτέλας προμηθευτή από το παραστατικό"
        >
          <Truck />
        </Button>
      ) : null}
      {expense.status !== "rejected" ? (
        <ExpensePaymentDialog expense={expense} accounts={extras?.accounts} />
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={pending}
        onClick={() =>
          run(() => deleteExpenseAction(expense.id), "Το έξοδο διαγράφηκε.")
        }
        title="Διαγραφή"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

const NO_SUPPLIER = "__none__";
const FREE_LINE = "__free__";

interface LineDraft {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
  vatCategory: string;
  productId: string | null;
}

let lineSeq = 1;
function newLine(vatCategory = "1"): LineDraft {
  return {
    key: lineSeq++,
    description: "",
    quantity: "1",
    unitPrice: "",
    vatCategory,
    productId: null,
  };
}

function lineTotals(l: LineDraft) {
  const net = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
  const vat = round2(net * (getVatCategory(Number(l.vatCategory)).rate / 100));
  return { net, vat };
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ExpenseDialog({
  expense,
  extras,
  defaultSupplierId,
}: {
  expense?: ExpenseWithLines;
  extras?: ExpenseDialogExtras;
  defaultSupplierId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (prev, fd) => {
    const res = await saveExpenseAction(prev, fd);
    if (res.ok) {
      toast.success("Το έξοδο αποθηκεύτηκε.");
      setOpen(false);
    }
    return res;
  }, null);
  const supplierOptions = extras?.suppliers ?? [];
  const initialSupplier = supplierOptions.find(
    (s) => s.id === (expense?.supplierId ?? defaultSupplierId),
  );
  const [supplierId, setSupplierId] = useState(
    initialSupplier?.id ?? NO_SUPPLIER,
  );
  const [supplierName, setSupplierName] = useState(
    expense?.supplierName ?? initialSupplier?.name ?? "",
  );
  const [supplierAfm, setSupplierAfm] = useState(
    expense?.supplierAfm ?? initialSupplier?.afm ?? "",
  );
  const [supplierCountry, setSupplierCountry] = useState(
    expense?.supplierCountry ?? initialSupplier?.country ?? "GR",
  );
  const [issueDate, setIssueDate] = useState(
    expense?.issueDate ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [dueDate, setDueDate] = useState(
    expense?.dueDate ??
      (initialSupplier?.paymentTermsDays != null
        ? addDays(
            format(new Date(), "yyyy-MM-dd"),
            initialSupplier.paymentTermsDays,
          )
        : ""),
  );
  const [net, setNet] = useState(String(expense?.netValue ?? ""));
  const [vatCategory, setVatCategory] = useState(
    String(expense?.vatCategory ?? 1),
  );
  const [vatAmount, setVatAmount] = useState(String(expense?.vatAmount ?? ""));
  const [category, setCategory] = useState(
    expense?.classificationCategory ||
      initialSupplier?.defaultClassificationCategory ||
      "category2_4",
  );
  const [type, setType] = useState(
    expense?.classificationType ||
      initialSupplier?.defaultClassificationType ||
      "E3_585_015",
  );
  const [invoiceType, setInvoiceType] = useState(expense?.invoiceType ?? "1.1");
  const [deductible, setDeductible] = useState(expense?.vatDeductible ?? true);
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (expense?.lines ?? []).map((l) => ({
      key: lineSeq++,
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      vatCategory: String(l.vatCategory),
      productId: l.productId,
    })),
  );
  const [withLines, setWithLines] = useState((expense?.lines?.length ?? 0) > 0);
  const productOptions = extras?.products ?? [];
  const warehouseOptions = extras?.warehouses ?? [];
  const [warehouseId, setWarehouseId] = useState(warehouseOptions.find((w) => w.isDefault)?.id ?? warehouseOptions[0]?.id ?? "");
  const hasStockLines = withLines && lines.some((l) => productOptions.find((p) => p.id === l.productId)?.trackStock);

  const pickLineProduct = (key: number, id: string) => {
    if (id === FREE_LINE) return updateLine(key, { productId: null });
    const p = productOptions.find((x) => x.id === id);
    if (!p) return;
    updateLine(key, { productId: p.id, description: p.name, unitPrice: String(p.avgCost > 0 ? p.avgCost : p.costPrice), vatCategory: String(p.vatCategory) });
  };

  const recalcVat = (n: string, cat: string) => {
    const rate = getVatCategory(Number(cat)).rate;
    setVatAmount(String(round2((Number(n) || 0) * (rate / 100))));
  };

  const linesNet = round2(lines.reduce((s, l) => s + lineTotals(l).net, 0));
  const linesVat = round2(lines.reduce((s, l) => s + lineTotals(l).vat, 0));
  const effectiveNet = withLines ? linesNet : Number(net) || 0;
  const effectiveVat = withLines ? linesVat : Number(vatAmount) || 0;

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const s = supplierOptions.find((x) => x.id === id);
    if (!s) return;
    setSupplierName(s.name);
    setSupplierAfm(s.afm);
    setSupplierCountry(s.country);
    if (s.paymentTermsDays != null)
      setDueDate(addDays(issueDate, s.paymentTermsDays));
    if (!expense?.classificationCategory && s.defaultClassificationCategory)
      setCategory(s.defaultClassificationCategory);
    if (!expense?.classificationType && s.defaultClassificationType)
      setType(s.defaultClassificationType);
  };

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {expense ? (
          <Button variant="ghost" size="sm" title="Επεξεργασία / χαρακτηρισμός">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Νέο έξοδο
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {expense
              ? "Επεξεργασία / χαρακτηρισμός εξόδου"
              : "Καταχώρηση τιμολογίου αγοράς"}
          </DialogTitle>
          <DialogDescription>
            {expense?.source === "mydata"
              ? `Παραστατικό από myDATA (MARK ${expense.mark}). Συμπληρώστε τον χαρακτηρισμό εξόδου (ecls) για το Ε3.`
              : "Παραστατικό προμηθευτή που δεν έχει έρθει μέσω myDATA (π.χ. αποδείξεις, εξωτερικού) – με προαιρετική ανάλυση γραμμών."}
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {expense ? (
            <input type="hidden" name="id" value={expense.id} />
          ) : null}
          <input
            type="hidden"
            name="supplierId"
            value={supplierId === NO_SUPPLIER ? "" : supplierId}
          />
          <input type="hidden" name="warehouseId" value={hasStockLines ? warehouseId : ""} />
          <input type="hidden" name="vatCategory" value={vatCategory} />
          <input type="hidden" name="classificationCategory" value={category} />
          <input type="hidden" name="classificationType" value={type} />
          <input type="hidden" name="invoiceType" value={invoiceType} />
          <input
            type="hidden"
            name="vatDeductible"
            value={deductible ? "on" : "off"}
          />
          <input
            type="hidden"
            name="lines"
            value={JSON.stringify(
              withLines
                ? lines
                    .filter((l) => l.description.trim())
                    .map((l) => ({
                      description: l.description,
                      quantity: Number(l.quantity) || 0,
                      unitPrice: Number(l.unitPrice) || 0,
                      vatCategory: Number(l.vatCategory),
                      productId: l.productId,
                    }))
                : [],
            )}
          />
          {expense?.mark ? (
            <input type="hidden" name="mark" value={expense.mark} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {supplierOptions.length > 0 ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label>Καρτέλα προμηθευτή</Label>
                <Select value={supplierId} onValueChange={pickSupplier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>
                      — Χωρίς καρτέλα (ελεύθερη καταχώρηση) —
                    </SelectItem>
                    {supplierOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.afm ? ` · ${s.afm}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="supplierName">Προμηθευτής *</Label>
              <Input
                id="supplierName"
                name="supplierName"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplierAfm">ΑΦΜ προμηθευτή</Label>
              <Input
                id="supplierAfm"
                name="supplierAfm"
                value={supplierAfm}
                onChange={(e) => setSupplierAfm(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplierCountry">Χώρα</Label>
              <Input
                id="supplierCountry"
                name="supplierCountry"
                value={supplierCountry}
                onChange={(e) =>
                  setSupplierCountry(e.target.value.toUpperCase())
                }
                maxLength={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>Τύπος παραστατικού</Label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.filter((d) => d.kind === "invoice").map(
                    (d) => (
                      <SelectItem key={d.code} value={d.code}>
                        {d.code} – {d.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="series">Σειρά</Label>
                <Input
                  id="series"
                  name="series"
                  defaultValue={expense?.series ?? ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="number">Αριθμός</Label>
                <Input
                  id="number"
                  name="number"
                  defaultValue={expense?.number ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issueDate">Ημερομηνία *</Label>
              <Input
                id="issueDate"
                name="issueDate"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">Προθεσμία πληρωμής</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={issueDate || undefined}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Περιγραφή</Label>
              <Input
                id="description"
                name="description"
                defaultValue={expense?.description ?? ""}
                placeholder="π.χ. Λογαριασμός ρεύματος Αυγούστου"
              />
            </div>
            <div className="grid gap-2">
              <Label>Ετικέτες</Label>
              <TagInput
                name="tags"
                defaultValue={parseTags(expense?.tags)}
                suggestions={extras?.tagSuggestions ?? []}
              />
            </div>
            {extras?.defs.length ? (
              <div className="sm:col-span-2">
                <CustomFieldInputs
                  defs={extras.defs}
                  defaultValues={parseCustomFieldValues(
                    expense?.customFieldsJson,
                  )}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm sm:col-span-2">
              <span>
                Ανάλυση γραμμών
                <span className="block text-xs text-muted-foreground">
                  Καταχώρηση ειδών/υπηρεσιών με ποσότητα και τιμή – τα σύνολα
                  υπολογίζονται αυτόματα.
                </span>
              </span>
              <Switch
                checked={withLines}
                onCheckedChange={(v) => {
                  setWithLines(v);
                  if (v && lines.length === 0) setLines([newLine(vatCategory)]);
                }}
              />
            </div>

            {withLines ? (
              <div className="grid gap-2 sm:col-span-2">
                <div className="hidden grid-cols-[1fr_70px_100px_120px_90px_32px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                  <span>Περιγραφή</span>
                  <span>Ποσ.</span>
                  <span>Τιμή μον.</span>
                  <span>ΦΠΑ</span>
                  <span className="text-right">Καθαρό</span>
                  <span />
                </div>
                {lines.map((l) => {
                  const t = lineTotals(l);
                  return (
                    <div
                      key={l.key}
                      className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_70px_100px_120px_90px_32px] sm:items-center sm:border-0 sm:p-0"
                    >
                      <div className="flex gap-1.5">
                        {productOptions.length > 0 ? (
                          <Select value={l.productId ?? FREE_LINE} onValueChange={(v) => pickLineProduct(l.key, v)}>
                            <SelectTrigger className="w-[130px] shrink-0 text-xs" aria-label="Είδος γραμμής">
                              <SelectValue placeholder="Είδος" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={FREE_LINE}>Ελεύθερη</SelectItem>
                              {productOptions.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {p.sku ? ` · ${p.sku}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                        <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="Περιγραφή είδους / υπηρεσίας" aria-label="Περιγραφή γραμμής" />
                      </div>
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        value={l.quantity}
                        onChange={(e) =>
                          updateLine(l.key, { quantity: e.target.value })
                        }
                        aria-label="Ποσότητα"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={l.unitPrice}
                        onChange={(e) =>
                          updateLine(l.key, { unitPrice: e.target.value })
                        }
                        placeholder="0,00"
                        aria-label="Τιμή μονάδας"
                      />
                      <Select
                        value={l.vatCategory}
                        onValueChange={(v) =>
                          updateLine(l.key, { vatCategory: v })
                        }
                      >
                        <SelectTrigger aria-label="ΦΠΑ γραμμής">
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
                      <div className="text-right text-sm tabular-nums">
                        {formatMoney(t.net)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((x) => x.key !== l.key),
                          )
                        }
                        aria-label="Αφαίρεση γραμμής"
                        disabled={lines.length === 1}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        newLine(
                          prev[prev.length - 1]?.vatCategory ?? vatCategory,
                        ),
                      ])
                    }
                  >
                    <Plus data-icon="inline-start" /> Γραμμή
                  </Button>
                    {hasStockLines && warehouseOptions.length > 1 ? (
                      <Select value={warehouseId} onValueChange={setWarehouseId}>
                        <SelectTrigger className="h-8 w-48 text-xs" aria-label="Αποθήκη παραλαβής">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouseOptions.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              Παραλαβή: {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : hasStockLines ? (
                      <span className="text-xs text-muted-foreground">Τα είδη με παρακολούθηση παραλαμβάνονται στην αποθήκη.</span>
                    ) : null}
                  </div>
                  <div className="text-right text-sm">
                    <span className="text-muted-foreground">Καθαρό</span>{" "}
                    <span className="tabular-nums font-medium">
                      {formatMoney(linesNet)}
                    </span>
                    <span className="ml-3 text-muted-foreground">ΦΠΑ</span>{" "}
                    <span className="tabular-nums font-medium">
                      {formatMoney(linesVat)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="netValue">Καθαρή αξία *</Label>
              <Input
                id="netValue"
                name="netValue"
                type="number"
                step="0.01"
                min={0}
                value={withLines ? String(linesNet) : net}
                readOnly={withLines}
                className={withLines ? "bg-muted" : undefined}
                onChange={(e) => {
                  setNet(e.target.value);
                  recalcVat(e.target.value, vatCategory);
                }}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>Κατηγορία ΦΠΑ</Label>
              <Select
                value={vatCategory}
                onValueChange={(v) => {
                  setVatCategory(v);
                  recalcVat(net, v);
                }}
                disabled={withLines}
              >
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
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vatAmount">ΦΠΑ</Label>
              <Input
                id="vatAmount"
                name="vatAmount"
                type="number"
                step="0.01"
                min={0}
                value={withLines ? String(linesVat) : vatAmount}
                readOnly={withLines}
                className={withLines ? "bg-muted" : undefined}
                onChange={(e) => setVatAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="withheldAmount">Παρακράτηση</Label>
              <Input
                id="withheldAmount"
                name="withheldAmount"
                type="number"
                step="0.01"
                min={0}
                defaultValue={expense?.withheldAmount ?? 0}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Σύνολο παραστατικού:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(round2(effectiveNet + effectiveVat))}
              </span>{" "}
              (πριν την παρακράτηση)
              {expense && expense.paidAmount > 0
                ? ` · πληρωμένα ${formatMoney(expense.paidAmount)}`
                : ""}
            </p>
            <div className="grid gap-2">
              <Label>Κατηγορία χαρακτηρισμού (ecls)</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CLASSIFICATION_CATEGORIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Τύπος Ε3</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CLASSIFICATION_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} – {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm sm:col-span-2">
              <span>
                Δικαίωμα έκπτωσης ΦΠΑ
                <span className="block text-xs text-muted-foreground">
                  Απενεργοποιήστε για δαπάνες χωρίς δικαίωμα έκπτωσης (π.χ.
                  φιλοξενία, ΙΧ).
                </span>
              </span>
              <Switch checked={deductible} onCheckedChange={setDeductible} />
            </label>
          </div>
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
