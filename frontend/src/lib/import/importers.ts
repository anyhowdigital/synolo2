import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, products } from "@/db/schema";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import { parseCsv, parseNumber, pick } from "./csv";

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  /** Εγγραφές που δημιουργήθηκαν, για αναίρεση της εισαγωγής. */
  refs?: ImportRef[];
}

/** Αναφορά σε νέα εγγραφή: ο πίνακας και το id της. */
export type ImportRef = { t: "customer" | "product" | "supplier" | "expense" | "invoice" | "payment" | "expense_payment"; id: string };

export const CUSTOMER_COLUMNS = [
  { key: "name", label: "Επωνυμία *", aliases: ["Επωνυμία", "name", "Όνομα", "Πελάτης", "customer", "company"] },
  { key: "afm", label: "ΑΦΜ", aliases: ["ΑΦΜ", "afm", "vat", "vatNumber", "ΑΦΜ πελάτη"] },
  { key: "doy", label: "ΔΟΥ", aliases: ["ΔΟΥ", "doy", "tax office"] },
  { key: "activity", label: "Δραστηριότητα", aliases: ["Δραστηριότητα", "activity", "Επάγγελμα"] },
  { key: "address", label: "Διεύθυνση", aliases: ["Διεύθυνση", "address", "street", "Οδός"] },
  { key: "city", label: "Πόλη", aliases: ["Πόλη", "city"] },
  { key: "postalCode", label: "Τ.Κ.", aliases: ["ΤΚ", "Τ.Κ.", "postalCode", "zip", "postcode"] },
  { key: "country", label: "Χώρα (ISO2)", aliases: ["Χώρα", "country"] },
  { key: "email", label: "Email", aliases: ["Email", "e-mail", "mail"] },
  { key: "phone", label: "Τηλέφωνο", aliases: ["Τηλέφωνο", "phone", "tel", "mobile", "Κινητό"] },
  { key: "contactPerson", label: "Υπεύθυνος", aliases: ["Υπεύθυνος", "contact", "contactPerson", "Επαφή"] },
  { key: "notes", label: "Σημειώσεις", aliases: ["Σημειώσεις", "notes", "comments"] },
  { key: "paymentTermsDays", label: "Όροι πληρωμής (ημέρες)", aliases: ["Όροι πληρωμής", "paymentTerms", "paymentTermsDays", "Ημέρες πίστωσης"] },
  { key: "kind", label: "Τύπος (company/individual)", aliases: ["Τύπος", "kind", "type"] },
];

export async function importCustomers(db: Db, orgId: string, csvText: string, opts: { updateExisting: boolean }): Promise<ImportResult> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], refs: [] };
  if (rows.length === 0) return result;
  const existing = await db.select({ id: customers.id, afm: customers.afm, name: customers.name }).from(customers).where(eq(customers.orgId, orgId));
  const byAfm = new Map(existing.filter((c) => c.afm).map((c) => [c.afm!, c.id]));
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const name = pick(r, CUSTOMER_COLUMNS[0].aliases);
    if (name.length < 2) {
      result.errors.push({ row: line, message: "Λείπει η επωνυμία." });
      continue;
    }
    const country = (pick(r, ["Χώρα", "country"]) || "GR").toUpperCase().slice(0, 2);
    let afm = pick(r, CUSTOMER_COLUMNS[1].aliases);
    if (afm && country === "GR") {
      afm = normalizeAfm(afm);
      if (!isValidAfm(afm)) {
        result.errors.push({ row: line, message: `Μη έγκυρο ΑΦΜ «${afm}» (${name}).` });
        continue;
      }
    }
    const kindRaw = pick(r, ["Τύπος", "kind", "type"]).toLowerCase();
    const kind = kindRaw.includes("ind") || kindRaw.includes("ιδι") || kindRaw.includes("φυσ") ? "individual" : afm ? "company" : kindRaw ? "company" : "individual";
    const terms = parseNumber(pick(r, ["Όροι πληρωμής", "paymentTerms", "paymentTermsDays", "Ημέρες πίστωσης"]));
    const data = {
      kind,
      name,
      afm,
      doy: pick(r, ["ΔΟΥ", "doy", "tax office"]),
      activity: pick(r, ["Δραστηριότητα", "activity", "Επάγγελμα"]),
      address: pick(r, ["Διεύθυνση", "address", "street", "Οδός"]),
      city: pick(r, ["Πόλη", "city"]),
      postalCode: pick(r, ["ΤΚ", "Τ.Κ.", "postalCode", "zip", "postcode"]),
      country,
      email: pick(r, ["Email", "e-mail", "mail"]),
      phone: pick(r, ["Τηλέφωνο", "phone", "tel", "mobile", "Κινητό"]),
      contactPerson: pick(r, ["Υπεύθυνος", "contact", "contactPerson", "Επαφή"]),
      notes: pick(r, ["Σημειώσεις", "notes", "comments"]),
      paymentTermsDays: terms !== null && Number.isInteger(terms) && terms >= 0 && terms <= 365 ? terms : null,
    };
    const existingId = (afm && byAfm.get(afm)) || byName.get(name.toLowerCase());
    if (existingId) {
      if (opts.updateExisting) {
        await db.update(customers).set(data).where(and(eq(customers.id, existingId), eq(customers.orgId, orgId)));
        result.updated++;
      } else result.skipped++;
      continue;
    }
    const id = randomUUID();
    await db.insert(customers).values({ id, orgId, ...data, stage: "customer", createdAt: now });
    result.refs!.push({ t: "customer", id });
    if (afm) byAfm.set(afm, id);
    byName.set(name.toLowerCase(), id);
    result.created++;
  }
  return result;
}

