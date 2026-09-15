import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { products, stockCountLines, stockCounts, stockMovements, warehouses, type Product, type StockCount, type StockCountLine, type StockMovement, type Warehouse } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";

export type MovementKind = "in" | "out" | "adjustment" | "transfer" | "sale" | "sale_reversal" | "purchase" | "count" | "opening";

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  in: "Εισαγωγή",
  out: "Εξαγωγή",
  adjustment: "Διόρθωση",
  transfer: "Μεταφορά",
  sale: "Πώληση",
  sale_reversal: "Επιστροφή / ακύρωση",
  purchase: "Αγορά",
  count: "Απογραφή",
  opening: "Απογραφή έναρξης",
};

const now = () => new Date().toISOString();
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/* ------------------------------------------------------------------ αποθήκες */

export async function listWarehouses(db: Db, orgId: string, opts: { includeInactive?: boolean } = {}) {
  const conds = [eq(warehouses.orgId, orgId)];
  if (!opts.includeInactive) conds.push(eq(warehouses.active, true));
  return db.select().from(warehouses).where(and(...conds)).orderBy(desc(warehouses.isDefault), asc(warehouses.name));
}

/** Επιστρέφει την προεπιλεγμένη αποθήκη, δημιουργώντας «Κεντρική αποθήκη» αν δεν υπάρχει καμία. */
export async function ensureDefaultWarehouse(db: Db, orgId: string): Promise<Warehouse> {
  const existing = await db.query.warehouses.findFirst({ where: and(eq(warehouses.orgId, orgId), eq(warehouses.isDefault, true)) });
  if (existing) return existing;
  const any = await db.query.warehouses.findFirst({ where: and(eq(warehouses.orgId, orgId), eq(warehouses.active, true)) });
  if (any) {
    await db.update(warehouses).set({ isDefault: true }).where(eq(warehouses.id, any.id));
    return { ...any, isDefault: true };
  }
  const wh: Warehouse = { id: randomUUID(), orgId, name: "Κεντρική αποθήκη", code: "MAIN", address: "", isDefault: true, active: true, createdAt: now() };
  await db.insert(warehouses).values(wh);
  return wh;
}

/**
 * Είδη που είχαν απόθεμα πριν την εισαγωγή των κινήσεων (A7) παίρνουν μία κίνηση «Απογραφή έναρξης»
 * στην προεπιλεγμένη αποθήκη, ώστε τα υπόλοιπα ανά αποθήκη να συμφωνούν με το σύνολο.
 */
export async function backfillOpeningMovements(db: Db, orgId: string) {
  const tracked = await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.trackStock, true)));
  if (tracked.length === 0) return 0;
  const withMoves = new Set(
    (await db.selectDistinct({ productId: stockMovements.productId }).from(stockMovements).where(eq(stockMovements.orgId, orgId))).map((r) => r.productId),
  );
  const missing = tracked.filter((p) => !withMoves.has(p.id) && p.stockQuantity !== 0);
  if (missing.length === 0) return 0;
  const wh = await ensureDefaultWarehouse(db, orgId);
  await db.insert(stockMovements).values(
    missing.map((p) => ({
      id: randomUUID(),
      orgId,
      productId: p.id,
      warehouseId: wh.id,
      quantity: p.stockQuantity,
      unitCost: p.costPrice || null,
      kind: "opening",
      refType: "manual",
      refId: null,
      note: "Απογραφή έναρξης (υπόλοιπο πριν την παρακολούθηση κινήσεων)",
      movedAt: p.createdAt.slice(0, 10),
      actor: "",
      createdAt: now(),
    })),
  );
  return missing.length;
}

export interface WarehouseInput {
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
  active: boolean;
}

