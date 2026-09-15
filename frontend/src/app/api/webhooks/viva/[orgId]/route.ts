import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { organizations, invoices, payments } from "@/db/schema";
import { recordPayment } from "@/lib/services/invoices";
import { audit } from "@/lib/services/audit";

/**
 * Viva Wallet Transaction webhook.
 * URL configured στο Viva self-care → Webhooks: {APP_URL}/api/webhooks/viva/{orgId}
 * Event codes: 1796 = Transaction Payment Created (success), 1797 = Refund.
 *
 * Env:
 *   VIVA_WEBHOOK_KEY  — Το token verification key από Viva self-care (GET response στο /api/messages/config/token).
 *   VIVA_MERCHANT_ID + VIVA_API_KEY — για ανάκτηση των στοιχείων της συναλλαγής.
 */

async function fetchTransaction(transactionId: string): Promise<any | null> {
  const mId = process.env.VIVA_MERCHANT_ID;
  const key = process.env.VIVA_API_KEY;
  const base = process.env.VIVA_BASE_URL ?? "https://demo-api.vivapayments.com";
  if (!mId || !key) return null;
  try {
    const auth = Buffer.from(`${mId}:${key}`).toString("base64");
    const r = await fetch(`${base}/checkout/v2/transactions/${transactionId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Viva GET verification: επιστρέφει το VIVA_WEBHOOK_KEY ως {"Key": "..."}
export async function GET() {
  const key = process.env.VIVA_WEBHOOK_KEY ?? "";
  if (!key) return NextResponse.json({ Key: "not_configured" });
  return NextResponse.json({ Key: key });
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const evt = await req.json().catch(() => null);
  if (!evt || typeof evt !== "object") return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const eventTypeId = evt.EventTypeId ?? evt.eventTypeId;
  if (eventTypeId !== 1796) {
    // Ignore non-payment events (refunds, chargebacks handled separately)
    return NextResponse.json({ ok: true, ignored: `event_${eventTypeId}` });
  }
  const data = evt.EventData ?? evt.eventData ?? {};
  const transactionId = String(data.TransactionId ?? data.transactionId ?? "");
  const merchantTrns = String(data.MerchantTrns ?? data.merchantTrns ?? "");
  const amount = Number(data.Amount ?? data.amount ?? 0); // Viva sends major units (EUR)
  if (!transactionId || amount <= 0) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });

  const db = await getDb();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });

  // merchantTrns περιέχει το invoice id (από το checkout που δημιουργήσαμε)
  const inv = merchantTrns
    ? await db.query.invoices.findFirst({ where: and(eq(invoices.id, merchantTrns), eq(invoices.orgId, org.id)) })
    : null;
  if (!inv) return NextResponse.json({ ok: false, error: "invoice_not_found", merchantTrns }, { status: 404 });

  // Idempotency: αν υπάρχει payment με reference το transactionId, skip
  const existingPay = await db.select().from(payments).where(and(eq(payments.orgId, org.id), eq(payments.invoiceId, inv.id), eq(payments.reference, transactionId)));
  if (existingPay.length > 0) return NextResponse.json({ ok: true, skipped: "already_recorded", transactionId });

  await recordPayment(db, org, {
    invoiceId: inv.id,
    amount,
    paidAt: new Date().toISOString().slice(0, 10),
    method: 4, // Πληρωμή με κάρτα
    reference: transactionId,
    accountId: null,
  });
  await audit(db, org.id, "invoice", inv.id, "paid", `Viva payment ${transactionId} — ${amount.toFixed(2)}€`, { id: "webhook", name: "webhook:viva", ip: null });
  return NextResponse.json({ ok: true, invoiceId: inv.id, transactionId });
}
