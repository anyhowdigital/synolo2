import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { assertPeriodOpen } from "@/lib/services/periods";
import { customers, expenseLines, expensePayments, expenses, importBatches, invoiceLines, invoices, payments, products, suppliers, type Organization } from "@/db/schema";
import { audit } from "@/lib/services/audit";
import { orgHasFeature } from "@/lib/billing/limits";
import { importCustomers, importProducts, type ImportRef, type ImportResult } from "@/lib/import/importers";
import { importExpenses, importInvoices, importSuppliers } from "@/lib/import/importers-docs";
import { importPayments } from "@/lib/import/importers-payments";

export type ImportKind = "customers" | "products" | "invoices" | "expenses" | "suppliers" | "payments";
export type Actor = { id: string; name: string } | null;

export const IMPORT_ENTITY: Record<ImportKind, string> = { customers: "customer", products: "product", invoices: "invoice", expenses: "expense", suppliers: "supplier", payments: "payment" };
export const IMPORT_PATHS: Record<ImportKind, string> = { customers: "/customers", products: "/products", invoices: "/invoices", expenses: "/expenses", suppliers: "/suppliers", payments: "/banking" };

export interface RunImportOptions {
  updateExisting?: boolean;
  issue?: boolean;
  defaultSeriesCode?: string;
  /** Πηγή (π.χ. "csv", "bridge:softone") — για audit. */
  source?: string;
}

/** Κοινή μηχανή εισαγωγής: τρέχει τον importer, γράφει batch για αναίρεση και audit. */
export async function runImport(db: Db, org: Organization, kind: ImportKind, text: string, fileName: string, opts: RunImportOptions, actor: Actor): Promise<{ result: ImportResult; batchId: string | null }> {
  const updateExisting = !!opts.updateExisting;
  let result: ImportResult;
  switch (kind) {
    case "customers":
      result = await importCustomers(db, org.id, text, { updateExisting });
      break;
    case "products":
      result = await importProducts(db, org.id, text, { updateExisting, inventoryAllowed: orgHasFeature(org, "inventory") });
      break;
    case "invoices":
      result = await importInvoices(db, org, text, { defaultSeriesCode: opts.defaultSeriesCode ?? "", issue: !!opts.issue, createMissingCustomers: updateExisting });
      break;
    case "expenses":
      result = await importExpenses(db, org.id, text, { updateExisting });
      break;
    case "suppliers":
      result = await importSuppliers(db, org.id, text, { updateExisting });
      break;
    case "payments":
      result = await importPayments(db, org, text);
      break;
  }

  let batchId: string | null = null;
  if (result.refs && result.refs.length > 0) {
    batchId = randomUUID();
    await db.insert(importBatches).values({
      id: batchId,
      orgId: org.id,
      kind,
      fileName,
      created: result.created,
      updated: result.updated,
      refsJson: JSON.stringify(result.refs),
      actor: actor?.name ?? "",
      createdAt: new Date().toISOString(),
    });
  }
  await audit(db, org.id, IMPORT_ENTITY[kind], "import", "import", `${opts.source ? `[${opts.source}] ` : ""}${fileName}: ${result.created} νέα, ${result.updated} ενημερώσεις, ${result.skipped} παραλείψεις, ${result.errors.length} σφάλματα`, actor);
  return { result, batchId };
}

export type ImportBatchInfo = { id: string; kind: ImportKind; fileName: string; created: number; createdAt: string; actor: string };

export async function recentBatches(db: Db, orgId: string, kind?: ImportKind, limit = 5): Promise<ImportBatchInfo[]> {
  const rows = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.orgId, orgId), isNull(importBatches.undoneAt), ...(kind ? [eq(importBatches.kind, kind)] : [])))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit);
  return rows.map((b) => ({ id: b.id, kind: b.kind as ImportKind, fileName: b.fileName, created: b.created, createdAt: b.createdAt, actor: b.actor }));
}

