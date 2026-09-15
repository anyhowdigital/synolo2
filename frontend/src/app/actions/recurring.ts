"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { recurringTemplates } from "@/db/schema";
import { requireOrg } from "@/lib/services/org";
import { assertFeature } from "@/lib/billing/limits";
import { deleteTemplate, runDueTemplates, runTemplate, saveTemplate, toggleTemplate, type RecurringInterval } from "@/lib/services/recurring";
import type { ActionResult } from "./customers";

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Δώστε όνομα στο πρότυπο."),
  customerId: z.string().min(1, "Επιλέξτε πελάτη."),
  seriesId: z.string().min(1, "Επιλέξτε σειρά."),
  paymentMethod: z.coerce.number().int().min(1).max(8).default(1),
  notes: z.string().default(""),
  interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Μη έγκυρη ημερομηνία."),
  autoIssue: z.string().optional(),
  autoTransmit: z.string().optional(),
  autoEmail: z.string().optional(),
  autoCharge: z.string().optional(),
  linesJson: z.string().min(2, "Προσθέστε γραμμές."),
});

export async function saveTemplateAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  try {
    const lines = JSON.parse(d.linesJson);
    if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: "Προσθέστε τουλάχιστον μία γραμμή." };
    const db = await getDb();
    const org = await requireOrg(db, "write");
    assertFeature(org, "recurring");
    const id = await saveTemplate(
      db,
      org.id,
      {
        name: d.name,
        customerId: d.customerId,
        seriesId: d.seriesId,
        paymentMethod: d.paymentMethod,
        notes: d.notes,
        interval: d.interval as RecurringInterval,
        nextRunAt: d.nextRunAt,
        autoIssue: d.autoIssue === "on",
        autoTransmit: d.autoTransmit === "on",
        autoEmail: d.autoEmail === "on",
        autoCharge: d.autoCharge === "on",
        lines,
      },
      d.id || undefined,
    );
    revalidatePath("/recurring");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function toggleTemplateAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await toggleTemplate(db, org.id, id);
    revalidatePath("/recurring");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await deleteTemplate(db, org.id, id);
    revalidatePath("/recurring");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Άμεση εκτέλεση προτύπου (ανεξάρτητα από την ημερομηνία). */
export async function runTemplateNowAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const t = await db.query.recurringTemplates.findFirst({ where: and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, org.id)) });
    if (!t) return { ok: false, error: "Το πρότυπο δεν βρέθηκε." };
    const r = await runTemplate(db, org, t);
    revalidatePath("/recurring");
    revalidatePath("/invoices");
    return { ok: true, id: r.invoiceId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function runDueNowAction(): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const results = await runDueTemplates(db, org);
    revalidatePath("/recurring");
    revalidatePath("/invoices");
    const created = results.filter((r) => r.invoiceId).length;
    const errors = results.filter((r) => r.error);
    if (errors.length) return { ok: false, error: `Δημιουργήθηκαν ${created}, σφάλματα: ${errors.map((e) => e.error).join(" · ")}` };
    return { ok: true, id: String(created) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
