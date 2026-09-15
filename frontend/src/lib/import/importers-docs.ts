import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { customers, expenses as expensesTable, products, series as seriesTable, suppliers } from "@/db/schema";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import { getDocumentType } from "@/lib/greek/document-types";
import { saveDraft, issueInvoice } from "@/lib/services/invoices";
import { saveExpense } from "@/lib/services/expenses";
import { saveSupplier } from "@/lib/services/suppliers";
import { parseCsv, parseNumber, pick } from "./csv";
import type { ImportResult } from "./importers";

const VAT_BY_RATE: Record<number, number> = { 24: 1, 13: 2, 6: 3, 17: 4, 9: 5, 4: 6, 0: 7 };

const A_DOC = ["Παραστατικό", "document", "doc", "Αρ. παραστατικού", "invoice", "Αριθμός"];
const A_SERIES = ["Σειρά", "series", "Σειρά παραστατικού", "seriesCode"];
const A_DATE = ["Ημερομηνία", "date", "issueDate", "Ημ. έκδοσης", "Ημερομηνία έκδοσης"];
const A_DUE = ["Λήξη", "dueDate", "Προθεσμία", "Ημ. λήξης"];
const A_CUST = ["Πελάτης", "customer", "Επωνυμία", "name", "Πελάτης/Επωνυμία"];
const A_AFM = ["ΑΦΜ", "afm", "vat", "ΑΦΜ πελάτη"];
const A_PAY = ["Τρόπος πληρωμής", "paymentMethod", "payment", "Πληρωμή"];
const A_DESC = ["Περιγραφή", "description", "Είδος", "item", "Αιτιολογία"];
const A_QTY = ["Ποσότητα", "quantity", "qty", "Ποσ."];
const A_PRICE = ["Τιμή", "unitPrice", "price", "Τιμή μονάδας"];
const A_DISC = ["Έκπτωση", "discount", "discountPercent", "Έκπτωση %"];
const A_VAT = ["ΦΠΑ", "vat", "vatRate", "ΦΠΑ %", "Συντελεστής ΦΠΑ"];
const A_SKU = ["Κωδικός", "sku", "code", "Κωδικός είδους"];
const A_NOTES = ["Σημειώσεις", "notes", "Παρατηρήσεις"];

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Δέχεται 2026-03-15, 15/03/2026, 15-03-2026, 15.3.2026. */
function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (dateRe.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function vatCategoryFrom(raw: string, fallback = 1): number | null {
  if (!raw) return fallback;
  const n = parseNumber(raw.replace("%", ""));
  if (n === null) return null;
  return VAT_BY_RATE[Math.round(n)] ?? null;
}

const PAYMENT_ALIASES: [RegExp, number][] = [
  [/μετρητ|cash/i, 3],
  [/κάρτ|card|pos/i, 7],
  [/iris/i, 8],
  [/επιταγ|cheque|check/i, 5],
  [/πίστωσ|credit|επί πιστώσει/i, 5],
  [/paypal|web|ηλεκτρον/i, 6],
  [/τράπεζ|bank|έμβασμ|κατάθεσ|iban/i, 1],
];

function paymentMethodFrom(raw: string): number {
  if (!raw) return 1;
  const n = parseNumber(raw);
  if (n !== null && Number.isInteger(n) && n >= 1 && n <= 8) return n;
  return PAYMENT_ALIASES.find(([re]) => re.test(raw))?.[1] ?? 1;
}

export const INVOICE_COLUMNS_HELP =
  "Παραστατικό (ομαδοποίηση γραμμών), Σειρά, Ημερομηνία, Λήξη, Πελάτης, ΑΦΜ, Τρόπος πληρωμής, Περιγραφή *, Ποσότητα *, Τιμή *, Έκπτωση %, ΦΠΑ %, Κωδικός είδους, Σημειώσεις";

export interface InvoiceImportOptions {
  /** Κωδικός σειράς που χρησιμοποιείται όταν η στήλη «Σειρά» λείπει. */
  defaultSeriesCode: string;
  /** true = τα παραστατικά εκδίδονται (παίρνουν αριθμό), false = μένουν πρόχειρα. */
  issue: boolean;
  /** Δημιουργία πελάτη όταν δεν βρεθεί στο πελατολόγιο. */
  createMissingCustomers: boolean;
}

/** Elorus-style «πλατύ» export: μία γραμμή ανά παραστατικό με στήλες «Γραμμή N - …» → κανονικές γραμμές. */
export function normalizeWideInvoiceCsv(csvText: string): string | null {
  const { headers, rows } = parseCsv(csvText);
  if (!headers.some((h) => /^Γραμμή\s*1\s*-\s*Τίτλος$/i.test(h.trim()))) return null;
  const maxLine = headers.reduce((m, h) => {
    const mm = h.trim().match(/^Γραμμή\s*(\d+)\s*-/i);
    return mm ? Math.max(m, Number(mm[1])) : m;
  }, 0);

  const out: string[] = ["Παραστατικό;Σειρά;Ημερομηνία;Λήξη;Πελάτης;ΑΦΜ;Τρόπος πληρωμής;Τύπος παραστατικού;Περιγραφή;Ποσότητα;Τιμή;Έκπτωση;ΦΠΑ;Σημειώσεις"];
  const esc = (v: string) => (v.includes(";") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);

  for (const r of rows) {
    const number = pick(r, ["Αριθμός", "number"]);
    const seriesCode = pick(r, ["Σειρά", "series"]);
    const date = pick(r, ["Ημερομηνία", "date"]);
    const creditDays = parseNumber(pick(r, ["Ημέρες πίστωσης", "paymentTermsDays"])) ?? 0;
    let due = "";
    if (creditDays > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + creditDays);
      due = d.toISOString().slice(0, 10);
    }
    const customer = pick(r, ["Πλήρες όνομα πελάτη", "Επωνυμία πελάτη", "Πελάτης"]);
    const afm = pick(r, ["ΑΦΜ πελάτη", "ΑΦΜ"]);
    const payment = pick(r, ["Τρόπος πληρωμής"]);
    const docType = pick(r, ["Τύπος παραστατικού myDATA", "Τύπος παραστατικού"]);
    const notes = pick(r, ["Δημόσιες σημειώσεις", "Σημειώσεις"]);

    for (let n = 1; n <= maxLine; n++) {
      const g = (suffix: string) => (r[`Γραμμή ${n} - ${suffix}`] ?? "").trim();
      const title = g("Τίτλος");
      const desc = g("Περιγραφή");
      const description = [title, desc && desc !== title ? desc : ""].filter(Boolean).join(" – ");
      if (!description) continue;
      const net = parseNumber(g("Τιμή μονάδας (καθαρή)"));
      const gross = parseNumber(g("Τιμή μονάδας (μικτή)"));
      if (net === null && gross === null) continue;
      const price = net ?? gross ?? 0;
      const vatRate = net && gross && net > 0 ? Math.round((gross / net - 1) * 100) : 24;
      const qty = g("Ποσότητα") || "1";
      const discount = parseNumber(g("Ποσοστό έκπτωσης"));
      out.push(
        [number || `${seriesCode}-${date}`, seriesCode, date, due, customer, afm, payment, docType, description, qty, String(price), discount ? String(discount) : "0", String(vatRate), n === 1 ? notes : ""]
          .map((v) => esc(String(v ?? "")))
          .join(";"),
      );
    }
  }
  return out.length > 1 ? "\uFEFF" + out.join("\r\n") : null;
}

