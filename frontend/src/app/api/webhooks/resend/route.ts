import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";

/**
 * Resend webhook receiver.
 *
 * Resend υπογράφει τα webhook payloads με Svix (`svix-id`, `svix-timestamp`, `svix-signature`).
 * Δεχόμαστε τα σημαντικά events και ενημερώνουμε την ουρά:
 *   - email.sent            → sent
 *   - email.delivered       → delivered
 *   - email.opened          → opened
 *   - email.clicked         → (καταγράφεται στα events, δεν αλλάζει status)
 *   - email.bounced         → bounced
 *   - email.complained      → complained
 *   - email.delivery_delayed→ (μόνο event)
 *   - email.failed          → failed
 *
 * Env: RESEND_WEBHOOK_SECRET (Svix signing secret, format `whsec_...`).
 */

function verifySvix(secret: string, body: string, msgId: string | null, timestamp: string | null, signatureHeader: string | null): boolean {
  if (!secret || !signatureHeader || !msgId || !timestamp) return false;
  try {
    const raw = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret, "utf8");
    const toSign = `${msgId}.${timestamp}.${body}`;
    const expected = createHmac("sha256", raw).update(toSign, "utf8").digest("base64");
    // Header can contain multiple space-separated pairs: "v1,base64sig v1,base64sig2"
    const provided = signatureHeader.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
    for (const s of provided) {
      const b = Buffer.from(s, "base64");
      const e = Buffer.from(expected, "base64");
      if (b.length === e.length && timingSafeEqual(b, e)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const STATUS_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (secret) {
    const ok = verifySvix(secret, raw, req.headers.get("svix-id"), req.headers.get("svix-timestamp"), req.headers.get("svix-signature"));
    if (!ok) return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const type: string = event.type ?? "";
  const data = event.data ?? {};
  const providerId: string = data.email_id ?? data.id ?? "";
  if (!providerId) return NextResponse.json({ ok: true, skipped: "no_provider_id" });

  const db = await getDb();
  const rows = await db.select().from(emailOutbox).where(eq(emailOutbox.providerId, providerId));
  if (rows.length === 0) return NextResponse.json({ ok: true, skipped: "no_matching_email", providerId });

  const newStatus = STATUS_MAP[type];
  for (const row of rows) {
    const events = safeParseArray(row.providerEvents);
    // Cap total serialized size (≤8 KB) to protect against runaway payloads
    events.push({ type, at: new Date().toISOString(), reason: String(data.reason ?? data.bounce?.subType ?? "").slice(0, 200) });
    let trimmed = events.slice(-20);
    while (JSON.stringify(trimmed).length > 8000 && trimmed.length > 1) trimmed = trimmed.slice(1);
    // Ordering: don't downgrade to 'sent' if we already have delivered/opened/bounced
    const preserve = ["bounced", "complained", "failed", "delivered", "opened"];
    const nextStatus = newStatus && !(preserve.includes(row.status) && !preserve.includes(newStatus)) ? newStatus : row.status;
    await db.update(emailOutbox).set({
      status: nextStatus,
      providerEvents: JSON.stringify(trimmed),
      error: type === "email.bounced" || type === "email.failed" ? (data.reason ?? data.bounce?.message ?? row.error ?? "") : row.error,
      sentAt: type === "email.delivered" || type === "email.sent" ? (row.sentAt ?? new Date().toISOString()) : row.sentAt,
    }).where(eq(emailOutbox.id, row.id));
  }

  return NextResponse.json({ ok: true, providerId, event: type, matched: rows.length });
}

function safeParseArray(s: string | null): Array<Record<string, unknown>> {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "Resend webhook receiver. Set RESEND_WEBHOOK_SECRET for signed verification.",
    events_handled: Object.keys(STATUS_MAP),
  });
}
