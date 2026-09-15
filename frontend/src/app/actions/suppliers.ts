"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatMoney } from "@/lib/invoice/totals";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import { normalizeTags, serializeTags } from "@/lib/services/custom-fields";
import { createSupplierFromExpense, deleteExpensePayment, deleteSupplier, recordExpensePayment, saveSupplier } from "@/lib/services/suppliers";
import type { ActionResult } from "./customers";

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Η επωνυμία είναι υποχρεωτική."),
  afm: z.string().trim().default(""),
  doy: z.string().trim().default(""),
  country: z.string().trim().length(2).default("GR"),
  address: z.string().trim().default(""),
  city: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  contactPerson: z.string().trim().default(""),
  iban: z.string().trim().default(""),
  bankName: z.string().trim().default(""),
  paymentTermsDays: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(0).max(365).nullable()),
  defaultClassificationCategory: z.string().default(""),
  defaultClassificationType: z.string().default(""),
  notes: z.string().trim().max(2000).default(""),
  tags: z.string().default("[]").transform((v) => serializeTags(normalizeTags(v))),
  active: z.string().optional(),
});

export async function saveSupplierAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  if (d.country === "GR" && d.afm) {
    d.afm = normalizeAfm(d.afm);
    if (!isValidAfm(d.afm)) return { ok: false, error: "Το ΑΦΜ δεν είναι έγκυρο." };
  }
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return { ok: false, error: "Μη έγκυρη διεύθυνση email." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await saveSupplier(db, ctx.org.id, { ...d, active: d.active !== "off" }, d.id || undefined);
    await audit(db, ctx.org.id, "supplier", id, d.id ? "updated" : "created", d.name, await resolveActor(db));
    revalidatePath("/suppliers", "layout");
    revalidatePath("/expenses");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteSupplier(db, ctx.org.id, id);
    await audit(db, ctx.org.id, "supplier", id, "deleted", "", await resolveActor(db));
    revalidatePath("/suppliers", "layout");
    revalidatePath("/expenses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createSupplierFromExpenseAction(expenseId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await createSupplierFromExpense(db, ctx.org.id, expenseId);
    await audit(db, ctx.org.id, "supplier", id, "created", "Από παραστατικό αγοράς", await resolveActor(db));
    revalidatePath("/suppliers", "layout");
    revalidatePath("/expenses");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const paymentSchema = z.object({
  expenseId: z.string().min(1),
  amount: z.coerce.number().positive("Το ποσό πρέπει να είναι θετικό."),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Μη έγκυρη ημερομηνία."),
  method: z.coerce.number().int().min(1).max(8).default(1),
  reference: z.string().trim().max(200).default(""),
  accountId: z.string().trim().optional(),
});

export async function recordExpensePaymentAction(input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const res = await recordExpensePayment(db, ctx.org.id, parsed.data.expenseId, { ...parsed.data, accountId: parsed.data.accountId || null });
    await audit(db, ctx.org.id, "expense", parsed.data.expenseId, "payment_recorded", `${parsed.data.amount.toFixed(2)} €`, await resolveActor(db));
    revalidatePath("/expenses");
    revalidatePath("/suppliers", "layout");
    revalidatePath("/banking", "layout");
    revalidatePath("/dashboard");
    return { ok: true, id: res.id, warning: res.fullyPaid ? undefined : `Υπόλοιπο ${formatMoney(res.remaining)}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteExpensePaymentAction(paymentId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteExpensePayment(db, ctx.org.id, paymentId);
    revalidatePath("/expenses");
    revalidatePath("/suppliers", "layout");
    revalidatePath("/banking", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