/** Εισαγωγή παραστατικών από CSV: μία γραμμή ανά είδος, ομαδοποίηση με τη στήλη «Παραστατικό». */
export async function importInvoices(db: Db, org: Organization, csvText: string, opts: InvoiceImportOptions): Promise<ImportResult> {
  const normalized = normalizeWideInvoiceCsv(csvText);
  const { rows } = parseCsv(normalized ?? csvText);
  const result: ImportResult = { total: 0, created: 0, updated: 0, skipped: 0, errors: [], refs: [] };
  if (rows.length === 0) return result;

  const seriesRows = await db.select().from(seriesTable).where(and(eq(seriesTable.orgId, org.id), eq(seriesTable.active, true)));
  const seriesByCode = new Map(seriesRows.map((s) => [s.code.trim().toLowerCase(), s]));
  const seriesByType = new Map(seriesRows.map((s) => [s.invoiceType, s]));
  const custRows = await db.select({ id: customers.id, afm: customers.afm, name: customers.name }).from(customers).where(eq(customers.orgId, org.id));
  const custByAfm = new Map(custRows.filter((c) => c.afm).map((c) => [c.afm!, c.id]));
  const custByName = new Map(custRows.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const productRows = await db.select({ id: products.id, sku: products.sku, name: products.name, classificationCategory: products.classificationCategory, classificationType: products.classificationType, measurementUnit: products.measurementUnit }).from(products).where(eq(products.orgId, org.id));
  const prodBySku = new Map(productRows.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
  const prodByName = new Map(productRows.map((p) => [p.name.trim().toLowerCase(), p]));

  // ομαδοποίηση γραμμών σε παραστατικά
  type Group = { key: string; firstRow: number; head: Record<string, string>; lines: { row: number; r: Record<string, string> }[] };
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 2;
    const docKey = pick(r, A_DOC) || `${pick(r, A_SERIES)}|${pick(r, A_DATE)}|${pick(r, A_AFM) || pick(r, A_CUST)}|${row}`;
    let g = byKey.get(docKey);
    if (!g) {
      g = { key: docKey, firstRow: row, head: r, lines: [] };
      byKey.set(docKey, g);
      groups.push(g);
    }
    g.lines.push({ row, r });
  }
  result.total = groups.length;

  for (const g of groups) {
    const row = g.firstRow;
    const explicitSeries = pick(g.head, A_SERIES).trim().toLowerCase();
    const docTypeCode = pick(g.head, ["Τύπος παραστατικού myDATA", "Τύπος παραστατικού", "invoiceType"]).trim();
    const ser =
      (explicitSeries ? seriesByCode.get(explicitSeries) : undefined) ??
      (docTypeCode ? seriesByType.get(docTypeCode) : undefined) ??
      (opts.defaultSeriesCode ? seriesByCode.get(opts.defaultSeriesCode.trim().toLowerCase()) : undefined);
    if (!ser) {
      result.errors.push({ row, message: `Δεν βρέθηκε σειρά για «${pick(g.head, A_SERIES) || docTypeCode || opts.defaultSeriesCode || "—"}» – δημιουργήστε τη στις Ρυθμίσεις → Σειρές.` });
      continue;
    }
    const docType = getDocumentType(ser.invoiceType);
    if (docType.credit || docType.expenseSide) {
      result.errors.push({ row, message: `Η σειρά «${ser.code}» (${ser.invoiceType}) δεν υποστηρίζεται στην εισαγωγή – πιστωτικά και παραστατικά εξόδων καταχωρούνται χειροκίνητα.` });
      continue;
    }
    const issueDate = parseDate(pick(g.head, A_DATE)) ?? new Date().toISOString().slice(0, 10);
    const dueDate = parseDate(pick(g.head, A_DUE));

    let customerId: string | null = null;
    const custName = pick(g.head, A_CUST);
    let afm = pick(g.head, A_AFM);
    if (afm) {
      afm = normalizeAfm(afm);
      customerId = custByAfm.get(afm) ?? null;
    }
    if (!customerId && custName) customerId = custByName.get(custName.trim().toLowerCase()) ?? null;
    if (!customerId && !docType.retail) {
      if (!custName) {
        result.errors.push({ row, message: "Λείπει ο πελάτης (υποχρεωτικός για παραστατικά χονδρικής)." });
        continue;
      }
      if (!opts.createMissingCustomers) {
        result.errors.push({ row, message: `Ο πελάτης «${custName}» δεν βρέθηκε στο πελατολόγιο.` });
        continue;
      }
      if (afm && !isValidAfm(afm)) {
        // Ξένα ή ελλιπή ΑΦΜ (π.χ. Κύπρος) δεν μπλοκάρουν την εισαγωγή: ο πελάτης δημιουργείται χωρίς ΑΦΜ.
        result.errors.push({ row, message: `Προσοχή: το ΑΦΜ «${afm}» του «${custName}» δεν είναι έγκυρο ελληνικό – ο πελάτης δημιουργήθηκε χωρίς ΑΦΜ, συμπληρώστε το στην καρτέλα του.` });
        afm = "";
      }
      const id = randomUUID();
      await db.insert(customers).values({ id, orgId: org.id, kind: afm ? "company" : "individual", name: custName, afm, stage: "customer", createdAt: new Date().toISOString() });
      result.refs!.push({ t: "customer", id });
      if (afm) custByAfm.set(afm, id);
      custByName.set(custName.trim().toLowerCase(), id);
      customerId = id;
    }

    const lines = [];
    let lineError: string | null = null;
    for (const { row: lr, r } of g.lines) {
      const description = pick(r, A_DESC);
      const qty = parseNumber(pick(r, A_QTY)) ?? 1;
      const price = parseNumber(pick(r, A_PRICE));
      if (!description) {
        lineError = `Γραμμή ${lr}: λείπει η περιγραφή είδους.`;
        break;
      }
      if (price === null) {
        lineError = `Γραμμή ${lr}: λείπει ή είναι άκυρη η τιμή μονάδας.`;
        break;
      }
      const vatCategory = vatCategoryFrom(pick(r, A_VAT), 1);
      if (!vatCategory) {
        lineError = `Γραμμή ${lr}: άγνωστος συντελεστής ΦΠΑ «${pick(r, A_VAT)}».`;
        break;
      }
      const sku = pick(r, A_SKU);
      const prod = (sku && prodBySku.get(sku.toLowerCase())) || prodByName.get(description.trim().toLowerCase());
      lines.push({
        productId: prod?.id ?? null,
        description,
        quantity: qty,
        unitPrice: price,
        discountPercent: parseNumber(pick(r, A_DISC)) ?? 0,
        vatCategory,
        vatExemptionCategory: vatCategory === 7 ? 15 : null,
        measurementUnit: prod?.measurementUnit ?? 1,
        classificationCategory: prod?.classificationCategory || "category1_3",
        classificationType: prod?.classificationType || "E3_561_001",
        withholdingCategory: 0,
        stampDutyCategory: 0,
      });
    }
    if (lineError) {
      result.errors.push({ row, message: lineError });
      continue;
    }

    try {
      const id = await saveDraft(db, org, {
        customerId,
        seriesId: ser.id,
        issueDate,
        dueDate,
        currency: "EUR",
        paymentMethod: paymentMethodFrom(pick(g.head, A_PAY)),
        notes: pick(g.head, A_NOTES),
        correlatedInvoiceId: null,
        lines,
      });
      if (opts.issue) await issueInvoice(db, org, id);
      result.refs!.push({ t: "invoice", id });
      result.created++;
    } catch (e) {
      result.errors.push({ row, message: e instanceof Error ? e.message : "Η καταχώρηση απέτυχε." });
    }
  }
  return result;
}

export const EXPENSE_COLUMNS_HELP =
  "Προμηθευτής *, ΑΦΜ, Ημερομηνία *, Σειρά, Αριθμός, Περιγραφή, Καθαρή αξία *, ΦΠΑ % ή Ποσό ΦΠΑ, Παρακράτηση, Λήξη, ΜΑΡΚ, Χώρα, Τύπος παραστατικού";

/** Εισαγωγή τιμολογίων αγορών/εξόδων από CSV (μία γραμμή ανά παραστατικό). */
export async function importExpenses(db: Db, orgId: string, csvText: string, opts: { updateExisting: boolean }): Promise<ImportResult> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], refs: [] };
  if (rows.length === 0) return result;

  const supRows = await db.select({ id: suppliers.id, afm: suppliers.afm, name: suppliers.name, cat: suppliers.defaultClassificationCategory, type: suppliers.defaultClassificationType }).from(suppliers).where(eq(suppliers.orgId, orgId));
  const supByAfm = new Map(supRows.filter((s) => s.afm).map((s) => [s.afm, s]));
  const supByName = new Map(supRows.map((s) => [s.name.trim().toLowerCase(), s]));
  const existing = await db.select({ id: expensesTable.id, mark: expensesTable.mark, afm: expensesTable.supplierAfm, series: expensesTable.series, number: expensesTable.number }).from(expensesTable).where(eq(expensesTable.orgId, orgId));
  const keyOf = (afm: string, series: string, number: string) => `${afm}|${series}|${number}`.toLowerCase();
  const byMark = new Map(existing.filter((e) => e.mark).map((e) => [e.mark!, e.id]));
  const byKey = new Map(existing.filter((e) => e.number).map((e) => [keyOf(e.afm, e.series ?? "", e.number ?? ""), e.id]));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 2;
    const supplierName = pick(r, ["Προμηθευτής", "supplier", "supplierName", "Επωνυμία", "name"]);
    if (!supplierName) {
      result.errors.push({ row, message: "Λείπει η επωνυμία προμηθευτή." });
      continue;
    }
    const issueDate = parseDate(pick(r, A_DATE));
    if (!issueDate) {
      result.errors.push({ row, message: `Μη έγκυρη ημερομηνία «${pick(r, A_DATE)}» για «${supplierName}».` });
      continue;
    }
    const net = parseNumber(pick(r, ["Καθαρή αξία", "Καθαρό", "net", "netValue", "Αξία"]));
    if (net === null) {
      result.errors.push({ row, message: `Λείπει η καθαρή αξία για «${supplierName}».` });
      continue;
    }
    const country = (pick(r, ["Χώρα", "country"]) || "GR").toUpperCase().slice(0, 2);
    let afm = pick(r, A_AFM);
    if (afm && country === "GR") {
      afm = normalizeAfm(afm);
      if (!isValidAfm(afm)) {
        result.errors.push({ row, message: `Μη έγκυρο ΑΦΜ «${afm}» για «${supplierName}».` });
        continue;
      }
    }
    const vatAmountRaw = parseNumber(pick(r, ["Ποσό ΦΠΑ", "vatAmount", "ΦΠΑ ποσό"]));
    const vatCategory = vatCategoryFrom(pick(r, A_VAT), 1);
    if (!vatCategory) {
      result.errors.push({ row, message: `Άγνωστος συντελεστής ΦΠΑ «${pick(r, A_VAT)}» για «${supplierName}».` });
      continue;
    }
    const sup = (afm && supByAfm.get(afm)) || supByName.get(supplierName.trim().toLowerCase());
    const seriesVal = pick(r, A_SERIES);
    const numberVal = pick(r, ["Αριθμός", "number", "Αρ. παραστατικού", "invoiceNumber"]);
    const mark = pick(r, ["ΜΑΡΚ", "MARK", "mark"]);

    const input = {
      supplierName,
      supplierAfm: afm,
      supplierCountry: country,
      invoiceType: pick(r, ["Τύπος", "invoiceType", "Τύπος παραστατικού"]) || "1.1",
      series: seriesVal,
      number: numberVal,
      issueDate,
      description: pick(r, A_DESC),
      netValue: net,
      vatCategory,
      vatAmount: vatAmountRaw ?? 0,
      withheldAmount: parseNumber(pick(r, ["Παρακράτηση", "withheld", "withheldAmount"])) ?? 0,
      classificationCategory: pick(r, ["Κατηγορία χαρακτηρισμού", "classificationCategory"]) || sup?.cat || "",
      classificationType: pick(r, ["Τύπος χαρακτηρισμού", "classificationType"]) || sup?.type || "",
      vatDeductible: true,
      mark: mark || null,
      supplierId: sup?.id ?? null,
      dueDate: parseDate(pick(r, A_DUE)),
    };

    const existingId = (mark && byMark.get(mark)) || (numberVal ? byKey.get(keyOf(afm, seriesVal, numberVal)) : undefined);
    try {
      if (existingId) {
        if (!opts.updateExisting) {
          result.skipped++;
          continue;
        }
        await saveExpense(db, orgId, input, existingId);
        result.updated++;
      } else {
        const id = await saveExpense(db, orgId, input);
        if (mark) byMark.set(mark, id);
        if (numberVal) byKey.set(keyOf(afm, seriesVal, numberVal), id);
        result.refs!.push({ t: "expense", id });
        result.created++;
      }
    } catch (e) {
      result.errors.push({ row, message: e instanceof Error ? e.message : "Η καταχώρηση απέτυχε." });
    }
  }
  return result;
}

