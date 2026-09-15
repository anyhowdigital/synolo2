"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { invoices, customers, emailOutbox } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";

export type SendResult = { ok: true; queued: boolean } | { ok: false; error: string };

export async function sendDunningEmail(invoiceId: string, subject: string, body: string): Promise<SendResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.orgId, org.id)) });
  if (!inv) return { ok: false, error: "Δεν βρέθηκε το τιμολόγιο." };
  if (!inv.customerId) return { ok: false, error: "Το τιμολόγιο δεν έχει συνδεδεμένο πελάτη." };
  const cust = await db.query.customers.findFirst({ where: and(eq(customers.id, inv.customerId), eq(customers.orgId, org.id)) });
  if (!cust?.email) return { ok: false, error: "Ο πελάτης δεν έχει email." };
  if (!subject.trim() || !body.trim()) return { ok: false, error: "Θέμα και κείμενο υποχρεωτικά." };

  const html = `<table role="presentation" width="100%" style="font-family:Arial,sans-serif"><tr><td style="padding:24px;color:#111"><pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.55;margin:0">${body.replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;")}</pre><p style="margin-top:24px;font-size:12px;color:#888">Απεσταλμένο από ${org.name.replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;")} μέσω Σύνολο ERP. Δεν ζητάμε ποτέ κωδικούς ή στοιχεία κάρτας μέσω email.</p></td></tr></table>`;
  const now = new Date().toISOString();
  // Real send attempt via FastAPI Resend endpoint
  let status = "logged";
  let providerId = "";
  let sendError: string | null = null;
  try {
    const resp = await fetch("http://127.0.0.1:8001/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: cust.email, subject, html }),
    });
    if (resp.ok) {
      status = "sent";
      try { providerId = (await resp.json()).id ?? ""; } catch { /* ignore */ }
    } else { status = "failed"; sendError = (await resp.text()).slice(0, 300); }
  } catch (err) {
    status = "failed";
    sendError = err instanceof Error ? err.message : String(err);
  }
  await db.insert(emailOutbox).values({
    id: randomUUID(),
    orgId: org.id,
    to: cust.email,
    subject,
    html,
    attachments: "[]",
    status,
    error: sendError ?? null,
    relatedEntity: "invoice",
    relatedId: invoiceId,
    providerId,
    providerEvents: "[]",
    sentAt: status === "sent" ? now : null,
    createdAt: now,
  });
  await db.update(invoices).set({ lastReminderAt: now, reminderCount: (inv.reminderCount ?? 0) + 1, emailedAt: now }).where(eq(invoices.id, invoiceId));
  await audit(db, org.id, "invoice", invoiceId, "reminder_sent", `AI dunning email → ${cust.email}`, await resolveActor(db));
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, queued: status === "sent" };
}
