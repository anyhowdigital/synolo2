"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, payments } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { recordPayment } from "@/lib/services/invoices";
import { audit } from "@/lib/services/audit";
import { revalidatePath } from "next/cache";

export type VivaStatus = {
  ok: true;
  webhookKeyConfigured: boolean;
  merchantConfigured: boolean;
  liveApi: boolean;
  webhookUrl: string;
  mode: "live" | "demo";
  checkoutUrl: string;
};

/**
 * Έλεγχος κατάστασης σύνδεσης Viva Wallet — επιστρέφει αν είναι live ή demo mode
 * και το URL που πρέπει να ορίσει ο χρήστης στο Viva self-care για webhooks.
 */
export async function checkVivaStatus(): Promise<VivaStatus | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const merchantConfigured = !!(process.env.VIVA_MERCHANT_ID && process.env.VIVA_API_KEY);
  const webhookKeyConfigured = !!process.env.VIVA_WEBHOOK_KEY;
  const appUrl = process.env.APP_URL ?? "";
  return {
    ok: true,
    webhookKeyConfigured,
    merchantConfigured,
    liveApi: merchantConfigured,
    webhookUrl: `${appUrl}/api/webhooks/viva/${ctx.org.id}`,
    mode: merchantConfigured ? "live" : "demo",
    checkoutUrl: process.env.VIVA_CHECKOUT_URL ?? "https://demo.vivapayments.com/web/checkout",
  };
}

/**
 * Προσομοίωση webhook Viva: εντοπίζει το πρώτο ανεξόφλητο τιμολόγιο και εκτελεί όλο το flow που
 * κάνει και το πραγματικό webhook (recordPayment + audit). Χρήσιμο για επαλήθευση ότι το URL
 * φτάνει σωστά και ότι τα δικαιώματα βάσης λειτουργούν, πριν πάει σε παραγωγή.
 */
export async function simulateVivaWebhook(invoiceId?: string): Promise<{ ok: true; invoiceId: string; amount: number; transactionId: string } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };

  let target;
  if (invoiceId) {
    target = await db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.org.id)) });
  } else {
    const rows = await db.select().from(invoices).where(eq(invoices.orgId, ctx.org.id));
    target = rows.find((r) => r.status !== "draft" && (r.totalGrossValue - r.paidAmount) > 0.01);
  }
  if (!target) return { ok: false, error: "Δεν βρέθηκε ανεξόφλητο τιμολόγιο για προσομοίωση. Εκδώστε ένα πρώτα." };

  const remaining = +(target.totalGrossValue - target.paidAmount).toFixed(2);
  const transactionId = `SIM-${Date.now()}`;

  // Idempotency check (ίδιο με πραγματικό webhook)
  const existing = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orgId, ctx.org.id), eq(payments.invoiceId, target.id), eq(payments.reference, transactionId)));
  if (existing.length > 0) return { ok: false, error: "Ήδη καταγεγραμμένη προσομοίωση για αυτό το τιμολόγιο." };

  await recordPayment(db, ctx.org, {
    invoiceId: target.id,
    amount: remaining,
    paidAt: new Date().toISOString().slice(0, 10),
    method: 4,
    reference: transactionId,
    accountId: null,
  });
  await audit(db, ctx.org.id, "invoice", target.id, "paid", `[SIM] Viva webhook προσομοίωση ${transactionId} — ${remaining.toFixed(2)}€`, { id: ctx.user.id, name: ctx.user.name, ip: null });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${target.id}`);
  return { ok: true, invoiceId: target.id, amount: remaining, transactionId };
}
