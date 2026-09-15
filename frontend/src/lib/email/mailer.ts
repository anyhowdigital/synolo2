import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { emailOutbox } from "@/db/schema";

export interface MailInput {
  orgId: string;
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string | Buffer; contentType?: string }[];
  relatedEntity?: string;
  relatedId?: string;
}

function transporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export function appUrl(path = "") {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base = process.env.APP_URL || (vercelHost ? `https://${vercelHost}` : `http://127.0.0.1:${process.env.PORT ?? 4870}`);
  return base.replace(/\/$/, "") + path;
}

/**
 * Αποστολή email. Χωρίς SMTP ρυθμίσεις (SMTP_HOST) το μήνυμα καταγράφεται στο Outbox
 * (ορατό από Ρυθμίσεις → Email) ώστε η ροή να δοκιμάζεται πλήρως τοπικά.
 */
export async function sendMail(db: Db, input: MailInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(emailOutbox).values({
    id,
    orgId: input.orgId,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: JSON.stringify((input.attachments ?? []).map((a) => ({ filename: a.filename, size: Buffer.byteLength(a.content) }))),
    status: "queued",
    relatedEntity: input.relatedEntity ?? null,
    relatedId: input.relatedId ?? null,
    createdAt: now,
  });

  const tx = transporter();
  if (!tx) {
    await db.update(emailOutbox).set({ status: "logged", sentAt: now }).where(eq(emailOutbox.id, id));
    return { ok: true, id, delivered: false };
  }
  try {
    await tx.sendMail({
      from: process.env.SMTP_FROM ?? "Σύνολο ERP <no-reply@timologio.local>",
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    });
    await db.update(emailOutbox).set({ status: "sent", sentAt: new Date().toISOString() }).where(eq(emailOutbox.id, id));
    return { ok: true, id, delivered: true };
  } catch (err) {
    await db.update(emailOutbox).set({ status: "failed", error: (err as Error).message }).where(eq(emailOutbox.id, id));
    return { ok: false, id, delivered: false, error: (err as Error).message };
  }
}

export function layoutEmail(title: string, body: string, cta?: { label: string; url: string }, opts: { trackingPixelUrl?: string } = {}) {
  return `<!doctype html><html lang="el"><body style="margin:0;background:#f4f5f7;font-family:Inter,Arial,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px;max-width:560px">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:15px;line-height:1.55">${body}</td></tr>
${cta ? `<tr><td style="padding-top:24px"><a href="${cta.url}" style="background:#3b5bdb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${cta.label}</a></td></tr>` : ""}
<tr><td style="padding-top:28px;font-size:12px;color:#777">Αποστολή από Σύνολο ERP</td></tr>
</table></td></tr></table>${opts.trackingPixelUrl ? `<img src="${opts.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />` : ""}</body></html>`;
}
