"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addCalendarDays } from "@/lib/invoice/totals";
import { ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, ScanBarcode, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchFxRateAction, saveInvoiceAction } from "@/app/actions/invoices";
import { lookupProductByCodeAction } from "@/app/actions/inventory";
import type { InvoicePayload } from "@/lib/invoice/schema";
import { invoicePayloadSchema } from "@/lib/invoice/schema";
import { FieldError } from "@/components/ui/field-error";
import { InvoiceConfirmation, issuanceNotice } from "./invoice-confirmation";
import type { Customer, Invoice, InvoiceLine, Organization, Product, Series, Warehouse } from "@/db/schema";
import { DOCUMENT_TYPES, PAYMENT_METHODS, CURRENCIES, MOVE_PURPOSES, getDocumentType } from "@/lib/greek/document-types";
import { VAT_CATEGORIES, VAT_EXEMPTION_REASONS } from "@/lib/greek/vat";
import {
  INCOME_CLASSIFICATION_CATEGORIES,
  INCOME_CLASSIFICATION_TYPES,
  MEASUREMENT_UNITS,
  STAMP_DUTY_CATEGORIES,
  WITHHOLDING_TAXES,
} from "@/lib/greek/classifications";
import { EXPENSE_CLASSIFICATION_CATEGORIES, EXPENSE_CLASSIFICATION_TYPES } from "@/lib/services/expense-labels";
import { computeInvoice, formatMoney } from "@/lib/invoice/totals";
import { Checkbox } from "@/components/ui/checkbox";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { TagInput } from "@/components/tags/tag-input";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { parseCustomFieldValues, parseTags, type CustomFieldDef, type CustomFieldValues } from "@/lib/services/custom-fields";
import type { MemberOption } from "@/lib/i18n/languages";
import { precheckMyData, rulesFor, sendsLineQuantity } from "@/lib/mydata/rules";

type LineState = InvoicePayload["lines"][number] & { key: string; expanded?: boolean };

/** Προσυμπλήρωση editor (π.χ. πιστωτικό από τιμολόγιο). */
export interface EditorPrefill {
  seriesId?: string;
  customerId?: string | null;
  correlatedInvoiceId?: string | null;
  notes?: string;
  currency?: string;
  exchangeRate?: number | null;
  lines?: InvoicePayload["lines"];
}

interface Props {
  initialDate: string;
  org: Organization;
  customers: Customer[];
  exposure?: Record<string, { outstanding: number; overdue: number; creditLimit: number }>;
  products: Product[];
  seriesList: Series[];
  correlatable: Invoice[];
  invoice?: Invoice & { lines: InvoiceLine[] };
  defaultCustomerId?: string;
  prefill?: EditorPrefill;
  /** Περιορισμός σε είδος παραστατικού (π.χ. μόνο προσφορές στη σελίδα /quotes). */
  onlyKind?: "invoice" | "quote" | "delivery";
  backHref?: string;
  /** Ετικέτες, custom πεδία, πωλητές και κανάλια (A11/A12). */
  extras?: { defs: CustomFieldDef[]; members: MemberOption[]; tagSuggestions: string[]; channels: string[]; warehouses?: Warehouse[] };
}

let keyCounter = 0;
const newKey = () => `l${Date.now()}-${keyCounter++}`;