/** Αναίρεση εισαγωγής: σβήνει όσα δημιουργήθηκαν και επαναφέρει υπόλοιπα. */
export async function undoImport(db: Db, orgId: string, batchId: string, actor: Actor): Promise<{ ok: true; removed: number; kind: ImportKind } | { ok: false; error: string }> {
  const batch = await db.query.importBatches.findFirst({ where: and(eq(importBatches.id, batchId), eq(importBatches.orgId, orgId)) });
  if (!batch) return { ok: false, error: "Η εισαγωγή δεν βρέθηκε." };
  if (batch.undoneAt) return { ok: false, error: "Η εισαγωγή έχει ήδη αναιρεθεί." };

  const refs = JSON.parse(batch.refsJson) as ImportRef[];
  const ids = (t: ImportRef["t"]) => refs.filter((r) => r.t === t).map((r) => r.id);
  let removed = 0;

  for (const pid of ids("payment")) {
    const p = await db.query.payments.findFirst({ where: and(eq(payments.id, pid), eq(payments.orgId, orgId)) });
    if (!p) continue;
    const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, p.invoiceId) });
    await db.delete(payments).where(eq(payments.id, pid));
    if (inv) {
      const paid = Math.round((inv.paidAmount - p.amount) * 100) / 100;
      await db.update(invoices).set({ paidAmount: Math.max(0, paid), status: paid <= 0.005 ? "issued" : "partially_paid", updatedAt: new Date().toISOString() }).where(eq(invoices.id, inv.id));
    }
    removed++;
  }
  for (const pid of ids("expense_payment")) {
    const p = await db.query.expensePayments.findFirst({ where: and(eq(expensePayments.id, pid), eq(expensePayments.orgId, orgId)) });
    if (!p) continue;
    const ex = await db.query.expenses.findFirst({ where: eq(expenses.id, p.expenseId) });
    await db.delete(expensePayments).where(eq(expensePayments.id, pid));
    if (ex) {
      const paid = Math.round((ex.paidAmount - p.amount) * 100) / 100;
      await db.update(expenses).set({ paidAmount: Math.max(0, paid), status: paid <= 0.005 ? "pending" : "partially_paid", paidAt: null }).where(eq(expenses.id, ex.id));
    }
    removed++;
  }

  const invIds = ids("invoice");
  if (invIds.length) {
    const invRows = await db.select({ id: invoices.id, status: invoices.status, mydataMark: invoices.mydataMark, issueDate: invoices.issueDate }).from(invoices).where(and(eq(invoices.orgId, orgId), inArray(invoices.id, invIds)));
    const blocked = invRows.filter((i) => i.status !== "draft" || i.mydataMark);
    if (blocked.length) throw new Error(`Η αναίρεση απορρίφθηκε: ${blocked.length} παραστατικά έχουν εκδοθεί ή διαβιβαστεί στο myDATA. Τα εκδοθέντα ακυρώνονται μόνο με πιστωτικό/ακύρωση myDATA, δεν διαγράφονται.`);
    for (const i of invRows) await assertPeriodOpen(db, orgId, i.issueDate);
    await db.delete(payments).where(inArray(payments.invoiceId, invIds));
    await db.delete(invoiceLines).where(inArray(invoiceLines.invoiceId, invIds));
    await db.delete(invoices).where(and(eq(invoices.orgId, orgId), inArray(invoices.id, invIds)));
    removed += invIds.length;
  }
  const expIds = ids("expense");
  if (expIds.length) {
    const expRows = await db.select({ id: expenses.id, issueDate: expenses.issueDate, mark: expenses.mark }).from(expenses).where(and(eq(expenses.orgId, orgId), inArray(expenses.id, expIds)));
    if (expRows.some((e) => e.mark)) throw new Error("Η αναίρεση απορρίφθηκε: υπάρχουν δαπάνες με ΜΑΡΚ myDATA.");
    for (const e of expRows) await assertPeriodOpen(db, orgId, e.issueDate);
    await db.delete(expensePayments).where(inArray(expensePayments.expenseId, expIds));
    await db.delete(expenseLines).where(inArray(expenseLines.expenseId, expIds));
    await db.delete(expenses).where(and(eq(expenses.orgId, orgId), inArray(expenses.id, expIds)));
    removed += expIds.length;
  }

  for (const cid of ids("customer")) {
    const used = await db.query.invoices.findFirst({ where: eq(invoices.customerId, cid), columns: { id: true } });
    if (used) continue;
    await db.delete(customers).where(and(eq(customers.id, cid), eq(customers.orgId, orgId)));
    removed++;
  }
  for (const sid of ids("supplier")) {
    const used = await db.query.expenses.findFirst({ where: eq(expenses.supplierId, sid), columns: { id: true } });
    if (used) continue;
    await db.delete(suppliers).where(and(eq(suppliers.id, sid), eq(suppliers.orgId, orgId)));
    removed++;
  }
  for (const pid of ids("product")) {
    const used = await db.query.invoiceLines.findFirst({ where: eq(invoiceLines.productId, pid), columns: { id: true } });
    if (used) continue;
    await db.delete(products).where(and(eq(products.id, pid), eq(products.orgId, orgId)));
    removed++;
  }

  await db.update(importBatches).set({ undoneAt: new Date().toISOString() }).where(eq(importBatches.id, batchId));
  const kind = batch.kind as ImportKind;
  await audit(db, orgId, IMPORT_ENTITY[kind], batchId, "import_undo", `${batch.fileName}: αναίρεση ${removed} εγγραφών`, actor);
  return { ok: true, removed, kind };
}

/** Accept UTF-8 (with/without BOM) and legacy Windows-1253 exports from Greek ERPs. */
export function decodeCsv(buf: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1253").decode(buf);
  } catch {
    return utf8;
  }
}
