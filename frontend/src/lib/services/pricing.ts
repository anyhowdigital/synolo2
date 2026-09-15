import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { customers, priceListItems, priceLists, products, type PriceList, type PriceListItem } from "@/db/schema";
import type { PricingList } from "@/lib/pricing/resolve";

const now = () => new Date().toISOString();

export interface PriceListInput {
  id?: string;
  name: string;
  description: string;
  currency: string;
  discountPercent: number;
  isDefault: boolean;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
}

export interface PriceListItemInput {
  id?: string;
  priceListId: string;
  productId: string;
  minQuantity: number;
  unitPrice: number | null;
  discountPercent: number | null;
}

export type PriceListWithStats = PriceList & { itemCount: number; customerCount: number };

export async function listPriceLists(db: Db, orgId: string, opts: { includeInactive?: boolean } = {}): Promise<PriceListWithStats[]> {
  const rows = await db
    .select()
    .from(priceLists)
    .where(opts.includeInactive ? eq(priceLists.orgId, orgId) : and(eq(priceLists.orgId, orgId), eq(priceLists.active, true)))
    .orderBy(asc(priceLists.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [itemCounts, customerCounts] = await Promise.all([
    db
      .select({ id: priceListItems.priceListId, n: sql<number>`count(*)` })
      .from(priceListItems)
      .where(inArray(priceListItems.priceListId, ids))
      .groupBy(priceListItems.priceListId),
    db
      .select({ id: customers.priceListId, n: sql<number>`count(*)` })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), inArray(customers.priceListId, ids)))
      .groupBy(customers.priceListId),
  ]);
  const ic = new Map(itemCounts.map((r) => [r.id, Number(r.n)]));
  const cc = new Map(customerCounts.map((r) => [r.id, Number(r.n)]));
  return rows.map((r) => ({ ...r, itemCount: ic.get(r.id) ?? 0, customerCount: cc.get(r.id) ?? 0 }));
}

export type PriceListItemRow = PriceListItem & { productName: string; productCode: string | null; productPrice: number };

export async function getPriceList(db: Db, orgId: string, id: string) {
  const list = await db.query.priceLists.findFirst({ where: and(eq(priceLists.id, id), eq(priceLists.orgId, orgId)) });
  if (!list) return null;
  const [items, assigned] = await Promise.all([
    db
      .select({
        id: priceListItems.id,
        priceListId: priceListItems.priceListId,
        productId: priceListItems.productId,
        minQuantity: priceListItems.minQuantity,
        unitPrice: priceListItems.unitPrice,
        discountPercent: priceListItems.discountPercent,
        productName: products.name,
        productCode: products.sku,
        productPrice: products.unitPrice,
      })
      .from(priceListItems)
      .innerJoin(products, eq(products.id, priceListItems.productId))
      .where(eq(priceListItems.priceListId, id))
      .orderBy(asc(products.name), asc(priceListItems.minQuantity)),
    db
      .select({ id: customers.id, name: customers.name, discountPercent: customers.discountPercent })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.priceListId, id)))
      .orderBy(asc(customers.name)),
  ]);
  return { list, items: items as PriceListItemRow[], customers: assigned };
}

export async function savePriceList(db: Db, orgId: string, input: PriceListInput) {
  if (input.validFrom && input.validTo && input.validFrom > input.validTo) throw new Error("Η ημερομηνία λήξης είναι πριν την έναρξη.");
  const id = input.id ?? randomUUID();
  if (input.id) {
    const existing = await db.query.priceLists.findFirst({ where: and(eq(priceLists.id, input.id), eq(priceLists.orgId, orgId)) });
    if (!existing) throw new Error("Ο τιμοκατάλογος δεν βρέθηκε.");
  }
  if (input.isDefault) {
    await db.update(priceLists).set({ isDefault: false }).where(and(eq(priceLists.orgId, orgId), eq(priceLists.isDefault, true)));
  }
  const values = {
    name: input.name,
    description: input.description,
    currency: input.currency || "EUR",
    discountPercent: input.discountPercent,
    isDefault: input.isDefault,
    active: input.active,
    validFrom: input.validFrom,
    validTo: input.validTo,
  };
  if (input.id) {
    await db.update(priceLists).set(values).where(eq(priceLists.id, id));
  } else {
    await db.insert(priceLists).values({ id, orgId, ...values, createdAt: now() });
  }
  return id;
}