export async function saveWarehouse(db: Db, orgId: string, input: WarehouseInput, id?: string) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Το όνομα αποθήκης είναι υποχρεωτικό.");
  const all = await listWarehouses(db, orgId, { includeInactive: true });
  const dup = all.find((w) => w.name.toLowerCase() === name.toLowerCase() && w.id !== id);
  if (dup) throw new Error("Υπάρχει ήδη αποθήκη με αυτό το όνομα.");
  const makeDefault = input.isDefault || all.filter((w) => w.id !== id && w.active).length === 0;
  if (!input.active && makeDefault) throw new Error("Η προεπιλεγμένη αποθήκη δεν μπορεί να είναι ανενεργή.");
  if (makeDefault) await db.update(warehouses).set({ isDefault: false }).where(eq(warehouses.orgId, orgId));
  const record = { name, code: input.code.trim().toUpperCase(), address: input.address.trim(), isDefault: makeDefault, active: input.active };
  if (id) {
    const current = all.find((w) => w.id === id);
    if (!current) throw new Error("Η αποθήκη δεν βρέθηκε.");
    if (current.isDefault && !makeDefault) {
      // Αν αφαιρείται η προεπιλογή, την παίρνει η πρώτη άλλη ενεργή.
      const next = all.find((w) => w.id !== id && w.active);
      if (next) await db.update(warehouses).set({ isDefault: true }).where(eq(warehouses.id, next.id));
      else record.isDefault = true;
    }
    await db.update(warehouses).set(record).where(and(eq(warehouses.id, id), eq(warehouses.orgId, orgId)));
    return id;
  }
  const newId = randomUUID();
  await db.insert(warehouses).values({ id: newId, orgId, ...record, createdAt: now() });
  return newId;
}

export async function deleteWarehouse(db: Db, orgId: string, id: string) {
  const wh = await db.query.warehouses.findFirst({ where: and(eq(warehouses.id, id), eq(warehouses.orgId, orgId)) });
  if (!wh) throw new Error("Η αποθήκη δεν βρέθηκε.");
  const used = await db.query.stockMovements.findFirst({ where: eq(stockMovements.warehouseId, id), columns: { id: true } });
  if (used) throw new Error("Η αποθήκη έχει κινήσεις – απενεργοποιήστε την αντί για διαγραφή.");
  if (wh.isDefault) {
    const others = await listWarehouses(db, orgId);
    const next = others.find((w) => w.id !== id);
    if (next) await db.update(warehouses).set({ isDefault: true }).where(eq(warehouses.id, next.id));
  }
  await db.delete(warehouses).where(eq(warehouses.id, id));
}

/* ------------------------------------------------------------------ κινήσεις */

export interface MovementInput {
  productId: string;
  warehouseId?: string | null;
  /** Θετική = εισαγωγή, αρνητική = εξαγωγή. */
  quantity: number;
  unitCost?: number | null;
  kind: MovementKind;
  refType?: string;
  refId?: string | null;
  note?: string;
  movedAt?: string;
  actor?: string;
  /** Αν true, δεν ελέγχεται αν το είδος έχει παρακολούθηση αποθέματος. */
  force?: boolean;
}

/**
 * Καταχώρηση κίνησης αποθήκης. Ενημερώνει το συνολικό απόθεμα του είδους και, για εισαγωγές με κόστος,
 * το μέσο σταθμικό κόστος (ΜΣΚ) – η μέθοδος αποτίμησης που προβλέπουν τα ΕΛΠ για ομοειδή αποθέματα.
 */
export async function recordMovement(db: Db, orgId: string, input: MovementInput): Promise<StockMovement | null> {
  const p = await db.query.products.findFirst({ where: and(eq(products.id, input.productId), eq(products.orgId, orgId)) });
  if (!p) throw new Error("Το είδος δεν βρέθηκε.");
  if (!p.trackStock && !input.force) return null;
  const qty = round4(input.quantity);
  if (!qty) return null;
  const warehouseId = input.warehouseId || (await ensureDefaultWarehouse(db, orgId)).id;
  const movement: StockMovement = {
    id: randomUUID(),
    orgId,
    productId: p.id,
    warehouseId,
    quantity: qty,
    unitCost: input.unitCost == null ? null : round4(input.unitCost),
    kind: input.kind,
    refType: input.refType ?? "manual",
    refId: input.refId ?? null,
    note: input.note ?? "",
    movedAt: input.movedAt ?? now().slice(0, 10),
    actor: input.actor ?? "",
    createdAt: now(),
  };
  await db.insert(stockMovements).values(movement);

  const patch: Partial<Product> = { stockQuantity: round4(p.stockQuantity + qty) };
  if (qty > 0 && movement.unitCost != null && movement.unitCost > 0) {
    const oldQty = Math.max(0, p.stockQuantity);
    const oldCost = p.avgCost > 0 ? p.avgCost : p.costPrice;
    patch.avgCost = oldQty + qty > 0 ? round4((oldQty * oldCost + qty * movement.unitCost) / (oldQty + qty)) : movement.unitCost;
  }
  await db.update(products).set(patch).where(eq(products.id, p.id));
  return movement;
}