export const PRODUCT_COLUMNS = [
  { key: "name", label: "Περιγραφή *", aliases: ["Περιγραφή", "name", "Είδος", "product", "Ονομασία"] },
  { key: "sku", label: "Κωδικός (SKU)", aliases: ["Κωδικός", "sku", "code", "barcode"] },
  { key: "unitPrice", label: "Τιμή μονάδας *", aliases: ["Τιμή", "unitPrice", "price", "Τιμή μονάδας", "Τιμή πώλησης"] },
  { key: "costPrice", label: "Κόστος", aliases: ["Κόστος", "costPrice", "cost", "Τιμή αγοράς"] },
  { key: "vat", label: "ΦΠΑ % (24/13/6/0)", aliases: ["ΦΠΑ", "vat", "vatRate", "Συντελεστής ΦΠΑ"] },
  { key: "kind", label: "Τύπος (product/service)", aliases: ["Τύπος", "kind", "type"] },
  { key: "unit", label: "Μονάδα (τεμ/κιλά/λίτρα/μέτρα/τ.μ./κ.μ./τεμ.μ.)", aliases: ["Μονάδα", "unit", "measurementUnit", "ΜΜ"] },
  { key: "stock", label: "Απόθεμα", aliases: ["Απόθεμα", "stock", "quantity", "Ποσότητα"] },
  { key: "reorder", label: "Όριο επαναπαραγγελίας", aliases: ["Όριο", "reorderLevel", "reorder", "Ελάχιστο"] },
  { key: "description", label: "Σημειώσεις", aliases: ["Σημειώσεις", "description", "notes"] },
];

const VAT_BY_RATE: Record<number, number> = { 24: 1, 13: 2, 6: 3, 17: 4, 9: 5, 4: 6, 0: 7 };
const UNITS: [RegExp, number][] = [
  [/^(τεμ|pcs|piece|unit|τεμάχ)/i, 1],
  [/^(κιλ|kg|kilo)/i, 2],
  [/^(λίτ|lit|l$)/i, 3],
  [/^(μέτ|m$|meter|metre)/i, 4],
  [/^(τ\.?μ|m2|sqm|τετρ)/i, 5],
  [/^(κ\.?μ|m3|cbm|κυβ)/i, 6],
  [/^(τεμ\.?μ|piece.*unit)/i, 7],
];