function emptyLine(seriesType: string, key = newKey()): LineState {
  const dt = getDocumentType(seriesType);
  return {
    key,
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

type SeriesOption = Props["seriesList"][number];

/**
 * Προεπιλεγμένη σειρά για νέο παραστατικό: ποτέ πιστωτικό/έξοδο, και ανάλογα με τον πελάτη –
 * επιχείρηση (με ΑΦΜ) → τιμολόγιο (ΤΠΥ/ΤΠ), ιδιώτης → απόδειξη (ΑΠΥ/ΑΛΠ). Χωρίς πελάτη προτιμάται
 * σειρά τιμολογίου, ώστε ένας νέος χρήστης να μην εκδώσει κατά λάθος απόδειξη λιανικής σε επιχείρηση.
 */
function pickDefaultSeries(series: SeriesOption[], customer?: { kind: string; afm: string | null } | null) {
  const plain = series.filter((s) => {
    const dt = getDocumentType(s.invoiceType);
    return dt.kind === "invoice" && !dt.credit && dt.expenseSide !== true;
  });
  const wantRetail = !!customer && (customer.kind === "individual" || !customer.afm);
  return plain.find((s) => getDocumentType(s.invoiceType).retail === wantRetail) ?? plain[0] ?? series[0];
}

export function InvoiceEditor({ initialDate, org, customers, exposure, products, seriesList, correlatable, invoice, defaultCustomerId, prefill, onlyKind, backHref, extras }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const today = initialDate;

  const activeSeries = seriesList.filter((s) => (s.active || s.id === invoice?.seriesId) && (!onlyKind || getDocumentType(s.invoiceType).kind === onlyKind || s.id === invoice?.seriesId));
  const [seriesId, setSeriesId] = useState(
    invoice?.seriesId ?? prefill?.seriesId ?? (onlyKind ? activeSeries[0]?.id : pickDefaultSeries(activeSeries, customers.find((c) => c.id === defaultCustomerId))?.id) ?? "",
  );
  // Μέχρι ο χρήστης να επιλέξει σειρά ο ίδιος, η σειρά ακολουθεί τον τύπο πελάτη (επιχείρηση/ιδιώτης).
  const [seriesTouched, setSeriesTouched] = useState(!!(invoice || prefill?.seriesId || onlyKind));
  const series = activeSeries.find((s) => s.id === seriesId);
  const docType = series ? getDocumentType(series.invoiceType) : DOCUMENT_TYPES[0];
  const isQuote = docType.kind === "quote";
  const isDelivery = docType.kind === "delivery";
  const isExpenseSide = docType.expenseSide === true;
  const classificationCategories = isExpenseSide ? EXPENSE_CLASSIFICATION_CATEGORIES : INCOME_CLASSIFICATION_CATEGORIES;
  const classificationTypes = isExpenseSide ? EXPENSE_CLASSIFICATION_TYPES : INCOME_CLASSIFICATION_TYPES;
  const [selfPricing, setSelfPricing] = useState<boolean>(invoice?.selfPricing ?? false);

  const [customerId, setCustomerId] = useState<string>(invoice?.customerId ?? prefill?.customerId ?? defaultCustomerId ?? "");
  const customer = customers.find((c) => c.id === customerId);
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? today);
  const [dueDate, setDueDate] = useState(
    invoice?.dueDate ?? addCalendarDays(today, customer?.paymentTermsDays ?? org.defaultPaymentTermsDays),
  );
  const [paymentMethod, setPaymentMethod] = useState(String(invoice?.paymentMethod ?? (docType.retail ? 3 : 1)));
  const [currency, setCurrency] = useState(invoice?.currency ?? prefill?.currency ?? "EUR");
  const [exchangeRate, setExchangeRate] = useState<string>(invoice?.exchangeRate?.toString() ?? prefill?.exchangeRate?.toString() ?? "");
  const [fxInfo, setFxInfo] = useState<string | null>(null);
  const [fxPending, startFx] = useTransition();
  const loadFxRate = (cur: string, date: string) => {
    if (cur === "EUR") return;
    startFx(async () => {
      const res = await fetchFxRateAction(cur, date);
      if (res.ok) {
        setExchangeRate(String(res.rate));
        setFxInfo(`ΕΚΤ ${res.referenceDate}: 1 EUR = ${res.eurTo} ${cur}`);
      } else {
        setFxInfo(null);
        toast.warning(`Αυτόματη ισοτιμία: ${res.error} Συμπληρώστε την χειροκίνητα.`);
      }
    });
  };
  const changeCurrency = (cur: string) => {
    setCurrency(cur);
    setFxInfo(null);
    if (cur === "EUR") setExchangeRate("");
    else loadFxRate(cur, issueDate);
  };
  const [notes, setNotes] = useState(invoice?.notes ?? prefill?.notes ?? "");
  const [tags, setTags] = useState<string[]>(parseTags(invoice?.tags));
  const [customFields, setCustomFields] = useState<CustomFieldValues>(parseCustomFieldValues(invoice?.customFieldsJson));
  const [salespersonId, setSalespersonId] = useState<string>(invoice?.salespersonId ?? "auto");
  const [channel, setChannel] = useState<string>(invoice?.channel ?? "");
  const warehouses = extras?.warehouses ?? [];
  const [warehouseId, setWarehouseId] = useState<string>(invoice?.warehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? "");
  const [scanCode, setScanCode] = useState("");
  const [scanning, startScan] = useTransition();
  const defs = extras?.defs ?? [];
  const members = extras?.members ?? [];
  const channels = extras?.channels ?? [];
  const showDimensions = defs.length > 0 || members.length > 1 || channels.length > 0 || tags.length > 0 || (extras?.tagSuggestions.length ?? 0) > 0;
  const [correlatedInvoiceId, setCorrelatedInvoiceId] = useState(invoice?.correlatedInvoiceId ?? prefill?.correlatedInvoiceId ?? "");
  const [dispatchDate, setDispatchDate] = useState(invoice?.dispatchDate ?? today);
  const [vehicleNumber, setVehicleNumber] = useState(invoice?.vehicleNumber ?? "");
  const [movePurpose, setMovePurpose] = useState(String(invoice?.movePurpose ?? 1));
  const [deliveryAddress, setDeliveryAddress] = useState(invoice?.deliveryAddress ?? "");
  const [loadingAddress, setLoadingAddress] = useState(invoice?.loadingAddress ?? [org.address, org.postalCode, org.city].filter(Boolean).join(", "));
  const [lines, setLines] = useState<LineState[]>(() =>
    prefill?.lines?.length
      ? prefill.lines.map((l, i) => ({ ...l, key: `prefill-${i}` }))
      : invoice?.lines.map((l) => ({
      key: l.id,
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
    })) ?? [emptyLine(series?.invoiceType ?? "2.1", "initial-0")],
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmIssue, setConfirmIssue] = useState(false);
  // Guard υποβολής σε αργές συσκευές: τα κουμπιά ενεργοποιούνται μόνο μετά την ενυδάτωση (hydration).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const submittingRef = useRef(false);
  const submitDisabled = !hydrated || pending || !seriesId;
  const clearField = (field: string) => {
    if (!fieldErrors[field]) return;
    const next = Object.fromEntries(Object.entries(fieldErrors).filter(([key]) => key !== field));
    setFieldErrors(next);
    if (!Object.keys(next).length) setError(null);
  };
  const fieldProps = (field: string) => ({ "data-testid": `invoice-field-${field}`, "data-invoice-field": field, "aria-invalid": !!fieldErrors[field], "aria-describedby": fieldErrors[field] ? `invoice-error-${field}` : undefined });
  const fieldError = (field: string) => <FieldError id={`invoice-error-${field}`} message={fieldErrors[field]} />;
  const showErrors = (errors: Record<string, string>) => {
    setFieldErrors(errors);
    setError("Ελέγξτε τα επισημασμένα πεδία. Τα στοιχεία σας παραμένουν στη φόρμα.");
    setLines((previous) => previous.map((line, index) => Object.keys(errors).some((key) => key.startsWith(`lines.${index}.`)) ? { ...line, expanded: true } : line));
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-invoice-field="${Object.keys(errors)[0]}"]`);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    });
  };

  const totals = useMemo(() => {
    try {
      return computeInvoice(lines);
    } catch {
      return null;
    }
  }, [lines]);

  const onCustomerChange = (id: string) => {
    clearField("customerId");
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    const terms = c?.paymentTermsDays ?? org.defaultPaymentTermsDays;
    setDueDate(addCalendarDays(issueDate, terms));
    setCorrelatedInvoiceId("");
    if (!seriesTouched && c) {
      const suggested = pickDefaultSeries(activeSeries, c);
      if (suggested && suggested.id !== seriesId) applySeries(suggested.id);
    }
  };

  const onSeriesChange = (id: string) => {
    setSeriesTouched(true);
    applySeries(id);
  };

  const applySeries = (id: string) => {
    setSeriesId(id);
    const s = activeSeries.find((x) => x.id === id);
    if (!s) return;
    const dt = getDocumentType(s.invoiceType);
    if (dt.retail) setPaymentMethod("3");
    // Σε αλλαγή πλευράς (έσοδο ↔ έξοδο) οι χαρακτηρισμοί των ειδών δεν ισχύουν – επαναφορά στους προεπιλεγμένους του τύπου.
    const sideChanged = (dt.expenseSide === true) !== isExpenseSide;
    const rules = rulesFor(dt.code);
    // Προτεινόμενη αιτία εξαίρεσης ΦΠΑ ανά τύπο: ενδοκοινοτικές παραδόσεις → άρθρο 28 (14), ενδοκοινοτική παροχή → άρθρο 14 (4),
    // εξαγωγές αγαθών → άρθρο 24 (8), παροχή σε τρίτες χώρες → άρθρο 14 (4).
    const exemption = dt.code === "1.2" ? 14 : dt.code === "1.3" ? 8 : dt.code === "2.2" || dt.code === "2.3" ? 4 : null;
    setLines((prev) =>
      prev.map((l) => {
        let next = l.productId && !sideChanged ? l : { ...l, classificationCategory: dt.defaultClassificationCategory, classificationType: dt.defaultClassificationType };
        if (rules.vat === "exempt" && next.vatCategory !== 7 && next.vatCategory !== 8) next = { ...next, vatCategory: 7, vatExemptionCategory: exemption };
        if (rules.vat === "none" && next.vatCategory !== 8) next = { ...next, vatCategory: 8, vatExemptionCategory: null };
        if (rules.allowedCategories.length && !rules.allowedCategories.includes(next.classificationCategory)) {
          next = { ...next, classificationCategory: dt.defaultClassificationCategory, classificationType: dt.defaultClassificationType };
        }
        return next;
      }),
    );
    if (!dt.requiresCorrelation) setCorrelatedInvoiceId("");
  };

  const updateLine = (key: string, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const applyProduct = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    updateLine(key, {
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

  /** Σάρωση barcode/SKU: αυξάνει ποσότητα υπάρχουσας γραμμής ή προσθέτει νέα με το είδος. */
  const scanProduct = () => {
    const code = scanCode.trim();
    if (!code) return;
    startScan(async () => {
      const res = await lookupProductByCodeAction(code);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const p = products.find((x) => x.id === res.productId);
      if (!p) return;
      setLines((prev) => {
        const existing = prev.find((l) => l.productId === p.id);
        if (existing) return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
        const fresh = {
          ...emptyLine(series?.invoiceType ?? "2.1"),
          productId: p.id,
          description: p.name,
          unitPrice: p.unitPrice,
          vatCategory: p.vatCategory,
          vatExemptionCategory: p.vatExemptionCategory,
          measurementUnit: p.measurementUnit,
          classificationCategory: p.classificationCategory,
          classificationType: p.classificationType,
        };
        const blank = prev.find((l) => !l.productId && !l.description.trim());
        return blank ? prev.map((l) => (l.key === blank.key ? { ...fresh, key: l.key } : l)) : [...prev, fresh];
      });
      setScanCode("");
      toast.success(`Προστέθηκε: ${res.name}`);
    });
  };

  const submit = (issueNow: boolean, confirmed = false) => {
    setError(null);
    const payload: InvoicePayload = {
      id: invoice?.id,
      customerId: docType.retail && !customerId ? null : customerId || null,
      seriesId,
      issueDate,
      dueDate: dueDate || null,
      currency,
      exchangeRate: currency === "EUR" ? null : Number(exchangeRate) || null,
      paymentMethod: Number(paymentMethod),
      notes,
      correlatedInvoiceId: correlatedInvoiceId || null,
      sourceQuoteId: invoice?.sourceQuoteId ?? null,
      dispatchDate: isDelivery ? dispatchDate || issueDate : null,
      vehicleNumber: isDelivery ? vehicleNumber : null,
      movePurpose: isDelivery ? Number(movePurpose) : null,
      deliveryAddress: isDelivery ? deliveryAddress : null,
      loadingAddress: isDelivery ? loadingAddress : null,
      selfPricing: !isQuote && !isDelivery ? selfPricing : false,
      tags,
      customFields,
      salespersonId: salespersonId === "auto" ? undefined : salespersonId === "none" ? null : salespersonId,
      channel,
      warehouseId: warehouseId || null,
      lines: lines.map((line) => ({
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        vatCategory: line.vatCategory,
        vatExemptionCategory: line.vatExemptionCategory,
        measurementUnit: line.measurementUnit,
        classificationCategory: line.classificationCategory,
        classificationType: line.classificationType,
        withholdingCategory: line.withholdingCategory,
        stampDutyCategory: line.stampDutyCategory,
      })),
      issueNow,
    };
    const checked = invoicePayloadSchema.safeParse(payload);
    const errors: Record<string, string> = checked.success ? {} : Object.fromEntries(checked.error.issues.map((issue) => [issue.path.join("."), issue.message]));
    if (!docType.retail && !customerId) errors.customerId = "Επιλέξτε πελάτη. Αν δεν υπάρχει, χρησιμοποιήστε τη «Δημιουργία νέου» παρακάτω.";
    if (docType.requiresCorrelation && !correlatedInvoiceId) errors.correlatedInvoiceId = "Επιλέξτε το αρχικό παραστατικό που πιστώνεται.";
    if (currency !== "EUR" && !(Number(exchangeRate) > 0)) errors.exchangeRate = "Συμπληρώστε θετική ισοτιμία προς EUR ή χρησιμοποιήστε το κουμπί ΕΚΤ.";
    lines.forEach((line, index) => {
      if (line.vatCategory === 7 && !line.vatExemptionCategory) errors[`lines.${index}.vatExemptionCategory`] = "Επιλέξτε το άρθρο απαλλαγής για ΦΠΑ 0%.";
    });
    if (issueNow && customerMissingAfm) errors.customerId = "Ο πελάτης δεν έχει ΑΦΜ. Ανοίξτε την επεξεργασία του παρακάτω για να το συμπληρώσετε.";
    if (Object.keys(errors).length) { showErrors(errors); return; }
    setFieldErrors({});
    if (issueNow && !confirmed) { setConfirmIssue(true); return; }
    setConfirmIssue(false);
    if (submittingRef.current) return;
    submittingRef.current = true;
    start(async () => {
      try {
        const res = await saveInvoiceAction(payload);
        if (res.ok) {
          toast.success(issueNow ? (isQuote ? "Η προσφορά εκδόθηκε." : "Το παραστατικό εκδόθηκε.") : "Το πρόχειρο αποθηκεύτηκε.");
          if (res.warning) toast.warning(res.warning);
          router.push(`/invoices/${res.id}`);
        } else {
          if (res.fieldErrors && Object.keys(res.fieldErrors).length) showErrors(res.fieldErrors);
          else setError(res.error);
          submittingRef.current = false;
        }
      } catch (e) {
        submittingRef.current = false;
        throw e;
      }
    });
  };

  const correlatableForCustomer = correlatable.filter((i) => !customerId || i.customerId === customerId);
  const customerMissingAfm = !docType.retail && !docType.counterpartOptionalAfm && customer && !customer.afm;
  // Ζωντανός προ-έλεγχος κανόνων ΑΑΔΕ ανά τύπο (χώρα πελάτη, ΦΠΑ, χαρακτηρισμοί, συσχέτιση).
  const quantitySent = isQuote || sendsLineQuantity(docType.code, correlatedInvoiceId ? correlatable.find((i) => i.id === correlatedInvoiceId)?.invoiceType : null);
  const precheckIssues = (() => {
    if (isQuote || !seriesId) return [];
    const original = correlatedInvoiceId ? correlatable.find((i) => i.id === correlatedInvoiceId) : null;
    return precheckMyData({
      invoice: {
        invoiceType: docType.code,
        customerAfm: customer?.afm ?? "",
        customerCountry: customer?.country ?? "GR",
        correlatedInvoiceId: correlatedInvoiceId || null,
        movePurpose: isDelivery ? Number(movePurpose) || null : null,
        paymentMethod: Number(paymentMethod),
      },
      lines: lines.map((l, i) => ({
        lineNumber: i + 1,
        vatCategory: l.vatCategory,
        vatExemptionCategory: l.vatExemptionCategory ?? null,
        vatAmount: 0,
        classificationCategory: l.classificationCategory,
        classificationType: l.classificationType,
      })),
      correlatedType: original?.invoiceType ?? null,
    }).filter((msg) => !(customerMissingAfm && msg.includes("απαιτεί αντισυμβαλλόμενο με ΑΦΜ")));
  })();
  const customerRequired = !docType.retail;

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[1fr_320px]" data-testid="invoice-editor" onInputCapture={(event) => { const field = (event.target as HTMLElement).dataset.invoiceField; if (field) clearField(field); }}>
      <InvoiceConfirmation open={confirmIssue} onOpenChange={setConfirmIssue} context={{ companyName: org.name, documentLabel: `${docType.short} · ${series?.code ?? "—"} · επόμενος αριθμός κατά την έκδοση`, customerName: customer?.name ?? "", total: totals ? formatMoney(totals.totalGrossValue, currency) : "—" }} title={isQuote ? "Έκδοση προσφοράς" : "Έκδοση παραστατικού"} description={issuanceNotice({ quote: isQuote, autoTransmit: org.autoTransmit, environment: org.mydataEnvironment, autoB2G: org.b2gEnabled && org.b2gAutoSend && !!customer?.publicEntity })} confirmLabel="Επιβεβαίωση έκδοσης" onConfirm={() => submit(true, true)} pending={pending} testId="editor-confirm-issue" />
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Στοιχεία παραστατικού</CardTitle>
            <CardDescription>
              {docType.name}
              {isQuote ? " – δεν διαβιβάζεται στο myDATA· μετατρέπεται σε τιμολόγιο μετά την αποδοχή." : ` (${docType.code}) – ο αριθμός αποδίδεται αυτόματα κατά την έκδοση.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 [&>div]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Σειρά / Τύπος</Label>
              <Select value={seriesId} onValueChange={onSeriesChange} disabled={!!invoice}>
                <SelectTrigger className="w-full min-w-0" {...fieldProps("seriesId")}>
                  <SelectValue placeholder="Επιλέξτε σειρά" />
                </SelectTrigger>
                <SelectContent>
                  {activeSeries.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} – {s.name} ({s.invoiceType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("seriesId")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="issueDate">Ημερομηνία έκδοσης</Label>
              <Input id="issueDate" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); clearField("issueDate"); }} {...fieldProps("issueDate")} />
              {fieldError("issueDate")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">{isQuote ? "Ισχύει έως" : "Προθεσμία πληρωμής"}</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); clearField("dueDate"); }} {...fieldProps("dueDate")} />
              {fieldError("dueDate")}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>
                {isExpenseSide ? "Αντισυμβαλλόμενος (προμηθευτής/εκδότης)" : "Πελάτης"} {customerRequired ? "*" : "(προαιρετικό για λιανική)"}
              </Label>
              <Select value={customerId} onValueChange={onCustomerChange}>
                <SelectTrigger className="w-full min-w-0" {...fieldProps("customerId")}>
                  <SelectValue placeholder={docType.retail ? "Λιανική – χωρίς πελάτη" : "Επιλέξτε πελάτη"} />
                </SelectTrigger>
                <SelectContent>
                  {customers
                    // Πελάτες χωρίς ΑΦΜ εμφανίζονται πάντα: η σειρά αλλάζει αυτόματα σε απόδειξη, αλλιώς προειδοποιούμε παρακάτω.
                    .filter((c) => docType.retail || docType.counterpartOptionalAfm || c.afm || !seriesTouched)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.afm ? ` · ${c.afm}` : " · χωρίς ΑΦΜ (ιδιώτης)"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {fieldError("customerId")}
              {customer ? (
                <p className="text-xs text-muted-foreground">
                  {customer.afm ? `ΑΦΜ ${customer.afm}` : "Χωρίς ΑΦΜ"}
                  {customer.doy ? ` · ΔΟΥ ${customer.doy}` : ""}
                  {customer.country !== "GR" ? ` · ${customer.country}` : ""} ·{" "}
                  <Link href={`/customers/${customer.id}/edit`} className="underline">
                    επεξεργασία
                  </Link>
                  {(() => {
                    const ex = exposure?.[customer.id];
                    if (!ex || ex.creditLimit <= 0) return null;
                    const over = ex.outstanding > ex.creditLimit;
                    return (
                      <span className={over ? "ml-1 font-medium text-destructive" : "ml-1"} data-testid="editor-credit-warning">
                        {over
                          ? ` · Υπέρβαση πιστωτικού ορίου: ανοιχτό υπόλοιπο ${formatMoney(ex.outstanding)} έναντι ορίου ${formatMoney(ex.creditLimit)}`
                          : ` · Διαθέσιμο πιστωτικό όριο ${formatMoney(ex.creditLimit - ex.outstanding)}`}
                      </span>
                    );
                  })()}
                </p>
              ) : (                <p className="text-xs text-muted-foreground">
                  Δεν βρίσκετε τον πελάτη;{" "}
                  <Link href="/customers/new" className="underline">
                    Δημιουργία νέου
                  </Link>
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Τρόπος πληρωμής</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="w-full min-w-0">
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
              <Label>Νόμισμα</Label>
              <div className="flex gap-2">
                <Select value={currency} onValueChange={changeCurrency}>
                  <SelectTrigger className={currency === "EUR" ? "" : "w-24 shrink-0"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currency !== "EUR" ? (
                  <>
                    <Input
                      type="number"
                      step="0.000001"
                      min={0}
                      value={exchangeRate}
                      onChange={(e) => {
                        setExchangeRate(e.target.value);
                        setFxInfo(null);
                      }}
                      placeholder="Ισοτιμία → EUR"
                      aria-label="Ισοτιμία"
                      {...fieldProps("exchangeRate")}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => loadFxRate(currency, issueDate)} disabled={fxPending} aria-label="Ισοτιμία ΕΚΤ" title="Λήψη ισοτιμίας ΕΚΤ για την ημερομηνία έκδοσης">
                      {fxPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    </Button>
                  </>
                ) : null}
              </div>
              {fieldError("exchangeRate")}
              {currency !== "EUR" ? <p className="text-xs text-muted-foreground">{fxInfo ?? "1 μονάδα νομίσματος σε EUR. Χρησιμοποιήστε το κουμπί για την επίσημη ισοτιμία ΕΚΤ."}</p> : null}
            </div>

            {!isQuote && !isDelivery ? (
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
                <Checkbox id="selfPricing" checked={selfPricing} onCheckedChange={(v) => setSelfPricing(v === true)} />
                <Label htmlFor="selfPricing" className="text-sm font-normal">
                  Αυτοτιμολόγηση (selfPricing) – το παραστατικό εκδίδεται από τον λήπτη για λογαριασμό του εκδότη
                </Label>
              </div>
            ) : null}

            {isDelivery ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="dispatchDate">Ημ/νία διακίνησης</Label>
                  <Input id="dispatchDate" type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Σκοπός διακίνησης *</Label>
                  <Select value={movePurpose} onValueChange={setMovePurpose}>
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOVE_PURPOSES.map((m) => (
                        <SelectItem key={m.code} value={String(m.code)}>
                          {m.code}. {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vehicleNumber">Αρ. οχήματος</Label>
                  <Input id="vehicleNumber" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="π.χ. ΙΚΧ-1234" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="loadingAddress">Τόπος φόρτωσης</Label>
                  <Input id="loadingAddress" value={loadingAddress} onChange={(e) => setLoadingAddress(e.target.value)} />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="deliveryAddress">Τόπος παράδοσης</Label>
                  <Input id="deliveryAddress" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={customer?.address ? [customer.address, customer.postalCode, customer.city].filter(Boolean).join(", ") : "Διεύθυνση παράδοσης"} />
                </div>
              </>
            ) : null}

            {docType.requiresCorrelation ? (
              <div className="grid gap-2 sm:col-span-2 lg:col-span-4">
                <Label>Συσχετιζόμενο (αρχικό) παραστατικό *</Label>
                {fieldError("correlatedInvoiceId")}
                <Select value={correlatedInvoiceId} onValueChange={(value) => { setCorrelatedInvoiceId(value); clearField("correlatedInvoiceId"); }}>
                  <SelectTrigger className="w-full min-w-0" {...fieldProps("correlatedInvoiceId")}>
                    <SelectValue placeholder="Επιλέξτε το παραστατικό που πιστώνεται" />
                  </SelectTrigger>
                  <SelectContent>
                    {correlatableForCustomer.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">Δεν υπάρχουν διαβιβασμένα παραστατικά για συσχέτιση.</div>
                    ) : (
                      correlatableForCustomer.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {invoiceDisplayNumber(i)} · {i.customerName} · {formatMoney(i.totalGrossValue)} · MARK {i.mydataMark}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {customerMissingAfm ? (
          <Alert variant="destructive">
            <AlertTitle>Ο πελάτης δεν έχει ΑΦΜ</AlertTitle>
            <AlertDescription>Για παραστατικά χονδρικής (Τιμολόγια) απαιτείται ΑΦΜ λήπτη για τη διαβίβαση στο myDATA.</AlertDescription>
          </Alert>
        ) : null}
        {precheckIssues.length ? (
          <Alert variant="destructive">
            <AlertTitle>Κανόνες myDATA για {docType.short} ({docType.code})</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {precheckIssues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Γραμμές</CardTitle>
            <CardDescription>
              Επιλέξτε είδος για αυτόματη συμπλήρωση ή γράψτε ελεύθερη περιγραφή. Ανοίξτε τις «λεπτομέρειες» για χαρακτηρισμούς & παρακρατήσεις.
              {!quantitySent ? (
                <>
                  {" "}
                  Για {docType.short} το myDATA δεν δέχεται ποσότητα/μονάδα μέτρησης (κανόνας ΑΑΔΕ 205): η ποσότητα εμφανίζεται μόνο στο PDF και στην ΑΑΔΕ διαβιβάζεται η καθαρή αξία κάθε γραμμής.
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden grid-cols-[1fr_80px_110px_80px_110px_40px] gap-2 px-1 text-xs font-medium text-muted-foreground lg:grid">
              <span>Περιγραφή</span>
              <span className="text-right">Ποσ.</span>
              <span className="text-right">Τιμή μον.</span>
              <span className="text-right">Έκπτ. %</span>
              <span>ΦΠΑ</span>
              <span />
            </div>
            {lines.map((line, idx) => {
              const lt = totals?.lines[idx];
              return (
                <div key={line.key} className="rounded-lg border p-3">
                  <div className="grid min-w-0 gap-2 lg:grid-cols-[1fr_80px_110px_80px_110px_40px]">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex min-w-0 gap-1.5">
                        <Select value={line.productId ?? "__free"} onValueChange={(v) => (v === "__free" ? updateLine(line.key, { productId: null }) : applyProduct(line.key, v))}>
                          <SelectTrigger className="w-[110px] shrink-0 text-xs sm:w-[150px]" aria-label="Είδος">
                            <SelectValue placeholder="Είδος" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__free">Ελεύθερη περιγραφή</SelectItem>
                            {products
                              .filter((p) => p.active)
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.key, { description: e.target.value })}
                          placeholder="Περιγραφή γραμμής"
                          aria-label="Περιγραφή"
                          {...fieldProps(`lines.${idx}.description`)}
                        />
                      </div>
                      {fieldError(`lines.${idx}.description`)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 lg:contents">
                      <div className="grid min-w-0 content-start gap-1">
                        <Label htmlFor={`qty-${line.key}`} className="text-xs text-muted-foreground lg:hidden">Ποσότητα</Label>
                        <Input id={`qty-${line.key}`} type="number" step="0.01" min={0} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })} className="text-right" aria-label="Ποσότητα" {...fieldProps(`lines.${idx}.quantity`)} />
                        {fieldError(`lines.${idx}.quantity`)}
                      </div>
                      <div className="grid min-w-0 content-start gap-1">
                        <Label htmlFor={`price-${line.key}`} className="text-xs text-muted-foreground lg:hidden">Τιμή μον. ({currency})</Label>
                        <Input id={`price-${line.key}`} type="number" step="0.01" min={0} value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })} className="text-right" aria-label="Τιμή μονάδας" {...fieldProps(`lines.${idx}.unitPrice`)} />
                        {fieldError(`lines.${idx}.unitPrice`)}
                      </div>
                      <div className="grid min-w-0 content-start gap-1">
                        <Label htmlFor={`disc-${line.key}`} className="text-xs text-muted-foreground lg:hidden">Έκπτωση %</Label>
                        <Input id={`disc-${line.key}`} type="number" step="0.01" min={0} max={100} value={line.discountPercent} onChange={(e) => updateLine(line.key, { discountPercent: Number(e.target.value) })} className="text-right" aria-label="Έκπτωση %" {...fieldProps(`lines.${idx}.discountPercent`)} />
                        {fieldError(`lines.${idx}.discountPercent`)}
                      </div>
                    </div>
                    <div className="grid gap-1 lg:contents">
                      <Label className="text-xs text-muted-foreground lg:hidden">ΦΠΑ</Label>
                      <div className="flex gap-2">
                      <Select value={String(line.vatCategory)} onValueChange={(v) => updateLine(line.key, { vatCategory: Number(v), vatExemptionCategory: Number(v) === 7 ? line.vatExemptionCategory : null })}>
                        <SelectTrigger className="flex-1" aria-label="ΦΠΑ">
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
                      <Button variant="ghost" size="icon" className="text-destructive lg:hidden" onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))} disabled={lines.length === 1} aria-label="Αφαίρεση">
                        <Trash2 />
                      </Button>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="hidden text-destructive lg:inline-flex" onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))} disabled={lines.length === 1} aria-label="Αφαίρεση">
                      <Trash2 />
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => updateLine(line.key, { expanded: !line.expanded })}>
                      {line.expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      Λεπτομέρειες myDATA {line.withholdingCategory ? "· παρακράτηση" : ""} {line.stampDutyCategory ? "· χαρτόσημο" : ""}
                      {line.vatCategory === 7 && !line.vatExemptionCategory ? <span className="text-destructive"> · απαιτείται αιτία εξαίρεσης</span> : null}
                    </button>
                    {lt ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium tabular-nums text-foreground lg:bg-transparent lg:px-0 lg:py-0 lg:text-xs lg:font-normal lg:text-muted-foreground">
                        Καθαρό {formatMoney(lt.netValue, currency)} · ΦΠΑ {formatMoney(lt.vatAmount, currency)}
                        {lt.withheldAmount ? ` · Παρακρ. -${formatMoney(lt.withheldAmount, currency)}` : ""}
                      </span>
                    ) : null}
                  </div>

                  {line.expanded ? (
                    <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Μονάδα μέτρησης</Label>
                        <Select value={String(line.measurementUnit)} onValueChange={(v) => updateLine(line.key, { measurementUnit: Number(v) })}>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MEASUREMENT_UNITS.map((u) => (
                              <SelectItem key={u.code} value={String(u.code)}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Κατηγορία χαρακτηρισμού</Label>
                        <Select value={line.classificationCategory} onValueChange={(v) => updateLine(line.key, { classificationCategory: v })}>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {classificationCategories.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Τύπος χαρακτηρισμού (Ε3)</Label>
                        <Select value={line.classificationType} onValueChange={(v) => updateLine(line.key, { classificationType: v })}>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {classificationTypes.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.code} – {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {line.vatCategory === 7 ? (
                        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
                          <Label className="text-xs">Αιτία εξαίρεσης ΦΠΑ *</Label>
                          {fieldError(`lines.${idx}.vatExemptionCategory`)}
                          <Select value={line.vatExemptionCategory ? String(line.vatExemptionCategory) : ""} onValueChange={(v) => updateLine(line.key, { vatExemptionCategory: Number(v) })}>
                            <SelectTrigger className="w-full min-w-0" {...fieldProps(`lines.${idx}.vatExemptionCategory`)}>
                              <SelectValue placeholder="Επιλέξτε άρθρο απαλλαγής" />
                            </SelectTrigger>
                            <SelectContent>
                              {VAT_EXEMPTION_REASONS.map((r) => (
                                <SelectItem key={r.code} value={String(r.code)}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label className="text-xs">Παρακράτηση φόρου</Label>
                        <Select value={String(line.withholdingCategory)} onValueChange={(v) => updateLine(line.key, { withholdingCategory: Number(v) })}>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WITHHOLDING_TAXES.filter((w) => w.rate !== null).map((w) => (
                              <SelectItem key={w.code} value={String(w.code)}>
                                {w.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Χαρτόσημο</Label>
                        <Select value={String(line.stampDutyCategory)} onValueChange={(v) => updateLine(line.key, { stampDutyCategory: Number(v) })}>
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAMP_DUTY_CATEGORIES.map((s) => (
                              <SelectItem key={s.code} value={String(s.code)}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine(series?.invoiceType ?? "2.1")])}>
                <Plus data-icon="inline-start" /> Προσθήκη γραμμής
              </Button>
              {products.length > 0 ? (
                <div className="relative">
                  <ScanBarcode className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        scanProduct();
                      }
                    }}
                    placeholder="Σάρωση barcode / SKU"
                    aria-label="Σάρωση barcode ή SKU"
                    className="h-8 w-56 pl-8 text-xs"
                    disabled={scanning}
                  />
                </div>
              ) : null}
              {warehouses.length > 1 && !isQuote ? (
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="h-8 w-52 text-xs" aria-label="Αποθήκη">
                    <SelectValue placeholder="Αποθήκη" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        Αποθήκη: {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Παρατηρήσεις</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Εμφανίζονται στο παραστατικό (π.χ. όροι πληρωμής, αναφορά σε σύμβαση, άρθρο απαλλαγής ΦΠΑ)." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ετικέτες, πεδία & διαστάσεις</CardTitle>
            <CardDescription>
              Για αναφορές πωλήσεων ανά πωλητή/κανάλι και ομαδοποίηση. {showDimensions ? "" : "Ορίστε custom πεδία και κανάλια στις Ρυθμίσεις → Πεδία & κανάλια."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 [&>div]:min-w-0 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Ετικέτες</Label>
              <TagInput value={tags} onChange={setTags} suggestions={extras?.tagSuggestions ?? []} />
            </div>
            <div className="grid gap-2">
              <Label>Πωλητής</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Αυτόματα (από τον πελάτη)</SelectItem>
                  <SelectItem value="none">— Κανείς —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Κανάλι πώλησης</Label>
              {channels.length ? (
                <Select value={channel || "none"} onValueChange={(v) => setChannel(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Χωρίς κανάλι —</SelectItem>
                    {channels.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                    {channel && !channels.includes(channel) ? <SelectItem value={channel}>{channel}</SelectItem> : null}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="π.χ. e-shop, Κατάστημα, Τηλέφωνο" maxLength={60} />
              )}
            </div>
            {defs.length ? (
              <div className="sm:col-span-2">
                <CustomFieldInputs defs={defs} values={customFields} onChange={setCustomFields} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 xl:sticky xl:top-36 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Σύνολα</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Καθαρή αξία" value={totals ? formatMoney(totals.totalNetValue, currency) : "—"} />
            {totals?.vatBreakdown.map((b) => (
              <Row key={b.rate} label={`ΦΠΑ ${b.rate}%`} value={formatMoney(b.vatAmount, currency)} muted />
            ))}
            <Row label="Σύνολο ΦΠΑ" value={totals ? formatMoney(totals.totalVatAmount, currency) : "—"} />
            {totals && totals.totalStampDutyAmount > 0 ? <Row label="Χαρτόσημο" value={formatMoney(totals.totalStampDutyAmount, currency)} /> : null}
            {totals && totals.totalWithheldAmount > 0 ? <Row label="Παρακράτηση φόρου" value={`- ${formatMoney(totals.totalWithheldAmount, currency)}`} /> : null}
            <Separator />
            <Row label="Πληρωτέο" value={totals ? formatMoney(totals.totalGrossValue, currency) : "—"} strong />
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive" data-testid="invoice-error-summary">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button onClick={() => submit(true)} disabled={submitDisabled} size="lg" data-testid="invoice-editor-issue">
            {pending || !hydrated ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            {!hydrated ? "Προετοιμασία…" : isQuote ? "Έκδοση προσφοράς" : "Έκδοση παραστατικού"}
          </Button>
          <Button onClick={() => submit(false)} disabled={submitDisabled} variant="outline" data-testid="invoice-editor-save-draft">
            <Save data-icon="inline-start" /> Αποθήκευση ως πρόχειρο
          </Button>
          <Button asChild variant="ghost">
            <Link href={backHref ?? (invoice ? `/invoices/${invoice.id}` : isQuote ? "/quotes" : "/invoices")}>Άκυρο</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Με την έκδοση αποδίδεται ο επόμενος αριθμός της σειράς «{series?.code ?? "—"}» και το παραστατικό κλειδώνει.{" "}
          {isQuote ? "Οι προσφορές δεν διαβιβάζονται στο myDATA." : org.autoTransmit ? "Η διαβίβαση στο myDATA γίνεται αυτόματα με την έκδοση." : "Η διαβίβαση στο myDATA γίνεται από τη σελίδα του παραστατικού."}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", muted ? "text-xs text-muted-foreground" : "", strong ? "text-base font-semibold" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
