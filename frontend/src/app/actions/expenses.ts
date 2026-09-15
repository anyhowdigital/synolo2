"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defsFor, normalizeTags, readCustomFieldValues, serializeTags } from "@/lib/services/custom-fields";
import { getDb } from "@/db";
import { requireOrg } from "@/lib/services/org";
import { deleteExpense, markExpensePaid, saveExpense, syncExpensesFromMyData } from "@/lib/services/expenses";
import { sendExpenseClassification, sendPendingExpenseClassifications } from "@/lib/services/mydata-sync";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import type { ActionResult } from "./customers";

const expenseSchema = z.object({
  id: z.string().optional(),
  supplierName: z.string().trim().min(2, "Η επωνυμία προμηθευτή είναι υποχρεωτική."),
  supplierAfm: z.string().trim().default(""),
  supplierCountry: z.string().trim().length(2).default("GR"),
  invoiceType: z.string().default("1.1"),
  series: z.string().trim().default(""),
  number: z.string().trim().default(""),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Μη έγκυρη ημερομηνία."),
  description: z.string().trim().default(""),
  netValue: z.coerce.number().min(0),
  vatCategory: z.coerce.number().int().min(1).max(8).default(1),
  vatAmount: z.coerce.number().min(0).default(0),
  withheldAmount: z.coerce.number().min(0).default(0),
  classificationCategory: z.string().default(""),
  classificationType: z.string().default(""),
  vatDeductible: z.string().optional(),
  mark: z.string().trim().optional(),
  tags: z.string().default("[]").transform((v) => serializeTags(normalizeTags(v))),
  supplierId: z.string().trim().default(""),
  warehouseId: z.string().trim().default(""),
  dueDate: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Μη έγκυρη προθεσμία."),
  /** JSON πίνακας γραμμών από τον editor – κενός = χωρίς ανάλυση. */
  lines: z
    .string()
    .default("[]")
    .transform((v, ctx) => {
      try {
        const arr = JSON.parse(v || "[]");
        return z
          .array(
            z.object({
              description: z.string().trim().max(500),
              quantity: z.coerce.number().min(0),
              unitPrice: z.coerce.number(),
              vatCategory: z.coerce.number().int().min(1).max(8),
              productId: z.string().nullable().optional(),
            }),
          )
          .max(200)
          .parse(arr);
      } catch {
        ctx.addIssue({ code: "custom", message: "Μη έγκυρες γραμμές." });
        return z.NEVER;
      }
    }),
});

export async function saveExpenseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("cf."))));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  if (d.supplierCountry === "GR" && d.supplierAfm) {
    d.supplierAfm = normalizeAfm(d.supplierAfm);
    // Παραστατικά που ήρθαν από το myDATA (έχουν MARK) φέρουν ΑΦΜ από την ΑΑΔΕ – δεν μπλοκάρουμε τον χαρακτηρισμό.
    if (!d.mark && !isValidAfm(d.supplierAfm)) return { ok: false, error: "Το ΑΦΜ προμηθευτή δεν είναι έγκυρο." };
  }
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const cf = readCustomFieldValues(formData, defsFor(org.customFieldDefsJson, "expense"));
    if (cf.error) return { ok: false, error: cf.error };
    const id = await saveExpense(
      db,
      org.id,
      { ...d, vatDeductible: d.vatDeductible !== "off", mark: d.mark || null, customFieldsJson: JSON.stringify(cf.values), supplierId: d.supplierId || null, warehouseId: d.warehouseId || null, dueDate: d.dueDate || null, lines: d.lines },
      d.id || undefined,
    );
    revalidatePath("/expenses");
    revalidatePath("/suppliers", "layout");
    revalidatePath("/reports");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function markExpensePaidAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await markExpensePaid(db, org.id, id, new Date().toISOString().slice(0, 10));
    revalidatePath("/expenses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await deleteExpense(db, org.id, id);
    revalidatePath("/expenses");
    revalidatePath("/reports");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendExpenseClassificationAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await sendExpenseClassification(db, org, id);
    revalidatePath("/expenses");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendPendingClassificationsAction(from: string, to: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: "Μη έγκυρη περίοδος." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const r = await sendPendingExpenseClassifications(db, org, { from, to });
    revalidatePath("/expenses");
    return { ok: true, id: String(r.sent), warning: r.failed ? `${r.failed} απέτυχαν: ${r.errors.slice(0, 3).join(" · ")}` : undefined };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function syncExpensesAction(from: string, to: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: "Μη έγκυρη περίοδος." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const r = await syncExpensesFromMyData(db, org, { from, to });
    revalidatePath("/expenses");
    revalidatePath("/reports");
    return { ok: true, id: `${r.imported}`, warning: r.skipped ? `${r.skipped} παραστατικά υπήρχαν ήδη.` : undefined };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
