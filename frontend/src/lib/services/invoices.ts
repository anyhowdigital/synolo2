import { and, desc, eq, gte, inArray, like, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { assertPeriodOpen } from "@/lib/services/periods";
import type { Db } from "@/db";
import {
  customers,
  expenses,
  invoiceLines,
  invoices,
  products,
  warehouses,
  payments,
  series,
  type Invoice,
  type InvoiceLine,
  type Organization,
} from "@/db/schema";
import { DOCUMENT_TYPES, getDocumentType, type DocumentKind } from "@/lib/greek/document-types";
import { computeInvoice, isValidDate, round2, type LineInput, businessDate } from "@/lib/invoice/totals";
import { reverseEntriesForSource } from "@/lib/services/gl";
import { buildInvoicesDocXml } from "@/lib/mydata/xml";
import { cancelInvoice as mydataCancel, sendInvoices, requestTransmittedDocs, type MyDataSendResult } from "@/lib/mydata/client";
import { notify } from "./notifications";
import { invoiceDisplayNumber } from "./invoice-display";
import { precheckMyData } from "@/lib/mydata/rules";
import { randomToken } from "@/lib/auth/password";
import { assertCanIssue } from "@/lib/billing/limits";
import { orgMyDataCredentials } from "./org";
import { dispatchWebhooks } from "./webhooks";
import { audit } from "./audit";
import { resolveActor } from "./actor";
import { listMovements, recordMovement } from "./inventory";
import { loadB2GCustomer, sendB2G, validateB2G } from "./b2g";
import { defaultAccountFor } from "./banking";

export interface InvoiceLineDraft extends LineInput {
  productId?: string | null;
}

export interface InvoiceDraftInput {
  customerId: string | null;
  seriesId: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  exchangeRate?: number | null;
  paymentMethod: number;
  notes: string;
  correlatedInvoiceId: string | null;
  sourceQuoteId?: string | null;
  recurringTemplateId?: string | null;
  dispatchDate?: string | null;
  vehicleNumber?: string | null;
  movePurpose?: number | null;
  deliveryAddress?: string | null;
  loadingAddress?: string | null;
  selfPricing?: boolean;
  /** Ετικέτες (JSON array string), custom πεδία (JSON object string), διαστάσεις πωλήσεων. */
  tags?: string;
  customFieldsJson?: string;
  salespersonId?: string | null;
  channel?: string;
  /** Αποθήκη από την οποία κινείται το απόθεμα (κενό = προεπιλεγμένη). */
  warehouseId?: string | null;
  lines: InvoiceLineDraft[];
}

export type InvoiceWithLines = Invoice & { lines: InvoiceLine[] };

const now = () => new Date().toISOString();

async function log(db: Db, orgId: string, entity: string, entityId: string, action: string, detail = "") {
  await audit(db, orgId, entity, entityId, action, detail, await resolveActor(db));
}

export const KIND_CODES: Record<DocumentKind, string[]> = {
  invoice: DOCUMENT_TYPES.filter((d) => d.kind === "invoice").map((d) => d.code),
  delivery: DOCUMENT_TYPES.filter((d) => d.kind === "delivery").map((d) => d.code),
  quote: DOCUMENT_TYPES.filter((d) => d.kind === "quote").map((d) => d.code),
};

export interface ListInvoicesOptions {
  status?: string;
  mydata?: string;
  /** Φίλτρο κατάστασης τιμολόγησης Δημοσίου: pending (εκκρεμή) | rejected (απορρίψεις/σφάλματα). */
  b2g?: string;
  q?: string;
  from?: string;
  to?: string;
  customerId?: string;
  /** invoice (default: τιμολόγια + δελτία), quote, delivery, all */
  kind?: DocumentKind | "all" | "fiscal";
  /** Φίλτρα διαστάσεων (A11/A12). */
  tag?: string;
  salespersonId?: string;
  channel?: string;
  page?: number;
  pageSize?: number;
}

/** Λίστα παραστατικών με αναζήτηση, φίλτρα και σελιδοποίηση. */
export async function listInvoices(db: Db, orgId: string, opts: ListInvoicesOptions = {}) {
  const conds: SQL[] = [eq(invoices.orgId, orgId)];
  const kind = opts.kind ?? "fiscal";
  if (kind === "fiscal") conds.push(inArray(invoices.invoiceType, [...KIND_CODES.invoice, ...KIND_CODES.delivery]));
  else if (kind !== "all") conds.push(inArray(invoices.invoiceType, KIND_CODES[kind]));

  if (opts.status === "unpaid") conds.push(inArray(invoices.status, ["issued", "partially_paid"]));
  else if (opts.status === "overdue") {
    conds.push(inArray(invoices.status, ["issued", "partially_paid"]));
    conds.push(lt(invoices.dueDate, businessDate()));
  } else if (opts.status) conds.push(eq(invoices.status, opts.status));

  if (opts.mydata === "pending") {
    conds.push(ne(invoices.status, "draft"), ne(invoices.status, "cancelled"), ne(invoices.mydataStatus, "sent"));
    conds.push(inArray(invoices.invoiceType, [...KIND_CODES.invoice, ...KIND_CODES.delivery]));
  } else if (opts.mydata === "error") conds.push(eq(invoices.mydataStatus, "error"));
  if (opts.b2g === "pending") conds.push(inArray(invoices.b2gStatus, ["pending", "sent"]));
  else if (opts.b2g === "rejected") conds.push(inArray(invoices.b2gStatus, ["rejected", "error"]));
  if (opts.customerId) conds.push(eq(invoices.customerId, opts.customerId));
  if (opts.from) conds.push(gte(invoices.issueDate, opts.from));
  if (opts.to) conds.push(lte(invoices.issueDate, opts.to));
  if (opts.tag) conds.push(like(invoices.tags, `%${JSON.stringify(opts.tag.trim()).slice(1, -1).replace(/[%_]/g, "")}%`));
  if (opts.salespersonId) conds.push(eq(invoices.salespersonId, opts.salespersonId));
  if (opts.channel) conds.push(eq(invoices.channel, opts.channel));
  if (opts.q) {
    const term = `%${opts.q.trim()}%`;
    const numeric = Number(opts.q.trim());
    const qConds = [like(invoices.customerName, term), like(invoices.customerAfm, term), like(invoices.mydataMark, term), like(invoices.notes, term), like(invoices.seriesCode, term)];
    if (Number.isInteger(numeric)) qConds.push(eq(invoices.number, numeric));
    conds.push(or(...qConds)!);
  }

  const where = and(...conds);
  const pageSize = opts.pageSize ?? 25;

  const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(invoices).where(where);
  const total = Number(countRow?.n ?? 0);
  const page = Math.min(Math.max(1, opts.page ?? 1), Math.max(1, Math.ceil(total / pageSize)));
  const totalsRows = await db
    .select({ invoiceType: invoices.invoiceType, net: sql<number>`sum(${invoices.totalNetValue})`, vat: sql<number>`sum(${invoices.totalVatAmount})`, gross: sql<number>`sum(${invoices.totalGrossValue})` })
    .from(invoices)
    .where(and(where, ne(invoices.status, "draft"), ne(invoices.status, "cancelled")))
    .groupBy(invoices.invoiceType);
  const totals = totalsRows.reduce(
    (acc, r) => {
      const s = getDocumentType(r.invoiceType).credit ? -1 : 1;
      acc.net = round2(acc.net + s * Number(r.net ?? 0));
      acc.vat = round2(acc.vat + s * Number(r.vat ?? 0));
      acc.gross = round2(acc.gross + s * Number(r.gross ?? 0));
      return acc;
    },
    { net: 0, vat: 0, gross: 0 },
  );

  const rows = await db
    .select()
    .from(invoices)
    .where(where)
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), totals };
}