/** Μεταφορά ποσότητας μεταξύ αποθηκών (δύο κινήσεις με κοινό refId). */
export async function transferStock(db: Db, orgId: string, input: { productId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; note?: string; movedAt?: string; actor?: string }) {
  if (input.fromWarehouseId === input.toWarehouseId) throw new Error("Επιλέξτε διαφορετική αποθήκη προορισμού.");
  if (!(input.quantity > 0)) throw new Error("Η ποσότητα πρέπει να είναι θετική.");
  const refId = randomUUID();
  const base = { productId: input.productId, kind: "transfer" as const, refType: "transfer", refId, note: input.note, movedAt: input.movedAt, actor: input.actor, force: true };
  await recordMovement(db, orgId, { ...base, warehouseId: input.fromWarehouseId, quantity: -input.quantity });
  await recordMovement(db, orgId, { ...base, warehouseId: input.toWarehouseId, quantity: input.quantity });
  return refId;
}

/** Αναίρεση όλων των κινήσεων ενός παραστατικού (π.χ. επανα-αποθήκευση τιμολογίου αγοράς). */
export async function removeMovementsForRef(db: Db, orgId: string, refType: string, refId: string) {
  const rows = await db.select().from(stockMovements).where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.refType, refType), eq(stockMovements.refId, refId)));
  for (const m of rows) {
    await db
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} - ${m.quantity}` })
      .where(eq(products.id, m.productId));
  }
  if (rows.length) await db.delete(stockMovements).where(inArray(stockMovements.id, rows.map((r) => r.id)));
  return rows.length;
}

export async function deleteMovement(db: Db, orgId: string, id: string) {
  const m = await db.query.stockMovements.findFirst({ where: and(eq(stockMovements.id, id), eq(stockMovements.orgId, orgId)) });
  if (!m) throw new Error("Η κίνηση δεν βρέθηκε.");
  if (m.refType === "invoice") throw new Error("Οι κινήσεις από παραστατικά πώλησης αναιρούνται μόνο με ακύρωση του παραστατικού.");
  if (m.refType === "count") throw new Error("Οι κινήσεις απογραφής δεν διαγράφονται.");
  if (m.refType === "transfer" && m.refId) {
    return removeMovementsForRef(db, orgId, "transfer", m.refId);
  }
  await db
    .update(products)
    .set({ stockQuantity: sql`${products.stockQuantity} - ${m.quantity}` })
    .where(eq(products.id, m.productId));
  await db.delete(stockMovements).where(eq(stockMovements.id, id));
  return 1;
}

export interface MovementFilters {
  productId?: string;
  warehouseId?: string;
  kind?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listMovements(db: Db, orgId: string, f: MovementFilters = {}) {
  const conds = [eq(stockMovements.orgId, orgId)];
  if (f.productId) conds.push(eq(stockMovements.productId, f.productId));
  if (f.warehouseId) conds.push(eq(stockMovements.warehouseId, f.warehouseId));
  if (f.kind) conds.push(eq(stockMovements.kind, f.kind));
  if (f.from) conds.push(gte(stockMovements.movedAt, f.from));
  if (f.to) conds.push(lte(stockMovements.movedAt, f.to));
  return db
    .select()
    .from(stockMovements)
    .where(and(...conds))
    .orderBy(desc(stockMovements.movedAt), desc(stockMovements.createdAt))
    .limit(f.limit ?? 500);
}

/** Ποσότητες ανά είδος και αποθήκη από τις κινήσεις. */
export async function stockByWarehouse(db: Db, orgId: string): Promise<Map<string, Map<string, number>>> {
  const rows = await db
    .select({ productId: stockMovements.productId, warehouseId: stockMovements.warehouseId, qty: sql<number>`sum(${stockMovements.quantity})` })
    .from(stockMovements)
    .where(eq(stockMovements.orgId, orgId))
    .groupBy(stockMovements.productId, stockMovements.warehouseId);
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const inner = map.get(r.productId) ?? new Map<string, number>();
    inner.set(r.warehouseId, round4(Number(r.qty)));
    map.set(r.productId, inner);
  }
  return map;
}

/** Απόθεμα ενός είδους σε συγκεκριμένη αποθήκη. */
export async function warehouseQuantity(db: Db, orgId: string, productId: string, warehouseId: string) {
  const [row] = await db
    .select({ qty: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)` })
    .from(stockMovements)
    .where(and(eq(stockMovements.orgId, orgId), eq(stockMovements.productId, productId), eq(stockMovements.warehouseId, warehouseId)));
  return round4(Number(row?.qty ?? 0));
}

