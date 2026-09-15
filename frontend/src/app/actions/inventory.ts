"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { featureBlockedMessage } from "@/lib/billing/limits";
import {
  createStockCount,
  deleteMovement,
  deleteStockCount,
  deleteWarehouse,
  findProductByCode,
  postStockCount,
  recordMovement,
  saveWarehouse,
  setCountLine,
  transferStock,
} from "@/lib/services/inventory";
import type { ActionResult } from "./customers";

function revalidate() {
  revalidatePath("/inventory", "layout");
  revalidatePath("/products");
  revalidatePath("/dashboard");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const warehouseSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Το όνομα αποθήκης είναι υποχρεωτικό."),
  code: z.string().trim().max(16).default(""),
  address: z.string().trim().max(200).default(""),
  isDefault: z.string().optional(),
  active: z.string().optional(),
});

export async function saveWarehouseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = warehouseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const blocked = featureBlockedMessage(ctx.org, "inventory");
  if (blocked) return { ok: false, error: blocked };
  try {
    const id = await saveWarehouse(db, ctx.org.id, { name: d.name, code: d.code, address: d.address, isDefault: d.isDefault === "on", active: d.active !== "off" }, d.id || undefined);
    await audit(db, ctx.org.id, "warehouse", id, d.id ? "updated" : "created", d.name, await resolveActor(db));
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteWarehouseAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteWarehouse(db, ctx.org.id, id);
    await audit(db, ctx.org.id, "warehouse", id, "deleted", "", await resolveActor(db));
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const movementSchema = z.object({
  productId: z.string().min(1, "Επιλέξτε είδος."),
  warehouseId: z.string().min(1, "Επιλέξτε αποθήκη."),
  kind: z.enum(["in", "out", "adjustment"]),
  quantity: z.coerce.number().refine((n) => n !== 0, "Η ποσότητα δεν μπορεί να είναι 0."),
  unitCost: z.coerce.number().min(0).optional(),
  note: z.string().trim().max(300).default(""),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
});

export async function recordMovementAction(input: z.input<typeof movementSchema>): Promise<ActionResult> {
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const blocked = featureBlockedMessage(ctx.org, "inventory");
  if (blocked) return { ok: false, error: blocked };
  // Εισαγωγή = θετική, εξαγωγή = αρνητική, διόρθωση = όπως δόθηκε (±).
  const qty = d.kind === "in" ? Math.abs(d.quantity) : d.kind === "out" ? -Math.abs(d.quantity) : d.quantity;
  try {
    const m = await recordMovement(db, ctx.org.id, {
      productId: d.productId,
      warehouseId: d.warehouseId,
      quantity: qty,
      unitCost: d.kind === "in" && d.unitCost ? d.unitCost : null,
      kind: d.kind,
      note: d.note,
      movedAt: d.movedAt,
      actor: (await resolveActor(db))?.name,
      force: true,
    });
    if (!m) return { ok: false, error: "Δεν καταχωρήθηκε κίνηση." };
    revalidate();
    return { ok: true, id: m.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const transferSchema = z.object({
  productId: z.string().min(1, "Επιλέξτε είδος."),
  fromWarehouseId: z.string().min(1, "Επιλέξτε αποθήκη προέλευσης."),
  toWarehouseId: z.string().min(1, "Επιλέξτε αποθήκη προορισμού."),
  quantity: z.coerce.number().positive("Η ποσότητα πρέπει να είναι θετική."),
  note: z.string().trim().max(300).default(""),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
});

export async function transferStockAction(input: z.input<typeof transferSchema>): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await transferStock(db, ctx.org.id, { ...d, actor: (await resolveActor(db))?.name });
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteMovementAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteMovement(db, ctx.org.id, id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createStockCountAction(input: { warehouseId: string; countedAt: string; note?: string }): Promise<ActionResult> {
  if (!dateRe.test(input.countedAt)) return { ok: false, error: "Μη έγκυρη ημερομηνία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const blocked = featureBlockedMessage(ctx.org, "inventory");
  if (blocked) return { ok: false, error: blocked };
  try {
    const id = await createStockCount(db, ctx.org.id, { warehouseId: input.warehouseId, countedAt: input.countedAt, note: (input.note ?? "").slice(0, 300) });
    await audit(db, ctx.org.id, "stock_count", id, "created", "", await resolveActor(db));
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setCountLineAction(lineId: string, counted: number | null): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  if (counted != null && !Number.isFinite(counted)) return { ok: false, error: "Μη έγκυρη ποσότητα." };
  try {
    await setCountLine(db, ctx.org.id, lineId, counted);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function postStockCountAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const actor = await resolveActor(db);
    const n = await postStockCount(db, ctx.org.id, id, actor?.name);
    await audit(db, ctx.org.id, "stock_count", id, "posted", `${n} διορθώσεις`, actor);
    revalidate();
    return { ok: true, id: String(n) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteStockCountAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteStockCount(db, ctx.org.id, id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Αναζήτηση είδους από σαρωτή barcode / SKU (χρησιμοποιείται στον editor παραστατικών). */
export async function lookupProductByCodeAction(code: string): Promise<{ ok: true; productId: string; name: string } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  const p = await findProductByCode(db, ctx.org.id, code);
  if (!p) return { ok: false, error: `Δεν βρέθηκε είδος με κωδικό «${code.trim()}».` };
  return { ok: true, productId: p.id, name: p.name };
}