export async function getInvoiceWithLines(db: Db, orgId: string, id: string): Promise<InvoiceWithLines | null> {
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, id), eq(invoices.orgId, orgId)) });
  if (!inv) return null;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(invoiceLines.lineNumber);
  return { ...inv, lines };
}

export async function getInvoiceByPublicToken(db: Db, token: string): Promise<InvoiceWithLines | null> {
  if (!token) return null;
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.publicToken, token) });
  if (!inv) return null;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(invoiceLines.lineNumber);
  return { ...inv, lines };
}

/** Εξασφαλίζει δημόσιο token για την προβολή του παραστατικού από τον πελάτη. */
export async function ensurePublicToken(db: Db, inv: Invoice) {
  if (inv.publicToken) return inv.publicToken;
  const token = randomToken(24);
  await db.update(invoices).set({ publicToken: token }).where(eq(invoices.id, inv.id));
  return token;
}

export { invoiceDisplayNumber } from "./invoice-display";

async function customerSnapshot(db: Db, orgId: string, customerId: string | null) {
  if (!customerId) return { customerName: "", customerAfm: "", customerDoy: "", customerAddress: "", customerCountry: "GR" };
  const c = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.orgId, orgId)) });
  if (!c) throw new Error("Ο πελάτης δεν βρέθηκε.");
  return {
    customerName: c.name,
    customerAfm: c.afm ?? "",
    customerDoy: c.doy ?? "",
    customerAddress: [c.address, c.postalCode, c.city].filter(Boolean).join(", "),
    customerCountry: c.country || "GR",
  };
}

/** Δημιουργία ή ενημέρωση πρόχειρου παραστατικού. */
export async function saveDraft(db: Db, org: Organization, input: InvoiceDraftInput, existingId?: string) {
  return db.transaction(async (tx) => saveDraftInTransaction(tx as unknown as Db, org, input, existingId));
}