/* ------------------------------------------------------------------ αποτίμηση */

export interface ValuationRow {
  product: Product;
  quantity: number;
  unitCost: number;
  value: number;
  salesValue: number;
}

/** Κόστος μονάδας για αποτίμηση: ΜΣΚ αν υπάρχει, αλλιώς τιμή κόστους της καρτέλας. */
export function valuationCost(p: Pick<Product, "avgCost" | "costPrice">) {
  return p.avgCost > 0 ? p.avgCost : p.costPrice;
}

export async function inventoryValuation(db: Db, orgId: string) {
  const rows = await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.trackStock, true))).orderBy(asc(products.name));
  const items: ValuationRow[] = rows.map((p) => {
    const unitCost = valuationCost(p);
    const qty = Math.max(0, p.stockQuantity);
    return { product: p, quantity: p.stockQuantity, unitCost, value: round2(qty * unitCost), salesValue: round2(qty * p.unitPrice) };
  });
  return {
    items,
    totalValue: round2(items.reduce((s, i) => s + i.value, 0)),
    totalSalesValue: round2(items.reduce((s, i) => s + i.salesValue, 0)),
    lowStock: items.filter((i) => i.product.stockQuantity <= i.product.reorderLevel).length,
    negative: items.filter((i) => i.product.stockQuantity < 0).length,
  };
}

/* ------------------------------------------------------------------ απογραφή */

export async function listStockCounts(db: Db, orgId: string) {
  return db.select().from(stockCounts).where(eq(stockCounts.orgId, orgId)).orderBy(desc(stockCounts.countedAt), desc(stockCounts.createdAt));
}

export async function getStockCount(db: Db, orgId: string, id: string): Promise<(StockCount & { lines: StockCountLine[] }) | null> {
  const c = await db.query.stockCounts.findFirst({ where: and(eq(stockCounts.id, id), eq(stockCounts.orgId, orgId)) });
  if (!c) return null;
  const lines = await db.select().from(stockCountLines).where(eq(stockCountLines.countId, id));
  return { ...c, lines };
}

/** Νέα απογραφή: προ-συμπληρώνει όλα τα είδη με παρακολούθηση και την αναμενόμενη ποσότητα της αποθήκης. */
export async function createStockCount(db: Db, orgId: string, input: { warehouseId: string; countedAt: string; note?: string }) {
  const wh = await db.query.warehouses.findFirst({ where: and(eq(warehouses.id, input.warehouseId), eq(warehouses.orgId, orgId)) });
  if (!wh) throw new Error("Η αποθήκη δεν βρέθηκε.");
  const tracked = await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.trackStock, true), eq(products.active, true))).orderBy(asc(products.name));
  if (tracked.length === 0) throw new Error("Δεν υπάρχουν είδη με παρακολούθηση αποθέματος.");
  const byWh = await stockByWarehouse(db, orgId);
  const id = randomUUID();
  await db.insert(stockCounts).values({ id, orgId, warehouseId: wh.id, status: "draft", note: input.note ?? "", countedAt: input.countedAt, postedAt: null, createdAt: now() });
  await db.insert(stockCountLines).values(
    tracked.map((p) => ({ id: randomUUID(), countId: id, productId: p.id, expectedQuantity: byWh.get(p.id)?.get(wh.id) ?? 0, countedQuantity: null })),
  );
  return id;
}