export async function importProducts(db: Db, orgId: string, csvText: string, opts: { updateExisting: boolean; inventoryAllowed: boolean }): Promise<ImportResult> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], refs: [] };
  if (rows.length === 0) return result;
  const existing = await db.select({ id: products.id, sku: products.sku, name: products.name }).from(products).where(eq(products.orgId, orgId));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id]));
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const name = pick(r, PRODUCT_COLUMNS[0].aliases);
    if (name.length < 2) {
      result.errors.push({ row: line, message: "Λείπει η περιγραφή είδους." });
      continue;
    }
    const price = parseNumber(pick(r, PRODUCT_COLUMNS[2].aliases));
    if (price === null || price < 0) {
      result.errors.push({ row: line, message: `Μη έγκυρη τιμή για «${name}».` });
      continue;
    }
    const vatRaw = pick(r, PRODUCT_COLUMNS[4].aliases);
    const vatRate = vatRaw ? Math.round(parseNumber(vatRaw.replace("%", "")) ?? 24) : 24;
    const vatCategory = VAT_BY_RATE[vatRate];
    if (!vatCategory) {
      result.errors.push({ row: line, message: `Άγνωστος συντελεστής ΦΠΑ «${vatRaw}» για «${name}».` });
      continue;
    }
    const kindRaw = pick(r, ["Τύπος", "kind", "type"]).toLowerCase();
    const kind = kindRaw.includes("serv") || kindRaw.includes("υπηρ") ? "service" : kindRaw.includes("prod") || kindRaw.includes("εμπ") || kindRaw.includes("προϊ") ? "product" : "service";
    const unitRaw = pick(r, ["Μονάδα", "unit", "measurementUnit", "ΜΜ"]);
    const measurementUnit = UNITS.find(([re]) => re.test(unitRaw))?.[1] ?? 1;
    const stock = parseNumber(pick(r, ["Απόθεμα", "stock", "quantity", "Ποσότητα"]));
    const reorder = parseNumber(pick(r, ["Όριο", "reorderLevel", "reorder", "Ελάχιστο"]));
    const trackStock = opts.inventoryAllowed && kind === "product" && stock !== null;
    const data = {
      sku: pick(r, PRODUCT_COLUMNS[1].aliases),
      name,
      description: pick(r, ["Σημειώσεις", "description", "notes"]),
      kind,
      unitPrice: price,
      costPrice: parseNumber(pick(r, PRODUCT_COLUMNS[3].aliases)) ?? 0,
      vatCategory,
      vatExemptionCategory: vatCategory === 7 ? 15 : null,
      measurementUnit,
      classificationCategory: kind === "service" ? "category1_3" : "category1_1",
      classificationType: kind === "service" ? "E3_561_001" : "E3_561_001",
      trackStock,
      stockQuantity: trackStock ? stock! : 0,
      reorderLevel: trackStock ? reorder ?? 0 : 0,
      active: true,
    };
    const existingId = (data.sku && bySku.get(data.sku.toLowerCase())) || byName.get(name.toLowerCase());
    if (existingId) {
      if (opts.updateExisting) {
        await db.update(products).set(data).where(and(eq(products.id, existingId), eq(products.orgId, orgId)));
        result.updated++;
      } else result.skipped++;
      continue;
    }
    const id = randomUUID();
    await db.insert(products).values({ id, orgId, ...data, createdAt: now });
    result.refs!.push({ t: "product", id });
    if (data.sku) bySku.set(data.sku.toLowerCase(), id);
    byName.set(name.toLowerCase(), id);
    result.created++;
  }
  return result;
}

export function customersTemplateCsv() {
  return "\uFEFF" + ["Επωνυμία;ΑΦΜ;ΔΟΥ;Δραστηριότητα;Διεύθυνση;Πόλη;ΤΚ;Χώρα;Email;Τηλέφωνο;Υπεύθυνος;Όροι πληρωμής;Τύπος", "Παράδειγμα Α.Ε.;999888771;ΦΑΕ Αθηνών;Εμπόριο;Σταδίου 10;Αθήνα;10564;GR;info@example.gr;2101234567;Μαρία Παπαδοπούλου;30;company"].join("\r\n");
}

export function productsTemplateCsv() {
  return "\uFEFF" + ["Περιγραφή;Κωδικός;Τιμή;Κόστος;ΦΠΑ;Τύπος;Μονάδα;Απόθεμα;Όριο", "Συμβουλευτικές υπηρεσίες (ώρα);SRV-001;65;0;24;service;τεμ;;", "Router Wi-Fi;HW-100;89,90;55;24;product;τεμ;12;3"].join("\r\n");
}