async function saveDraftInTransaction(db: Db, org: Organization, input: InvoiceDraftInput, existingId?: string) {
  const ser = await db.query.series.findFirst({ where: and(eq(series.id, input.seriesId), eq(series.orgId, org.id)) });
  if (!ser) throw new Error("Η σειρά δεν βρέθηκε.");
  const docType = getDocumentType(ser.invoiceType);
  if (!docType.retail && !input.customerId) {
    throw new Error(docType.expenseSide ? "Απαιτείται αντισυμβαλλόμενος για το παραστατικό." : "Απαιτείται πελάτης για παραστατικά χονδρικής.");
  }
  if (input.lines.length === 0) throw new Error("Προσθέστε τουλάχιστον μία γραμμή.");
  if (!isValidDate(input.issueDate) || (input.dueDate && (!isValidDate(input.dueDate) || input.dueDate < input.issueDate))) throw new Error("Ελέγξτε τις ημερομηνίες: η λήξη δεν μπορεί να προηγείται της έκδοσης.");
  if (input.lines.some((l) => !l.description.trim() || !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.unitPrice) || l.unitPrice < 0 || !Number.isFinite(l.discountPercent) || l.discountPercent < 0 || l.discountPercent > 100)) throw new Error("Ελέγξτε περιγραφή, θετική ποσότητα, μη αρνητική τιμή και έκπτωση 0–100% σε κάθε γραμμή.");
  const productIds = [...new Set(input.lines.map((l) => l.productId).filter((id): id is string => !!id))];
  if (productIds.length) {
    const ownedProducts = await db.select({ id: products.id }).from(products).where(and(eq(products.orgId, org.id), inArray(products.id, productIds)));
    if (ownedProducts.length !== productIds.length) throw new Error("Κάποιο είδος δεν ανήκει στην τρέχουσα επιχείρηση ή έχει διαγραφεί.");
  }
  if (input.warehouseId && !await db.query.warehouses.findFirst({ where: and(eq(warehouses.id, input.warehouseId), eq(warehouses.orgId, org.id)) })) throw new Error("Η αποθήκη δεν ανήκει στην τρέχουσα επιχείρηση.");
  if (input.correlatedInvoiceId) {
    const original = await db.query.invoices.findFirst({ where: and(eq(invoices.id, input.correlatedInvoiceId), eq(invoices.orgId, org.id)) });
    if (!docType.credit || !original || !["issued", "partially_paid", "paid"].includes(original.status) || original.customerId !== input.customerId || original.currency !== (input.currency || "EUR") || original.issueDate > input.issueDate || getDocumentType(original.invoiceType).credit) throw new Error("Επιλέξτε εκδοθέν αρχικό παραστατικό του ίδιου πελάτη και νομίσματος, με ημερομηνία έως την ημερομηνία του πιστωτικού.");
  }
  await assertPeriodOpen(db, org.id, input.issueDate);
  if (docType.requiresCorrelation && !input.correlatedInvoiceId) {
    throw new Error("Το πιστωτικό συσχετιζόμενο απαιτεί αρχικό παραστατικό.");
  }
  if (docType.kind === "delivery" && !input.movePurpose) {
    throw new Error("Το δελτίο αποστολής απαιτεί σκοπό διακίνησης.");
  }
  if ((input.currency || "EUR") !== "EUR" && !input.exchangeRate) {
    throw new Error("Για παραστατικά σε ξένο νόμισμα απαιτείται ισοτιμία προς EUR (myDATA exchangeRate).");
  }

  const totals = computeInvoice(input.lines);
  const snapshot = await customerSnapshot(db, org.id, input.customerId);
  const ts = now();
  const customerRow = input.customerId ? await db.query.customers.findFirst({ where: eq(customers.id, input.customerId), columns: { salespersonId: true } }) : null;

  if (existingId) {
    const existing = await db.query.invoices.findFirst({ where: and(eq(invoices.id, existingId), eq(invoices.orgId, org.id)) });
    if (!existing) throw new Error("Το παραστατικό δεν βρέθηκε.");
    if (existing.status !== "draft") throw new Error("Μόνο πρόχειρα παραστατικά μπορούν να τροποποιηθούν.");
  }

  const id = existingId ?? randomUUID();
  const record = {
    orgId: org.id,
    customerId: input.customerId,
    seriesId: ser.id,
    seriesCode: ser.code,
    number: 0,
    invoiceType: ser.invoiceType,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency || "EUR",
    exchangeRate: (input.currency || "EUR") === "EUR" ? null : input.exchangeRate ?? null,
    paymentMethod: input.paymentMethod,
    status: "draft",
    notes: input.notes,
    correlatedInvoiceId: input.correlatedInvoiceId,
    sourceQuoteId: input.sourceQuoteId ?? null,
    recurringTemplateId: input.recurringTemplateId ?? null,
    dispatchDate: docType.kind === "delivery" ? input.dispatchDate || input.issueDate : null,
    vehicleNumber: docType.kind === "delivery" ? input.vehicleNumber ?? null : null,
    movePurpose: docType.kind === "delivery" ? input.movePurpose ?? null : null,
    deliveryAddress: docType.kind === "delivery" ? input.deliveryAddress ?? null : null,
    loadingAddress: docType.kind === "delivery" ? input.loadingAddress ?? null : null,
    selfPricing: docType.kind === "invoice" ? input.selfPricing === true : false,
    tags: input.tags ?? "[]",
    customFieldsJson: input.customFieldsJson ?? "{}",
    salespersonId: input.salespersonId === undefined ? customerRow?.salespersonId ?? null : input.salespersonId,
    channel: input.channel ?? "",
    warehouseId: input.warehouseId ?? null,
    branch: ser.branch ?? 0,
    ...snapshot,
    totalNetValue: totals.totalNetValue,
    totalVatAmount: totals.totalVatAmount,
    totalWithheldAmount: totals.totalWithheldAmount,
    totalStampDutyAmount: totals.totalStampDutyAmount,
    totalGrossValue: totals.totalGrossValue,
    updatedAt: ts,
  };

  if (existingId) {
    await db.update(invoices).set(record).where(eq(invoices.id, id));
    await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  } else {
    await db.insert(invoices).values({ id, ...record, createdAt: ts });
  }

  await db.insert(invoiceLines).values(
    input.lines.map((l, i) => ({
      id: randomUUID(),
      invoiceId: id,
      lineNumber: i + 1,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      vatCategory: l.vatCategory,
      vatExemptionCategory: l.vatExemptionCategory ?? null,
      measurementUnit: l.measurementUnit,
      classificationCategory: l.classificationCategory,
      classificationType: l.classificationType,
      withholdingCategory: l.withholdingCategory,
      stampDutyCategory: l.stampDutyCategory,
      ...totals.lines[i],
    })),
  );

  await log(db, org.id, "invoice", id, existingId ? "draft_updated" : "draft_created");
  return id;
}