export async function setCountLine(db: Db, orgId: string, lineId: string, counted: number | null) {
  const line = await db.query.stockCountLines.findFirst({ where: eq(stockCountLines.id, lineId) });
  if (!line) throw new Error("Η γραμμή απογραφής δεν βρέθηκε.");
  const c = await db.query.stockCounts.findFirst({ where: and(eq(stockCounts.id, line.countId), eq(stockCounts.orgId, orgId)) });
  if (!c) throw new Error("Η απογραφή δεν βρέθηκε.");
  if (c.status !== "draft") throw new Error("Η απογραφή έχει οριστικοποιηθεί.");
  await db.update(stockCountLines).set({ countedQuantity: counted == null ? null : round4(counted) }).where(eq(stockCountLines.id, lineId));
}

/** Οριστικοποίηση: για κάθε καταμετρημένη γραμμή με διαφορά δημιουργείται διορθωτική κίνηση «Απογραφή». */
export async function postStockCount(db: Db, orgId: string, id: string, actor = "") {
  const c = await getStockCount(db, orgId, id);
  if (!c) throw new Error("Η απογραφή δεν βρέθηκε.");
  if (c.status !== "draft") throw new Error("Η απογραφή έχει ήδη οριστικοποιηθεί.");
  const counted = c.lines.filter((l) => l.countedQuantity != null);
  if (counted.length === 0) throw new Error("Καταμετρήστε τουλάχιστον ένα είδος πριν την οριστικοποίηση.");
  let adjustments = 0;
  for (const l of counted) {
    // Η αναμενόμενη ποσότητα επαναϋπολογίζεται τη στιγμή της οριστικοποίησης (μπορεί να άλλαξε από πωλήσεις).
    const current = await warehouseQuantity(db, orgId, l.productId, c.warehouseId);
    const diff = round4((l.countedQuantity ?? 0) - current);
    await db.update(stockCountLines).set({ expectedQuantity: current }).where(eq(stockCountLines.id, l.id));
    if (!diff) continue;
    await recordMovement(db, orgId, { productId: l.productId, warehouseId: c.warehouseId, quantity: diff, kind: "count", refType: "count", refId: id, note: "Διαφορά απογραφής", movedAt: c.countedAt, actor, force: true });
    adjustments += 1;
  }
  await db.update(stockCounts).set({ status: "posted", postedAt: now() }).where(eq(stockCounts.id, id));
  return adjustments;
}

export async function deleteStockCount(db: Db, orgId: string, id: string) {
  const c = await db.query.stockCounts.findFirst({ where: and(eq(stockCounts.id, id), eq(stockCounts.orgId, orgId)) });
  if (!c) throw new Error("Η απογραφή δεν βρέθηκε.");
  if (c.status !== "draft") throw new Error("Οι οριστικοποιημένες απογραφές δεν διαγράφονται.");
  await db.delete(stockCountLines).where(eq(stockCountLines.countId, id));
  await db.delete(stockCounts).where(eq(stockCounts.id, id));
}

/* ------------------------------------------------------------------ barcode */

/** Αναζήτηση είδους με barcode ή SKU (για σάρωση). */
export async function findProductByCode(db: Db, orgId: string, code: string) {
  const c = code.trim();
  if (!c) return null;
  return (
    (await db.query.products.findFirst({ where: and(eq(products.orgId, orgId), eq(products.barcode, c), eq(products.active, true)) })) ??
    (await db.query.products.findFirst({ where: and(eq(products.orgId, orgId), eq(products.sku, c), eq(products.active, true)) })) ??
    null
  );
}

export type { StockMovement, Warehouse, StockCount, StockCountLine };
