"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { customers, invoices, recurringTemplates } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { audit } from "@/lib/services/audit";
import { advance, runTemplate } from "@/lib/services/recurring";
import { emailPortalLink, ensurePortalToken } from "@/lib/services/portal";
import { chargeSubscriptionInvoice, createSaveCardSession, prorate } from "@/lib/payments/subscriptions";
import { round2 } from "@/lib/invoice/totals";
import type { RecurringInterval } from "@/lib/services/recurring-labels";
import type { InvoiceLineDraft } from "@/lib/services/invoices";

export type SubResult = { ok: true; message?: string } | { ok: false; error: string };

/** Στέλνει στον πελάτη σύνδεσμο portal για να αποθηκεύσει κάρτα (Stripe setup mode). */
export async function sendSaveCardLinkAction(customerId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.orgId, ctx.org.id)) });
  if (!customer) return { ok: false, error: "Δεν βρέθηκε ο πελάτης." };
  try {
    const token = await ensurePortalToken(db, customer);
    const url = await createSaveCardSession(db, ctx.org, customer, token);
    if (customer.email) await emailPortalLink(db, ctx.org, customer, { message: "Αποθηκεύστε κάρτα στη σελίδα πελάτη για αυτόματη πληρωμή των συνδρομών σας." }).catch(() => undefined);
    await audit(db, ctx.org.id, "customer", customer.id, "card_link_sent", customer.email || "", await resolveActor(db));
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία δημιουργίας συνδέσμου." };
  }
}

export async function removeSavedCardAction(customerId: string): Promise<SubResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  await db
    .update(customers)
    .set({ stripePaymentMethodId: null, cardBrand: "", cardLast4: "", cardSavedAt: null })
    .where(and(eq(customers.id, customerId), eq(customers.orgId, ctx.org.id)));
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/recurring");
  return { ok: true, message: "Η κάρτα αφαιρέθηκε." };
}