export const SUPPLIER_COLUMNS_HELP = "Επωνυμία *, ΑΦΜ, ΔΟΥ, Χώρα, Διεύθυνση, Πόλη, ΤΚ, Email, Τηλέφωνο, Υπεύθυνος, IBAN, Τράπεζα, Ημέρες πίστωσης, Σημειώσεις";

/** Εισαγωγή προμηθευτών από CSV. */
export async function importSuppliers(db: Db, orgId: string, csvText: string, opts: { updateExisting: boolean }): Promise<ImportResult> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], refs: [] };
  if (rows.length === 0) return result;
  const existing = await db.select({ id: suppliers.id, afm: suppliers.afm, name: suppliers.name }).from(suppliers).where(eq(suppliers.orgId, orgId));
  const byAfm = new Map(existing.filter((s) => s.afm).map((s) => [s.afm, s.id]));
  const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s.id]));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 2;
    const name = pick(r, ["Επωνυμία", "name", "Προμηθευτής", "supplier", "company"]);
    if (name.length < 2) {
      result.errors.push({ row, message: "Λείπει η επωνυμία." });
      continue;
    }
    const country = (pick(r, ["Χώρα", "country"]) || "GR").toUpperCase().slice(0, 2);
    let afm = pick(r, A_AFM);
    if (afm && country === "GR") {
      afm = normalizeAfm(afm);
      if (!isValidAfm(afm)) {
        result.errors.push({ row, message: `Μη έγκυρο ΑΦΜ «${afm}» (${name}).` });
        continue;
      }
    }
    const terms = parseNumber(pick(r, ["Ημέρες πίστωσης", "Όροι πληρωμής", "paymentTermsDays", "paymentTerms"]));
    const input = {
      name,
      afm,
      doy: pick(r, ["ΔΟΥ", "doy"]),
      country,
      address: pick(r, ["Διεύθυνση", "address", "Οδός"]),
      city: pick(r, ["Πόλη", "city"]),
      postalCode: pick(r, ["ΤΚ", "Τ.Κ.", "postalCode", "zip"]),
      email: pick(r, ["Email", "e-mail", "mail"]),
      phone: pick(r, ["Τηλέφωνο", "phone", "tel", "Κινητό"]),
      contactPerson: pick(r, ["Υπεύθυνος", "contact", "contactPerson"]),
      iban: pick(r, ["IBAN", "iban", "Λογαριασμός"]).replace(/\s/g, ""),
      bankName: pick(r, ["Τράπεζα", "bank", "bankName"]),
      paymentTermsDays: terms !== null && Number.isInteger(terms) && terms >= 0 && terms <= 365 ? terms : null,
      defaultClassificationCategory: pick(r, ["Κατηγορία χαρακτηρισμού", "classificationCategory"]),
      defaultClassificationType: pick(r, ["Τύπος χαρακτηρισμού", "classificationType"]),
      notes: pick(r, A_NOTES),
      tags: "[]",
      active: true,
    };
    const existingId = (afm && byAfm.get(afm)) || byName.get(name.toLowerCase());
    try {
      if (existingId) {
        if (!opts.updateExisting) {
          result.skipped++;
          continue;
        }
        await saveSupplier(db, orgId, input, existingId);
        result.updated++;
      } else {
        const id = await saveSupplier(db, orgId, input);
        if (afm) byAfm.set(afm, id);
        byName.set(name.toLowerCase(), id);
        result.refs!.push({ t: "supplier", id });
        result.created++;
      }
    } catch (e) {
      result.errors.push({ row, message: e instanceof Error ? e.message : "Η καταχώρηση απέτυχε." });
    }
  }
  return result;
}