/** Επόμενος αριθμός σειράς – με προαιρετική ετήσια επαναφορά αρίθμησης. */
async function nextSeriesNumber(db: Db, org: Organization, seriesId: string, issueDate: string) {
  const ser = await db.query.series.findFirst({ where: and(eq(series.id, seriesId), eq(series.orgId, org.id)) });
  if (!ser) throw new Error("Η σειρά δεν βρέθηκε.");
  const year = Number(issueDate.slice(0, 4));
  const [used] = await db.select({ maximum: sql<number>`coalesce(max(${invoices.number}), 0)` }).from(invoices).where(and(eq(invoices.orgId, org.id), eq(invoices.seriesId, seriesId), ne(invoices.status, "draft"), ...(org.yearlyNumbering ? [gte(invoices.issueDate, `${year}-01-01`), lte(invoices.issueDate, `${year}-12-31`)] : [])));
  // Returning to a previous year must never re-use an already issued number.
  const configured = org.yearlyNumbering && ser.numberingYear && ser.numberingYear !== year ? 1 : ser.nextNumber;
  const number = Math.max(configured, Number(used.maximum) + 1);
  await db.update(series).set({ nextNumber: number + 1, numberingYear: year }).where(and(eq(series.id, ser.id), eq(series.orgId, org.id)));
  return { ser, number };
}

/** Οριστική έκδοση: απόδοση αριθμού από τη σειρά, κλείδωμα, ενημέρωση αποθήκης. */
export async function issueInvoice(db: Db, org: Organization, id: string) {
  const inv = await getInvoiceWithLines(db, org.id, id);
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (inv.status !== "draft") throw new Error("Το παραστατικό έχει ήδη εκδοθεί.");
  const docType = getDocumentType(inv.invoiceType);
  if (docType.kind !== "quote") await assertCanIssue(db, org);
  if (!docType.retail && !inv.customerAfm && docType.kind !== "quote") throw new Error("Ο πελάτης πρέπει να έχει ΑΦΜ για παραστατικό χονδρικής.");
  if (!org.afm) throw new Error("Συμπληρώστε το ΑΦΜ της επιχείρησης στις Ρυθμίσεις πριν την έκδοση.");
  if (docType.kind !== "quote") {
    const original = inv.correlatedInvoiceId ? await db.query.invoices.findFirst({ where: eq(invoices.id, inv.correlatedInvoiceId), columns: { invoiceType: true } }) : null;
    const problems = precheckMyData({ invoice: inv, lines: inv.lines, correlatedType: original?.invoiceType ?? null });
    if (problems.length) throw new Error(`Το παραστατικό δεν θα γινόταν δεκτό από το myDATA: ${problems.join(" · ")}`);
  }

  // Financial changes commit together: number, status and stock cannot be left half-written.
  const { ser, number } = await db.transaction(async (tx) => {
    const transactionalDb = tx as unknown as Db;
    const current = await getInvoiceWithLines(transactionalDb, org.id, id);
    if (!current || current.status !== "draft") throw new Error("Το παραστατικό έχει ήδη εκδοθεί. Ανανεώστε τη σελίδα.");
    if (current.updatedAt !== inv.updatedAt) throw new Error("Το πρόχειρο άλλαξε σε άλλη καρτέλα. Ανανεώστε πριν την έκδοση.");
    await assertPeriodOpen(transactionalDb, org.id, current.issueDate);
    const { ser, number } = await nextSeriesNumber(transactionalDb, org, current.seriesId, current.issueDate);
    await tx.update(invoices).set({ number, status: "issued", publicToken: current.publicToken ?? randomToken(24), updatedAt: now(), ...(await customerSnapshot(transactionalDb, org.id, current.customerId)) }).where(and(eq(invoices.id, id), eq(invoices.orgId, org.id), eq(invoices.status, "draft")));
    if (docType.kind !== "quote") {
      const sign = docType.credit ? 1 : -1;
      const actor = (await resolveActor(transactionalDb))?.name ?? "";
      for (const line of current.lines) {
        if (!line.productId) continue;
        await recordMovement(transactionalDb, org.id, { productId: line.productId, warehouseId: current.warehouseId, quantity: sign * line.quantity, kind: docType.credit ? "sale_reversal" : "sale", refType: "invoice", refId: id, note: `${docType.short} ${ser.code}-${number}`, movedAt: current.issueDate, actor });
      }
    }
    await log(transactionalDb, org.id, "invoice", id, "issued", `${ser.code}-${number}`);
    return { ser, number };
  });
  if (docType.kind !== "quote") {
    await dispatchWebhooks(db, org.id, "invoice.issued", {
      invoiceId: id,
      number: `${ser.code}-${number}`,
      invoiceType: inv.invoiceType,
      issueDate: inv.issueDate,
      customerName: inv.customerName,
      customerAfm: inv.customerAfm,
      totalGrossValue: inv.totalGrossValue,
      currency: inv.currency,
    });
  }
  if (docType.kind === "invoice" && org.b2gAutoSend) await autoSendB2G(db, org, id);
  return number;
}

