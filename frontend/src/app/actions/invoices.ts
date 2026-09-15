"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireOrg } from "@/lib/services/org";
import {
  cancelIssuedInvoice,
  convertQuote,
  deleteDraft,
  duplicateInvoice,
  ensurePublicToken,
  getInvoiceWithLines,
  issueInvoice,
  recordPayment,
  saveDraft,
  setQuoteStatus,
  transmitToMyData,
} from "@/lib/services/invoices";
import { emailInvoice, emailPaymentReminder } from "@/lib/services/invoice-email";
import { templateFromInvoice, type RecurringInterval } from "@/lib/services/recurring";
import { getDocumentType } from "@/lib/greek/document-types";
import { getRateToEur } from "@/lib/services/fx";
import { appUrl } from "@/lib/email/mailer";
import type { ActionResult } from "./customers";
import { invoicePayloadSchema, type InvoicePayload } from "@/lib/invoice/schema";
import { defsFor, normalizeTags, serializeTags, validateCustomFieldValues } from "@/lib/services/custom-fields";

function revalidateInvoice(id?: string) {
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/quotes");
  revalidatePath("/dashboard");
}

export async function saveInvoiceAction(payload: InvoicePayload): Promise<ActionResult> {
  const parsed = invoicePayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία.", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])) };
  const data = parsed.data;
  for (const [index, l] of data.lines.entries()) {
    if (l.vatCategory === 7 && !l.vatExemptionCategory) {
      return { ok: false, error: `Η γραμμή «${l.description}» έχει ΦΠΑ 0% και χρειάζεται αιτία εξαίρεσης.`, fieldErrors: { [`lines.${index}.vatExemptionCategory`]: "Επιλέξτε την αιτία εξαίρεσης στις λεπτομέρειες myDATA της γραμμής." } };
    }
  }
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const { tags, customFields, salespersonId, channel, ...rest } = data;
    const cf = validateCustomFieldValues(customFields ?? {}, defsFor(org.customFieldDefsJson, "invoice"));
    if (cf.error) return { ok: false, error: cf.error };
    const id = await saveDraft(
      db,
      org,
      {
        ...rest,
        dueDate: data.dueDate || null,
        tags: serializeTags(normalizeTags(tags ?? [])),
        customFieldsJson: JSON.stringify(cf.values),
        salespersonId: salespersonId === undefined ? undefined : salespersonId && salespersonId !== "none" ? salespersonId : null,
        channel: channel ?? "",
      },
      data.id,
    );
    let warning: string | undefined;
    if (data.issueNow) {
      await issueInvoice(db, org, id);
      const inv = await getInvoiceWithLines(db, org.id, id);
      if (org.autoTransmit && inv && getDocumentType(inv.invoiceType).kind !== "quote") {
        const r = await transmitToMyData(db, org, id);
        if (!r.ok) warning = "Το παραστατικό εκδόθηκε αλλά η αυτόματη διαβίβαση απέτυχε: " + (r.errors ?? []).map((e) => e.message).join(", ");
      }
    }
    revalidateInvoice(id);
    return { ok: true, id, ...(warning ? { warning } : {}) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function issueInvoiceAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await issueInvoice(db, org, id);
    let warning: string | undefined;
    const inv = await getInvoiceWithLines(db, org.id, id);
    if (org.autoTransmit && inv && getDocumentType(inv.invoiceType).kind !== "quote") {
      const r = await transmitToMyData(db, org, id);
      if (!r.ok) warning = "Η αυτόματη διαβίβαση απέτυχε: " + (r.errors ?? []).map((e) => e.message).join(", ");
    }
    revalidateInvoice(id);
    return { ok: true, id, ...(warning ? { warning } : {}) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function transmitInvoiceAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const result = await transmitToMyData(db, org, id);
    revalidateInvoice(id);
    if (!result.ok) {
      return { ok: false, error: (result.errors ?? []).map((e) => `[${e.code}] ${e.message}`).join(" · ") };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function cancelInvoiceAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await cancelIssuedInvoice(db, org, id);
    revalidateInvoice(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteDraftAction(id: string): Promise<ActionResult> {
  let isQuote = false;
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const inv = await getInvoiceWithLines(db, org.id, id);
    isQuote = !!inv && getDocumentType(inv.invoiceType).kind === "quote";
    await deleteDraft(db, org, id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidateInvoice();
  redirect(isQuote ? "/quotes" : "/invoices");
}

export async function duplicateInvoiceAction(id: string): Promise<ActionResult> {
  let newId: string;
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    newId = await duplicateInvoice(db, org, id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidateInvoice();
  redirect(`/invoices/${newId}/edit`);
}

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("Το ποσό πρέπει να είναι θετικό."),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Μη έγκυρη ημερομηνία."),
  method: z.coerce.number().int().min(1).max(8),
  reference: z.string().trim().default(""),
  accountId: z.string().trim().optional(),
});

export async function recordPaymentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await recordPayment(db, org, { ...parsed.data, accountId: parsed.data.accountId || null });
    revalidateInvoice(parsed.data.invoiceId);
    revalidatePath("/banking", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const emailSchema = z.object({
  invoiceId: z.string().min(1),
  to: z.string().trim().email("Μη έγκυρη διεύθυνση email."),
  message: z.string().trim().max(2000).default(""),
});

export async function emailInvoiceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const r = await emailInvoice(db, org, parsed.data.invoiceId, { to: parsed.data.to, message: parsed.data.message });
    revalidateInvoice(parsed.data.invoiceId);
    if (!r.ok) return { ok: false, error: r.error ?? "Αποτυχία αποστολής." };
    return { ok: true, ...(r.delivered ? {} : { warning: "Δεν έχει ρυθμιστεί SMTP – το email καταγράφηκε στο Outbox (Ρυθμίσεις → Email)." }) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendReminderAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const inv = await getInvoiceWithLines(db, org.id, id);
    if (!inv) return { ok: false, error: "Το παραστατικό δεν βρέθηκε." };
    const customer = inv.customerId ? await db.query.customers.findFirst({ where: eq(customers.id, inv.customerId) }) : null;
    if (!customer?.email) return { ok: false, error: "Ο πελάτης δεν έχει email. Συμπληρώστε το στην καρτέλα πελάτη." };
    const r = await emailPaymentReminder(db, org, inv, customer.email);
    revalidateInvoice(id);
    if (!r.ok) return { ok: false, error: r.error ?? "Αποτυχία αποστολής." };
    return { ok: true, ...(r.delivered ? {} : { warning: "Χωρίς SMTP – η υπενθύμιση καταγράφηκε στο Outbox." }) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function publicLinkAction(id: string): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "read");
    const inv = await getInvoiceWithLines(db, org.id, id);
    if (!inv) return { ok: false, error: "Το παραστατικό δεν βρέθηκε." };
    if (inv.status === "draft") return { ok: false, error: "Εκδώστε πρώτα το παραστατικό." };
    const token = await ensurePublicToken(db, inv);
    return { ok: true, id: appUrl(`/p/${token}`) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function quoteStatusAction(id: string, status: "accepted" | "rejected"): Promise<ActionResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    await setQuoteStatus(db, org.id, id, status);
    revalidateInvoice(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function convertQuoteAction(id: string, seriesId: string): Promise<ActionResult> {
  let newId: string;
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    newId = await convertQuote(db, org, id, seriesId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidateInvoice(id);
  redirect(`/invoices/${newId}/edit`);
}

const recurringSchema = z.object({
  invoiceId: z.string().min(1),
  name: z.string().trim().default(""),
  interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextRunAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Μη έγκυρη ημερομηνία."),
});

export async function makeRecurringAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const id = await templateFromInvoice(db, org, parsed.data.invoiceId, parsed.data.interval as RecurringInterval, parsed.data.nextRunAt, parsed.data.name || undefined);
    revalidatePath("/recurring");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Αυτόματη ισοτιμία ΕΚΤ (Frankfurter) για νόμισμα/ημερομηνία – με cache στον πίνακα fx_rates. */
export async function fetchFxRateAction(currency: string, date: string): Promise<{ ok: true; rate: number; eurTo: number; referenceDate: string; source: "cache" | "ecb" } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    await requireOrg(db, "read");
    const q = await getRateToEur(db, currency, date);
    return { ok: true, rate: q.rateToEur, eurTo: q.eurTo, referenceDate: q.referenceDate, source: q.source };
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.name === "TimeoutError" ? "Η υπηρεσία ισοτιμιών δεν απάντησε εγκαίρως." : (err as Error).message };
  }
}
