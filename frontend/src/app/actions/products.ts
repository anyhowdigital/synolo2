"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defsFor, normalizeTags, readCustomFieldValues, serializeTags } from "@/lib/services/custom-fields";
import { getDb } from "@/db";
import { invoiceLines, products } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import type { ActionResult } from "./customers";
import { audit } from "@/lib/services/audit";
import { featureBlockedMessage } from "@/lib/billing/limits";
import { resolveActor } from "@/lib/services/actor";
import { recordMovement } from "@/lib/services/inventory";

const productSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().default(""),
  name: z.string().trim().min(2, "Η περιγραφή είδους είναι υποχρεωτική."),
  description: z.string().trim().default(""),
  kind: z.enum(["product", "service"]),
  unitPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).default(0),
  vatCategory: z.coerce.number().int().min(1).max(8),
  vatExemptionCategory: z.coerce.number().int().nullable().default(null),
  measurementUnit: z.coerce.number().int().min(1).max(7),
  classificationCategory: z.string().min(1),
  classificationType: z.string().min(1),
  trackStock: z.coerce.boolean().default(false),
  stockQuantity: z.coerce.number().default(0),
  reorderLevel: z.coerce.number().default(0),
  active: z.coerce.boolean().default(true),
  category: z.string().trim().max(60).default(""),
  barcode: z.string().trim().max(64).default(""),
  tags: z.string().default("[]").transform((v) => serializeTags(normalizeTags(v))),
});

function formToObject(fd: FormData) {
  const obj: Record<string, unknown> = {};
  fd.forEach((v, k) => {
    if (k.startsWith("cf.")) return;
    obj[k] = v;
  });
  obj.trackStock = fd.get("trackStock") === "on" || fd.get("trackStock") === "true";
  obj.active = fd.get("active") === null ? true : fd.get("active") === "on" || fd.get("active") === "true";
  if (obj.vatExemptionCategory === "" || obj.vatExemptionCategory === "0") obj.vatExemptionCategory = null;
  return obj;
}

export async function saveProduct(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = productSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const data = parsed.data;
  if (data.vatCategory === 7 && !data.vatExemptionCategory) {
    return { ok: false, error: "Για ΦΠΑ 0% απαιτείται αιτία εξαίρεσης." };
  }
  const db = await getDb();
  const { ctx, error: permError } = await requirePermission(db, "write");
  if (permError) return { ok: false, error: permError };
  const org = ctx.org;
  if (data.trackStock) {
    const blocked = featureBlockedMessage(org, "inventory");
    if (blocked) return { ok: false, error: blocked };
  }
  const { id, stockQuantity, ...fields } = data;
  const cf = readCustomFieldValues(formData, defsFor(org.customFieldDefsJson, "product"));
  if (cf.error) return { ok: false, error: cf.error };
  if (fields.barcode) {
    const clash = await db.query.products.findFirst({ where: and(eq(products.orgId, org.id), eq(products.barcode, fields.barcode)), columns: { id: true, name: true } });
    if (clash && clash.id !== id) return { ok: false, error: `Το barcode χρησιμοποιείται ήδη από το είδος «${clash.name}».` };
  }
  const rest = { ...fields, customFieldsJson: JSON.stringify(cf.values) };
  const actor = await resolveActor(db);
  let productId = id;
  // Το απόθεμα δεν γράφεται απευθείας: κάθε αλλαγή ποσότητας περνά από κίνηση αποθήκης (A7).
  if (id) {
    const current = await db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.orgId, org.id)), columns: { stockQuantity: true, trackStock: true } });
    if (!current) return { ok: false, error: "Το είδος δεν βρέθηκε." };
    await db.update(products).set(rest).where(and(eq(products.id, id), eq(products.orgId, org.id)));
    const diff = Math.round((stockQuantity - current.stockQuantity) * 10_000) / 10_000;
    if (rest.trackStock && diff !== 0) {
      await recordMovement(db, org.id, { productId: id, quantity: diff, kind: current.trackStock ? "adjustment" : "opening", unitCost: diff > 0 ? rest.costPrice : null, note: "Από καρτέλα είδους", actor: actor?.name });
    }
  } else {
    productId = randomUUID();
    await db.insert(products).values({ id: productId, orgId: org.id, ...rest, stockQuantity: 0, createdAt: new Date().toISOString() });
    if (rest.trackStock && stockQuantity !== 0) {
      await recordMovement(db, org.id, { productId, quantity: stockQuantity, kind: "opening", unitCost: rest.costPrice || null, note: "Απογραφή έναρξης", actor: actor?.name });
    }
  }
  await audit(db, org.id, "product", productId!, id ? "updated" : "created", rest.name, actor);
  revalidatePath("/products");
  revalidatePath("/inventory", "layout");
  return { ok: true, id: productId };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error: permError } = await requirePermission(db, "write");
  if (permError) return { ok: false, error: permError };
  const org = ctx.org;
  const used = await db.query.invoiceLines.findFirst({ where: eq(invoiceLines.productId, id) });
  if (used) {
    await db.update(products).set({ active: false }).where(and(eq(products.id, id), eq(products.orgId, org.id)));
    revalidatePath("/products");
    return { ok: false, error: "Το είδος χρησιμοποιείται σε παραστατικά και τέθηκε «Ανενεργό» αντί για διαγραφή." };
  }
  await db.delete(products).where(and(eq(products.id, id), eq(products.orgId, org.id)));
  await audit(db, org.id, "product", id, "deleted", "", await resolveActor(db));
  revalidatePath("/products");
  return { ok: true };
}

export async function adjustStock(id: string, delta: number): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error: permError } = await requirePermission(db, "write");
  if (permError) return { ok: false, error: permError };
  const org = ctx.org;
  try {
    const m = await recordMovement(db, org.id, { productId: id, quantity: delta, kind: "adjustment", note: "Γρήγορη διόρθωση", actor: (await resolveActor(db))?.name });
    if (!m) return { ok: false, error: "Το είδος δεν παρακολουθεί απόθεμα." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/products");
  revalidatePath("/inventory", "layout");
  return { ok: true };
}