/** Αυτόματη αποστολή στο Δημόσιο μετά την έκδοση – δεν διακόπτει ποτέ την έκδοση. */
async function autoSendB2G(db: Db, org: Organization, id: string) {
  try {
    const fresh = await getInvoiceWithLines(db, org.id, id);
    if (!fresh) return;
    const customer = await loadB2GCustomer(db, fresh);
    if (!customer?.publicEntity) return;
    const problems = validateB2G(org, fresh, fresh.lines, customer);
    if (problems.length) {
      await notify(db, {
        orgId: org.id,
        type: "b2g_rejected",
        title: `Το ${invoiceDisplayNumber(fresh)} δεν στάλθηκε στο Δημόσιο`,
        body: `Λείπουν υποχρεωτικά στοιχεία B2G: ${problems.join(" · ")}`.slice(0, 600),
        link: `/invoices/${id}`,
      });
      return;
    }
    await sendB2G(db, org, fresh, fresh.lines, await resolveActor(db));
  } catch (err) {
    await notify(db, {
      orgId: org.id,
      type: "b2g_rejected",
      title: "Αποτυχία αυτόματης αποστολής στο Δημόσιο",
      body: (err instanceof Error ? err.message : String(err)).slice(0, 600),
      link: `/invoices/${id}`,
    });
  }
}

/** Διαβίβαση στο myDATA. */
export async function transmitToMyData(db: Db, org: Organization, id: string) {
  const inv = await getInvoiceWithLines(db, org.id, id);
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (inv.status === "draft") throw new Error("Εκδώστε πρώτα το παραστατικό.");
  if (getDocumentType(inv.invoiceType).kind === "quote") throw new Error("Οι προσφορές δεν διαβιβάζονται στο myDATA.");
  if (inv.mydataStatus === "sent") throw new Error("Το παραστατικό έχει ήδη διαβιβαστεί (MARK " + inv.mydataMark + ").");

  let correlatedMark: string | null = null;
  let correlatedType: string | null = null;
  if (inv.correlatedInvoiceId) {
    const original = await db.query.invoices.findFirst({ where: eq(invoices.id, inv.correlatedInvoiceId) });
    correlatedMark = original?.mydataMark ?? null;
    correlatedType = original?.invoiceType ?? null;
    if (getDocumentType(inv.invoiceType).requiresCorrelation && !correlatedMark) {
      throw new Error("Το αρχικό παραστατικό δεν έχει MARK. Διαβιβάστε το πρώτα.");
    }
  }

  // Προ-έλεγχος κανόνων ΑΑΔΕ ανά τύπο – αποφεύγουμε άσκοπη απόρριψη (σφάλματα 204/205/215/242-244/308).
  const problems = precheckMyData({ invoice: inv, lines: inv.lines, correlatedType });
  if (problems.length) {
    const message = problems.map((p) => `[PRECHECK] ${p}`).join(" · ");
    await db.update(invoices).set({ mydataStatus: "error", mydataError: message, updatedAt: now() }).where(eq(invoices.id, id));
    await log(db, org.id, "invoice", id, "mydata_error", message);
    await notify(db, { orgId: org.id, type: "mydata_error", title: `Έλεγχος myDATA: το ${invoiceDisplayNumber(inv)} δεν διαβιβάστηκε`, body: problems.join(" · ").slice(0, 600), link: `/invoices/${id}` });
    return { ok: false, errors: problems.map((p) => ({ code: "PRECHECK", message: p })), rawResponse: "" } satisfies MyDataSendResult;
  }

  const xml = buildInvoicesDocXml({ org, invoice: inv, lines: inv.lines, correlatedMark, correlatedType });
  // Idempotency: αν προηγούμενη αποστολή έμεινε σε "error" (π.χ. timeout), ελέγχουμε πρώτα αν η ΑΑΔΕ έχει ήδη το παραστατικό.
  if (inv.mydataStatus === "error" && !inv.mydataMark) {
    const remote = await requestTransmittedDocs(orgMyDataCredentials(org), { dateFrom: inv.issueDate, dateTo: inv.issueDate });
    const found = remote.ok && remote.docs ? remote.docs.find((d) => d.series === inv.seriesCode && String(d.aa) === String(inv.number) && !d.cancelledByMark) : undefined;
    if (found) {
      await db.update(invoices).set({ mydataStatus: "sent", mydataMark: found.mark, mydataError: null, mydataSentAt: now(), updatedAt: now() }).where(eq(invoices.id, id));
      await log(db, org.id, "invoice", id, "mydata_sent", `Υιοθετήθηκε υπάρχον MARK ${found.mark} (αποφυγή διπλής διαβίβασης)`);
      return { ok: true, mark: found.mark, rawResponse: remote.rawResponse } as MyDataSendResult;
    }
  }
  const result = await sendInvoices(orgMyDataCredentials(org), xml);
  const ts = now();

  if (result.ok) {
    await db
      .update(invoices)
      .set({
        mydataStatus: "sent",
        mydataMark: result.mark ?? null,
        mydataUid: result.uid ?? null,
        mydataAuthCode: result.authenticationCode ?? null,
        mydataQrUrl: result.qrUrl ?? null,
        mydataError: null,
        mydataSentAt: ts,
        mydataRequestXml: xml,
        mydataResponseXml: result.rawResponse,
        updatedAt: ts,
      })
      .where(eq(invoices.id, id));
    await log(db, org.id, "invoice", id, "mydata_sent", `MARK ${result.mark}`);
    await dispatchWebhooks(db, org.id, "mydata.sent", { invoiceId: id, mark: result.mark, uid: result.uid, qrUrl: result.qrUrl });
  } else {
    const message = (result.errors ?? []).map((e) => `[${e.code}] ${e.message}`).join(" · ");
    await db
      .update(invoices)
      .set({ mydataStatus: "error", mydataError: message, mydataRequestXml: xml, mydataResponseXml: result.rawResponse, updatedAt: ts })
      .where(eq(invoices.id, id));
    await log(db, org.id, "invoice", id, "mydata_error", message);
    await dispatchWebhooks(db, org.id, "mydata.error", { invoiceId: id, error: message });
    await notify(db, { orgId: org.id, type: "mydata_error", title: `Το myDATA απέρριψε το ${invoiceDisplayNumber(inv)}`, body: message.slice(0, 600), link: `/invoices/${id}` });
  }
  return result;
}