/** Άμεση εκτέλεση συνδρομής: έκδοση παραστατικού + χρέωση κάρτας. */
export async function runSubscriptionNowAction(templateId: string): Promise<SubResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const t = await db.query.recurringTemplates.findFirst({ where: and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, ctx.org.id)) });
  if (!t) return { ok: false, error: "Δεν βρέθηκε η συνδρομή." };
  try {
    const r = await runTemplate(db, ctx.org, t);
    revalidatePath("/recurring");
    revalidatePath("/invoices");
    return { ok: true, message: `Εκδόθηκε παραστατικό${t.autoCharge ? " και επιχειρήθηκε χρέωση κάρτας" : ""}.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία." };
  }
}

/** Επανάληψη χρέωσης για ανεξόφλητο παραστατικό συνδρομής (dunning retry). */
export async function retryChargeAction(templateId: string, invoiceId: string): Promise<SubResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const res = await chargeSubscriptionInvoice(db, ctx.org, templateId, invoiceId);
  revalidatePath("/recurring");
  revalidatePath(`/invoices/${invoiceId}`);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: `Χρεώθηκε ${res.amount.toFixed(2)}€.` };
}

export interface ProrationPreview {
  remainingDays: number;
  totalDays: number;
  unusedCredit: number;
  newCharge: number;
  difference: number;
}

/** Προεπισκόπηση αναλογικού υπολογισμού για αλλαγή τιμής συνδρομής μέσα στην περίοδο. */
export async function previewProrationAction(templateId: string, newNet: number): Promise<{ ok: true; preview: ProrationPreview; currentNet: number } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  const t = await db.query.recurringTemplates.findFirst({ where: and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, ctx.org.id)) });
  if (!t) return { ok: false, error: "Δεν βρέθηκε η συνδρομή." };
  const lines = JSON.parse(t.linesJson) as InvoiceLineDraft[];
  const currentNet = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 - (l.discountPercent ?? 0) / 100), 0));
  const periodStart = t.periodStart ?? t.lastRunAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const periodEnd = advance(periodStart, t.interval as RecurringInterval);
  const preview = prorate({ currentNet, newNet, periodStart, periodEnd, changeDate: new Date().toISOString().slice(0, 10) });
  return { ok: true, preview, currentNet };
}

/**
 * Αλλαγή πλάνου με αναλογικό υπολογισμό: ενημερώνει την τιμή της συνδρομής και εκδίδει
 * παραστατικό διαφοράς (χρέωση) ή πιστωτικό σημείωμα ως έκπτωση για τον υπόλοιπο χρόνο.
 */
export async function changePlanAction(templateId: string, newNet: number, description: string): Promise<SubResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  if (!(newNet >= 0)) return { ok: false, error: "Μη έγκυρη νέα τιμή." };
  const org = ctx.org;
  const t = await db.query.recurringTemplates.findFirst({ where: and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, org.id)) });
  if (!t) return { ok: false, error: "Δεν βρέθηκε η συνδρομή." };

  const lines = JSON.parse(t.linesJson) as InvoiceLineDraft[];
  const first = lines[0];
  if (!first) return { ok: false, error: "Η συνδρομή δεν έχει γραμμές." };
  const currentNet = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 - (l.discountPercent ?? 0) / 100), 0));
  const periodStart = t.periodStart ?? t.lastRunAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const periodEnd = advance(periodStart, t.interval as RecurringInterval);
  const today = new Date().toISOString().slice(0, 10);
  const p = prorate({ currentNet, newNet, periodStart, periodEnd, changeDate: today });

  // Νέα τιμή στη συνδρομή: μία γραμμή με τη νέα καθαρή αξία.
  const newLines: InvoiceLineDraft[] = [{ ...first, description: description || first.description, quantity: 1, unitPrice: newNet, discountPercent: 0 }];
  await db.update(recurringTemplates).set({ linesJson: JSON.stringify(newLines) }).where(eq(recurringTemplates.id, templateId));

  let note = `Νέα τιμή ${newNet.toFixed(2)}€/περίοδο. Απομένουν ${p.remainingDays} από ${p.totalDays} ημέρες.`;
  if (Math.abs(p.difference) >= 0.01) {
    const { saveDraft, issueInvoice } = await import("@/lib/services/invoices");
    const isCharge = p.difference > 0;
    const amount = Math.abs(p.difference);
    let seriesId = t.seriesId;
    let correlatedInvoiceId: string | null = null;
    if (!isCharge) {
      // Η πίστωση πρέπει να εκδοθεί σε σειρά πιστωτικού (μειώνει τα έσοδα) – όχι σε σειρά τιμολογίου.
      const { series, invoices: invoicesTable } = await import("@/db/schema");
      const { getDocumentType } = await import("@/lib/greek/document-types");
      const rows = await db.select().from(series).where(and(eq(series.orgId, org.id), eq(series.active, true)));
      const creditSeries = rows.find((s) => getDocumentType(s.invoiceType).credit && !getDocumentType(s.invoiceType).requiresCorrelation) ?? rows.find((s) => getDocumentType(s.invoiceType).credit);
      if (!creditSeries) return { ok: false, error: "Για αναλογική πίστωση χρειάζεται σειρά πιστωτικού τιμολογίου. Δημιουργήστε μία στις Ρυθμίσεις → Σειρές (π.χ. ΠΤ, τύπος 5.2)." };
      seriesId = creditSeries.id;
      if (getDocumentType(creditSeries.invoiceType).requiresCorrelation) {
        const last = await db.query.invoices.findFirst({
          where: and(eq(invoicesTable.orgId, org.id), eq(invoicesTable.customerId, t.customerId), eq(invoicesTable.status, "issued")),
          orderBy: (i, { desc }) => [desc(i.issueDate), desc(i.createdAt)],
        });
        if (!last) return { ok: false, error: "Δεν βρέθηκε εκδομένο τιμολόγιο του πελάτη για να συσχετιστεί το πιστωτικό." };
        correlatedInvoiceId = last.id;
      }
    }
    const invoiceId = await saveDraft(db, org, {
      customerId: t.customerId,
      seriesId,
      issueDate: today,
      dueDate: today,
      currency: "EUR",
      paymentMethod: t.paymentMethod,
      notes: `${isCharge ? "Αναλογική χρέωση" : "Αναλογική πίστωση"} αλλαγής πλάνου «${t.name}» (${p.remainingDays}/${p.totalDays} ημέρες).`,
      correlatedInvoiceId,
      recurringTemplateId: t.id,
      lines: [{ ...first, description: `${isCharge ? "Αναλογική διαφορά συνδρομής" : "Αναλογική έκπτωση συνδρομής"} – ${description || t.name}`, quantity: 1, unitPrice: amount, discountPercent: 0 }],
    });
    await issueInvoice(db, org, invoiceId);
    note += isCharge ? ` Εκδόθηκε παραστατικό διαφοράς ${amount.toFixed(2)}€.` : ` Εκδόθηκε πιστωτικό τιμολόγιο ${amount.toFixed(2)}€ (συμψηφίζεται με τα επόμενα τιμολόγια).`;
    if (isCharge && t.autoCharge) {
      const res = await chargeSubscriptionInvoice(db, org, t.id, invoiceId);
      note += res.ok ? " Η κάρτα χρεώθηκε." : ` Η χρέωση απέτυχε: ${res.error}`;
    }
    revalidatePath(`/invoices/${invoiceId}`);
  }

  await audit(db, org.id, "organization", t.id, "subscription_plan_changed", `${currentNet.toFixed(2)}€ → ${newNet.toFixed(2)}€ · διαφορά ${p.difference.toFixed(2)}€`, await resolveActor(db));
  revalidatePath("/recurring");
  revalidatePath("/invoices");
  return { ok: true, message: note };
}

/** Ανεξόφλητα παραστατικά συνδρομής για dunning retry. */
export async function unpaidSubscriptionInvoicesAction(templateId: string): Promise<{ ok: true; rows: { id: string; label: string; remaining: number }[] } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  const rows = await db.select().from(invoices).where(and(eq(invoices.orgId, ctx.org.id), eq(invoices.recurringTemplateId, templateId)));
  return {
    ok: true,
    rows: rows
      .filter((r) => r.status === "issued" || r.status === "partially_paid")
      .map((r) => ({ id: r.id, label: `${r.seriesCode}-${String(r.number).padStart(4, "0")}`, remaining: round2(r.totalGrossValue - r.paidAmount) }))
      .filter((r) => r.remaining > 0.005),
  };
}