export async function deletePriceList(db: Db, orgId: string, id: string) {
  const existing = await db.query.priceLists.findFirst({ where: and(eq(priceLists.id, id), eq(priceLists.orgId, orgId)) });
  if (!existing) throw new Error("Ο τιμοκατάλογος δεν βρέθηκε.");
  await db.update(customers).set({ priceListId: null }).where(and(eq(customers.orgId, orgId), eq(customers.priceListId, id)));
  await db.delete(priceListItems).where(eq(priceListItems.priceListId, id));
  await db.delete(priceLists).where(eq(priceLists.id, id));
  return existing;
}

export async function savePriceListItem(db: Db, orgId: string, input: PriceListItemInput) {
  const list = await db.query.priceLists.findFirst({ where: and(eq(priceLists.id, input.priceListId), eq(priceLists.orgId, orgId)) });
  if (!list) throw new Error("Ο τιμοκατάλογος δεν βρέθηκε.");
  const product = await db.query.products.findFirst({ where: and(eq(products.id, input.productId), eq(products.orgId, orgId)) });
  if (!product) throw new Error("Το είδος δεν βρέθηκε.");
  if (input.unitPrice == null && input.discountPercent == null) throw new Error("Ορίστε τιμή ή έκπτωση για τη γραμμή.");
  // Μία γραμμή ανά είδος/ελάχιστη ποσότητα.
  const dup = await db
    .select({ id: priceListItems.id })
    .from(priceListItems)
    .where(and(eq(priceListItems.priceListId, input.priceListId), eq(priceListItems.productId, input.productId), eq(priceListItems.minQuantity, input.minQuantity)));
  const clash = dup.find((d) => d.id !== input.id);
  if (clash) throw new Error(`Υπάρχει ήδη γραμμή για το είδος «${product.name}» από ${input.minQuantity} τεμ.`);
  const values = { productId: input.productId, minQuantity: input.minQuantity, unitPrice: input.unitPrice, discountPercent: input.discountPercent };
  if (input.id) {
    await db.update(priceListItems).set(values).where(and(eq(priceListItems.id, input.id), eq(priceListItems.priceListId, input.priceListId)));
    return input.id;
  }
  const id = randomUUID();
  await db.insert(priceListItems).values({ id, priceListId: input.priceListId, ...values });
  return id;
}

export async function deletePriceListItem(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select({ id: priceListItems.id, priceListId: priceListItems.priceListId })
    .from(priceListItems)
    .innerJoin(priceLists, eq(priceLists.id, priceListItems.priceListId))
    .where(and(eq(priceListItems.id, id), eq(priceLists.orgId, orgId)));
  if (!row) throw new Error("Η γραμμή δεν βρέθηκε.");
  await db.delete(priceListItems).where(eq(priceListItems.id, id));
  return row;
}

/** Όλοι οι ενεργοί τιμοκατάλογοι με τις γραμμές τους – για τον editor παραστατικών. */
export async function pricingLists(db: Db, orgId: string): Promise<PricingList[]> {
  const lists = await db.select().from(priceLists).where(and(eq(priceLists.orgId, orgId), eq(priceLists.active, true))).orderBy(asc(priceLists.name));
  if (!lists.length) return [];
  const items = await db
    .select({ priceListId: priceListItems.priceListId, productId: priceListItems.productId, minQuantity: priceListItems.minQuantity, unitPrice: priceListItems.unitPrice, discountPercent: priceListItems.discountPercent })
    .from(priceListItems)
    .where(
      inArray(
        priceListItems.priceListId,
        lists.map((l) => l.id),
      ),
    );
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    discountPercent: l.discountPercent,
    isDefault: l.isDefault,
    active: l.active,
    validFrom: l.validFrom,
    validTo: l.validTo,
    items: items.filter((i) => i.priceListId === l.id).map(({ productId, minQuantity, unitPrice, discountPercent }) => ({ productId, minQuantity, unitPrice, discountPercent })),
  }));
}