/** Ακύρωση παραστατικού (και στο myDATA εάν έχει MARK). */
export async function cancelIssuedInvoice(db: Db, org: Organization, id: string) {
  const inv = await getInvoiceWithLines(db, org.id, id);
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (inv.status === "cancelled") throw new Error("Το παραστατικό είναι ήδη ακυρωμένο.");
  if (inv.paidAmount > 0) throw new Error("Δεν μπορεί να ακυρωθεί παραστατικό με καταχωρημένες εισπράξεις.");

  let cancellationMark: string | null = null;
  if (inv.mydataStatus === "sent" && inv.mydataMark) {
    const result = await mydataCancel(orgMyDataCredentials(org), inv.mydataMark);
    if (!result.ok) {
      throw new Error("Αποτυχία ακύρωσης στο myDATA: " + (result.errors ?? []).map((e) => e.message).join(", "));
    }
    cancellationMark = result.cancellationMark ?? result.mark ?? null;
  }

  // Επαναφορά αποθήκης: αντίστροφη κίνηση για κάθε γραμμή που είχε κινήσει απόθεμα.
  const docType = getDocumentType(inv.invoiceType);
  if (inv.status !== "draft" && docType.kind !== "quote") {
    const existing = await listMovements(db, org.id, { limit: 1000 });
    const mine = existing.filter((m) => m.refType === "invoice" && m.refId === id);
    const actor = (await resolveActor(db))?.name ?? "";
    for (const m of mine) {
      await recordMovement(db, org.id, {
        productId: m.productId,
        warehouseId: m.warehouseId,
        quantity: -m.quantity,
        kind: "sale_reversal",
        refType: "invoice",
        refId: id,
        note: `Ακύρωση ${invoiceDisplayNumber(inv)}`,
        actor,
        force: true,
      });
    }
  }

  await db
    .update(invoices)
    .set({
      status: "cancelled",
      mydataStatus: cancellationMark ? "cancelled" : inv.mydataStatus,
      mydataCancellationMark: cancellationMark,
      updatedAt: now(),
    })
    .where(eq(invoices.id, id));
  await reverseEntriesForSource(db, org.id, "invoice", id, businessDate()).catch(() => 0);
  await log(db, org.id, "invoice", id, "cancelled", cancellationMark ? `Cancellation MARK ${cancellationMark}` : "");
  await dispatchWebhooks(db, org.id, "invoice.cancelled", { invoiceId: id, cancellationMark });
}

export async function deleteDraft(db: Db, org: Organization, id: string) {
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, id), eq(invoices.orgId, org.id)) });
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (inv.status !== "draft") throw new Error("Μόνο πρόχειρα διαγράφονται. Τα εκδοθέντα ακυρώνονται.");
  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  await db.delete(invoices).where(eq(invoices.id, id));
}

/** Μετατροπή γραμμών αποθηκευμένου παραστατικού σε είσοδο editor/saveDraft. */
export function linesToDraft(lines: InvoiceLine[]): InvoiceLineDraft[] {
  return lines.map((l) => ({
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
  }));
}

/** Αντιγραφή παραστατικού σε νέο πρόχειρο (ίδια σειρά, σημερινή ημερομηνία). */
export async function duplicateInvoice(db: Db, org: Organization, id: string) {
  const src = await getInvoiceWithLines(db, org.id, id);
  if (!src) throw new Error("Το παραστατικό δεν βρέθηκε.");
  const today = businessDate();
  const termDays = src.dueDate ? Math.max(0, Math.round((new Date(src.dueDate).getTime() - new Date(src.issueDate).getTime()) / 86_400_000)) : org.defaultPaymentTermsDays;
  const due = new Date(Date.now() + termDays * 86_400_000).toISOString().slice(0, 10);
  const newId = await saveDraft(db, org, {
    customerId: src.customerId,
    seriesId: src.seriesId,
    issueDate: today,
    dueDate: src.dueDate ? due : null,
    currency: src.currency,
    exchangeRate: src.exchangeRate,
    paymentMethod: src.paymentMethod,
    notes: src.notes ?? "",
    correlatedInvoiceId: null,
    dispatchDate: today,
    vehicleNumber: src.vehicleNumber,
    movePurpose: src.movePurpose,
    deliveryAddress: src.deliveryAddress,
    loadingAddress: src.loadingAddress,
    warehouseId: src.warehouseId,
    lines: linesToDraft(src.lines),
  });
  await log(db, org.id, "invoice", newId, "duplicated_from", id);
  return newId;
}