export function invoicesTemplateCsv() {
  return (
    "\uFEFF" +
    [
      "Παραστατικό;Σειρά;Ημερομηνία;Λήξη;Πελάτης;ΑΦΜ;Τρόπος πληρωμής;Περιγραφή;Ποσότητα;Τιμή;Έκπτωση;ΦΠΑ;Κωδικός;Σημειώσεις",
      "A-1;ΤΠΥ;15/03/2026;14/04/2026;Παράδειγμα Α.Ε.;999888771;Τράπεζα;Συμβουλευτικές υπηρεσίες;10;65;0;24;SRV-001;Έργο Μαρτίου",
      "A-1;ΤΠΥ;15/03/2026;14/04/2026;Παράδειγμα Α.Ε.;999888771;Τράπεζα;Έξοδα μετακίνησης;1;120;0;24;;",
      "A-2;ΤΠ;16/03/2026;;Λιανική πώληση;;Μετρητά;Router Wi-Fi;2;89,90;5;24;HW-100;",
    ].join("\r\n")
  );
}

export function expensesTemplateCsv() {
  return (
    "\uFEFF" +
    [
      "Προμηθευτής;ΑΦΜ;Ημερομηνία;Σειρά;Αριθμός;Περιγραφή;Καθαρή αξία;ΦΠΑ;Ποσό ΦΠΑ;Παρακράτηση;Λήξη;ΜΑΡΚ;Χώρα;Τύπος",
      "ΔΕΗ Α.Ε.;090000045;05/03/2026;Α;12345;Ρεύμα Φεβρουαρίου;180,50;6;10,83;0;20/03/2026;;GR;1.1",
      "Γραφική Ύλη ΕΠΕ;999888783;10/03/2026;ΤΠ;778;Αναλώσιμα γραφείου;240;24;57,60;0;;;GR;1.1",
    ].join("\r\n")
  );
}

export function suppliersTemplateCsv() {
  return (
    "\uFEFF" +
    [
      "Επωνυμία;ΑΦΜ;ΔΟΥ;Χώρα;Διεύθυνση;Πόλη;ΤΚ;Email;Τηλέφωνο;Υπεύθυνος;IBAN;Τράπεζα;Ημέρες πίστωσης;Σημειώσεις",
      "Γραφική Ύλη ΕΠΕ;999888783;Α' Αθηνών;GR;Πατησίων 50;Αθήνα;10433;info@grafiki.gr;2105551234;Νίκος Ιωάννου;GR1601101250000000012300695;Εθνική;30;Αναλώσιμα",
    ].join("\r\n")
  );
}
