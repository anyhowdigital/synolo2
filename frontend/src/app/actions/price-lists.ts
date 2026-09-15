"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { deletePriceList, deletePriceListItem, savePriceList, savePriceListItem } from "@/lib/services/pricing";
import type { ActionResult } from "./customers";

function revalidate(listId?: string) {
  revalidatePath("/price-lists");
  if (listId) revalidatePath(`/price-lists/${listId}`);
  revalidatePath("/customers", "layout");
  revalidatePath("/invoices", "layout");
  revalidatePath("/quotes", "layout");
}

const dateOrEmpty = z
  .string()
  .trim()
  .default("")
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

const listSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Το όνομα τιμοκαταλόγου είναι υποχρεωτικό."),
  description: z.string().trim().max(300).default(""),
  currency: z.string().trim().max(3).default("EUR"),
  discountPercent: z.coerce.number().min(0, "Η έκπτωση δεν μπορεί να είναι αρνητική.").max(100, "Η έκπτωση δεν μπορεί να ξεπερνά το 100%.").default(0),
  isDefault: z.string().optional(),
  active: z.string().optional(),
  validFrom: dateOrEmpty,
  validTo: dateOrEmpty,
});

export async function savePriceListAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = listSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await savePriceList(db, ctx.org.id, {
      id: d.id || undefined,
      name: d.name,
      description: d.description,
      currency: d.currency,
      discountPercent: d.discountPercent,
      isDefault: d.isDefault === "on",
      active: d.active !== "off",
      validFrom: d.validFrom,
      validTo: d.validTo,
    });
    await audit(db, ctx.org.id, "price_list", id, d.id ? "updated" : "created", d.name, await resolveActor(db));
    revalidate(id);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deletePriceListAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const removed = await deletePriceList(db, ctx.org.id, id);
    await audit(db, ctx.org.id, "price_list", id, "deleted", removed.name, await resolveActor(db));
    revalidate(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  })
  .refine((v) => v === null || !Number.isNaN(v), "Μη έγκυρος αριθμός.");

const itemSchema = z.object({
  id: z.string().optional(),
  priceListId: z.string().min(1),
  productId: z.string().min(1, "Επιλέξτε είδος."),
  minQuantity: z.coerce.number().positive("Η ελάχιστη ποσότητα πρέπει να είναι θετική.").default(1),
  unitPrice: optionalNumber.refine((v) => v === null || v >= 0, "Η τιμή δεν μπορεί να είναι αρνητική."),
  discountPercent: optionalNumber.refine((v) => v === null || (v >= 0 && v <= 100), "Η έκπτωση πρέπει να είναι 0–100%."),
});

export async function savePriceListItemAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await savePriceListItem(db, ctx.org.id, { ...d, id: d.id || undefined });
    revalidate(d.priceListId);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deletePriceListItemAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const row = await deletePriceListItem(db, ctx.org.id, id);
    revalidate(row.priceListId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