/** Ενημέρωση κατάστασης προσφοράς από τον εκδότη ή τον πελάτη (δημόσιος σύνδεσμος). */
export interface QuoteDecisionDetails {
  /** Ονοματεπώνυμο του προσώπου που αποδέχεται/απορρίπτει (ηλεκτρονική υπογραφή). */
  name?: string;
  note?: string;
  ip?: string;
  /** PNG data URL της χειρόγραφης υπογραφής. */
  signature?: string | null;
}

export async function setQuoteStatus(db: Db, orgId: string, id: string, status: "accepted" | "rejected", details: QuoteDecisionDetails = {}) {
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, id), eq(invoices.orgId, orgId)) });
  if (!inv) throw new Error("Η προσφορά δεν βρέθηκε.");
  if (getDocumentType(inv.invoiceType).kind !== "quote") throw new Error("Το παραστατικό δεν είναι προσφορά.");
  if (inv.status === "draft") throw new Error("Εκδώστε πρώτα την προσφορά.");
  if (inv.status === "converted") throw new Error("Η προσφορά έχει ήδη μετατραπεί σε παραστατικό.");
  const ts = now();
  const fromCustomer = !!details.name;
  await db
    .update(invoices)
    .set({
      status,
      updatedAt: ts,
      acceptedByName: fromCustomer ? details.name!.slice(0, 120) : null,
      acceptedAt: fromCustomer ? ts : null,
      acceptedIp: fromCustomer ? (details.ip ?? "").slice(0, 64) : null,
      acceptedSignature: fromCustomer && status === "accepted" ? (details.signature ?? null) : null,
      decisionNote: (details.note ?? "").slice(0, 2000) || null,
    })
    .where(eq(invoices.id, id));
  const detail = [fromCustomer ? `από ${details.name}` : "", details.ip ? `IP ${details.ip}` : "", details.signature ? "με υπογραφή" : "", details.note ? `«${details.note.slice(0, 200)}»` : ""]
    .filter(Boolean)
    .join(" · ");
  await log(db, orgId, "invoice", id, `quote_${status}`, detail);
  if (fromCustomer) {
    const number = invoiceDisplayNumber(inv);
    await notify(db, {
      orgId,
      type: status === "accepted" ? "quote_accepted" : "quote_rejected",
      title: status === "accepted" ? `Η προσφορά ${number} έγινε αποδεκτή` : `Η προσφορά ${number} απορρίφθηκε`,
      body: `${inv.customerName || "Πελάτης"} · ${details.name}${details.note ? ` · «${details.note.slice(0, 160)}»` : ""}`,
      link: `/invoices/${id}`,
    });
  }
  if (status === "accepted") await dispatchWebhooks(db, orgId, "quote.accepted", { quoteId: id, customerName: inv.customerName, totalGrossValue: inv.totalGrossValue, acceptedByName: details.name ?? null });
}

/** Μετατροπή προσφοράς σε πρόχειρο τιμολόγιο της επιλεγμένης σειράς. */
export async function convertQuote(db: Db, org: Organization, quoteId: string, targetSeriesId: string) {
  const quote = await getInvoiceWithLines(db, org.id, quoteId);
  if (!quote) throw new Error("Η προσφορά δεν βρέθηκε.");
  if (getDocumentType(quote.invoiceType).kind !== "quote") throw new Error("Το παραστατικό δεν είναι προσφορά.");
  if (quote.status === "draft") throw new Error("Εκδώστε πρώτα την προσφορά.");
  if (quote.status === "converted") throw new Error("Η προσφορά έχει ήδη μετατραπεί.");
  const target = await db.query.series.findFirst({ where: and(eq(series.id, targetSeriesId), eq(series.orgId, org.id)) });
  if (!target) throw new Error("Η σειρά προορισμού δεν βρέθηκε.");
  const targetType = getDocumentType(target.invoiceType);
  if (targetType.kind === "quote") throw new Error("Επιλέξτε σειρά τιμολογίου ή δελτίου.");
  if (targetType.retail !== false && !quote.customerId) throw new Error("Απαιτείται πελάτης.");

  const today = businessDate();
  const customer = quote.customerId ? await db.query.customers.findFirst({ where: eq(customers.id, quote.customerId) }) : null;
  const terms = customer?.paymentTermsDays ?? org.defaultPaymentTermsDays;
  const newId = await saveDraft(db, org, {
    customerId: quote.customerId,
    seriesId: target.id,
    issueDate: today,
    dueDate: new Date(Date.now() + terms * 86_400_000).toISOString().slice(0, 10),
    currency: quote.currency,
    exchangeRate: quote.exchangeRate,
    paymentMethod: quote.paymentMethod,
    notes: quote.notes ?? "",
    correlatedInvoiceId: null,
    sourceQuoteId: quote.id,
    movePurpose: targetType.kind === "delivery" ? 1 : null,
    dispatchDate: today,
    lines: linesToDraft(quote.lines).map((l) => ({
      ...l,
      classificationCategory: l.productId ? l.classificationCategory : targetType.defaultClassificationCategory,
      classificationType: l.productId ? l.classificationType : targetType.defaultClassificationType,
    })),
  });
  await db.update(invoices).set({ status: "converted", updatedAt: now() }).where(eq(invoices.id, quote.id));
  await log(db, org.id, "invoice", quote.id, "quote_converted", newId);
  return newId;
}

