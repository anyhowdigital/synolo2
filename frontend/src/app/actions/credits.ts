"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { formatMoney } from "@/lib/invoice/totals";
import { addAdvance, addManualCredit, applyCredit, deleteCreditEntry, offsetTargets, refundCredit } from "@/lib/services/credits";
import type { ActionResult } from "./customers";

function revalidate(customerId: string, invoiceId?: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/invoices", "layout");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/banking", "layout");
  revalidatePath("/dashboard");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const moneyInSchema = z.object({
  customerId: z.string().min(1),
  amount: z.coerce.number().positive("Το ποσό πρέπει να είναι θετικό."),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
  method: z.coerce.number().int().min(1).max(8).default(1),
  accountId: z.string().trim().optional(),
  reference: z.string().trim().max(200).default(""),
  note: z.string().trim().max(300).default(""),
});

export async function addAdvanceAction(input: z.input<typeof moneyInSchema>): Promise<ActionResult> {
  const parsed = moneyInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const en = await addAdvance(db, ctx.org.id, { ...parsed.data, accountId: parsed.data.accountId || null });
    revalidate(parsed.data.customerId);
    return { ok: true, id: en.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function refundCreditAction(input: z.input<typeof moneyInSchema>): Promise<ActionResult> {
  const parsed = moneyInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const en = await refundCredit(db, ctx.org.id, { ...parsed.data, accountId: parsed.data.accountId || null });
    revalidate(parsed.data.customerId);
    return { ok: true, id: en.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const manualSchema = z.object({
  customerId: z.string().min(1),
  amount: z.coerce.number().refine((v) => v !== 0 && Number.isFinite(v), "Το ποσό δεν μπορεί να είναι 0."),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
  note: z.string().trim().max(300).default(""),
});

export async function addManualCreditAction(input: z.input<typeof manualSchema>): Promise<ActionResult> {
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const en = await addManualCredit(db, ctx.org.id, parsed.data);
    revalidate(parsed.data.customerId);
    return { ok: true, id: en.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const applySchema = z.object({
  customerId: z.string().min(1),
  invoiceId: z.string().min(1, "Επιλέξτε παραστατικό."),
  amount: z.coerce.number().positive("Το ποσό πρέπει να είναι θετικό."),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
  sourceCreditNoteId: z.string().trim().optional(),
  note: z.string().trim().max(300).default(""),
});

export async function applyCreditAction(input: z.input<typeof applySchema>): Promise<ActionResult> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const res = await applyCredit(db, ctx.org.id, { ...parsed.data, sourceCreditNoteId: parsed.data.sourceCreditNoteId || null });
    revalidate(parsed.data.customerId, parsed.data.invoiceId);
    return { ok: true, warning: `${formatMoney(res.applied)} από ${res.parts.map((p) => p.label).join(", ")}${res.invoiceStatus === "paid" ? " – το παραστατικό εξοφλήθηκε." : "."}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteCreditEntryAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const en = await deleteCreditEntry(db, ctx.org.id, id);
    revalidate(en.customerId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function offsetTargetsAction(customerId: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false as const, error };
  return { ok: true as const, targets: await offsetTargets(db, ctx.org.id, customerId) };
}