export async function recordPayment(
  db: Db,
  org: Organization,
  input: { invoiceId: string; amount: number; paidAt: string; method: number; reference: string; accountId?: string | null },
) {
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, input.invoiceId), eq(invoices.orgId, org.id)) });
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (inv.status === "draft" || inv.status === "cancelled") throw new Error("Δεν επιτρέπεται είσπραξη σε πρόχειρο ή ακυρωμένο παραστατικό.");
  if (getDocumentType(inv.invoiceType).kind !== "invoice") throw new Error("Εισπράξεις καταχωρούνται μόνο σε φορολογικά παραστατικά.");
  if (input.amount <= 0) throw new Error("Το ποσό πρέπει να είναι θετικό.");
  const remaining = round2(inv.totalGrossValue - inv.paidAmount);
  if (input.amount > remaining + 0.005) throw new Error(`Το ποσό υπερβαίνει το υπόλοιπο (${remaining.toFixed(2)}).`);

  const accountId = input.accountId ?? (await defaultAccountFor(db, org.id, input.method));
  await db.insert(payments).values({
    id: randomUUID(),
    orgId: org.id,
    invoiceId: inv.id,
    amount: round2(input.amount),
    paidAt: input.paidAt,
    method: input.method,
    reference: input.reference,
    accountId,
    createdAt: now(),
  });
  const paid = round2(inv.paidAmount + input.amount);
  const status = paid >= inv.totalGrossValue - 0.005 ? "paid" : "partially_paid";
  await db.update(invoices).set({ paidAmount: paid, status, updatedAt: now() }).where(eq(invoices.id, inv.id));
  await log(db, org.id, "invoice", inv.id, "payment", `${input.amount.toFixed(2)} ${inv.currency}`);
  await dispatchWebhooks(db, org.id, "payment.recorded", { invoiceId: inv.id, amount: round2(input.amount), paidAt: input.paidAt, status });
}

export async function listPaymentsForInvoice(db: Db, invoiceId: string) {
  return db.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(desc(payments.paidAt));
}

export async function invoicesForCustomer(db: Db, orgId: string, customerId: string) {
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.customerId, customerId)))
    .orderBy(desc(invoices.issueDate));
}

export async function invoicesByIds(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(invoices).where(inArray(invoices.id, ids));
}

/** Συγκεντρωτικά στοιχεία για το dashboard. */
export async function dashboardStats(db: Db, orgId: string) {
  const all = (await db.select().from(invoices).where(eq(invoices.orgId, orgId))).filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.expenseSide;
  });
  const nowDate = new Date();
  const today = nowDate.toISOString().slice(0, 10);
  const monthKey = nowDate.toISOString().slice(0, 7);
  const active = all.filter((i) => i.status !== "draft" && i.status !== "cancelled");

  const signed = (i: Invoice) => (getDocumentType(i.invoiceType).credit ? -1 : 1);
  const monthly = active.filter((i) => i.issueDate.startsWith(monthKey));
  const revenueMonth = round2(monthly.reduce((s, i) => s + signed(i) * i.totalNetValue, 0));
  const vatMonth = round2(monthly.reduce((s, i) => s + signed(i) * i.totalVatAmount, 0));
  const outstanding = round2(
    active.filter((i) => !getDocumentType(i.invoiceType).credit).reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0),
  );
  const overdue = active.filter(
    (i) => i.dueDate && i.status !== "paid" && i.dueDate < today && !getDocumentType(i.invoiceType).credit,
  );
  const overdueAmount = round2(overdue.reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0));
  const pendingMyData = active.filter((i) => i.mydataStatus !== "sent" && i.mydataStatus !== "cancelled");

  // Έσοδα / έξοδα / εισπράξεις ανά μήνα (τελευταίοι 12 μήνες)
  const firstMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - 11, 1);
  const fromKey = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const [pays, exps] = await Promise.all([
    db.select({ paidAt: payments.paidAt, amount: payments.amount, invoiceId: payments.invoiceId }).from(payments).where(and(eq(payments.orgId, orgId), gte(payments.paidAt, fromKey))),
    db.select({ issueDate: expenses.issueDate, netValue: expenses.netValue, status: expenses.status }).from(expenses).where(and(eq(expenses.orgId, orgId), gte(expenses.issueDate, fromKey))),
  ]);
  const creditIds = new Set(all.filter((i) => getDocumentType(i.invoiceType).credit).map((i) => i.id));
  const months: { key: string; label: string; net: number; vat: number; collected: number; expenses: number }[] = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("el-GR", { month: "short", ...(k === 11 || d.getMonth() === 0 ? { year: "2-digit" } : {}) });
    const inMonth = active.filter((i) => i.issueDate.startsWith(key));
    months.push({
      key,
      label,
      net: round2(inMonth.reduce((s, i) => s + signed(i) * i.totalNetValue, 0)),
      vat: round2(inMonth.reduce((s, i) => s + signed(i) * i.totalVatAmount, 0)),
      collected: round2(pays.filter((p) => p.paidAt.startsWith(key)).reduce((s, p) => s + (creditIds.has(p.invoiceId) ? -p.amount : p.amount), 0)),
      expenses: round2(exps.filter((e) => e.issueDate.startsWith(key) && e.status !== "rejected").reduce((s, e) => s + e.netValue, 0)),
    });
  }

  return {
    revenueMonth,
    vatMonth,
    outstanding,
    overdueCount: overdue.length,
    overdueAmount,
    pendingMyDataCount: pendingMyData.length,
    invoicesThisMonth: monthly.length,
    drafts: all.filter((i) => i.status === "draft").length,
    months,
  };
}
