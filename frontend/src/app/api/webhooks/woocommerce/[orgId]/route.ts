import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { organizations, customers, series, invoices } from "@/db/schema";
import { saveDraft, issueInvoice } from "@/lib/services/invoices";
import { audit } from "@/lib/services/audit";

function unauthorized(reason = "unauthorized") {
  return NextResponse.json({ ok: false, error: reason }, { status: 401 });
}

function verifyHmac(secret: string, rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const provided = Buffer.from(signatureHeader.trim(), "base64");
    const digest = Buffer.from(expected, "base64");
    if (provided.length !== digest.length) return false;
    return timingSafeEqual(digest, provided);
  } catch {
    return false;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-webhook-token");
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-wc-webhook-signature");
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET ?? "";
  const tokenExpected = process.env.WOOCOMMERCE_WEBHOOK_TOKEN ?? "";

  // Prefer HMAC verification (production). Fall back to shared token (dev).
  if (secret) {
    if (!verifyHmac(secret, rawBody, signatureHeader)) return unauthorized("bad_signature");
  } else if (tokenExpected) {
    if (token !== tokenExpected) return unauthorized("bad_token");
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const db = await getDb();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });

  const orderId = String(payload.id ?? payload.order_id ?? "");
  const orderNumber = String(payload.number ?? orderId);
  const marker = `[WC#${orderId}]`;
  const existing = await db.select().from(invoices).where(and(eq(invoices.orgId, org.id), eq(invoices.channel, "woocommerce")));
  if (existing.some((i) => i.notes?.includes(marker))) {
    return NextResponse.json({ ok: true, skipped: "already_invoiced", orderId });
  }

  // Early check: no line items → return 400 BEFORE creating customer (avoid orphan records)
  if (!Array.isArray(payload.line_items) || payload.line_items.length === 0) {
    return NextResponse.json({ ok: false, error: "no_line_items" }, { status: 400 });
  }

  const b = payload.billing ?? {};
  const custName = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || b.company || "Πελάτης e-shop";
  let customerId: string | null = null;
  if (b.email) {
    const found = await db.select().from(customers).where(and(eq(customers.orgId, org.id), eq(customers.email, b.email)));
    if (found[0]) customerId = found[0].id;
  }
  if (!customerId) {
    customerId = randomUUID();
    await db.insert(customers).values({
      id: customerId, orgId: org.id,
      kind: b.company ? "company" : "individual", name: custName,
      afm: b.vat_number ?? "", country: b.country ?? "GR",
      email: b.email ?? "", phone: b.phone ?? "",
      address: b.address_1 ?? "", city: b.city ?? "", postalCode: b.postcode ?? "",
      doy: "", activity: "", contactPerson: "", language: "el",
      stage: "customer", tags: '["woocommerce"]',
      customFieldsJson: "{}", notes: `Auto-created from WooCommerce #${orderNumber}`,
      salespersonId: null, paymentTermsDays: null, discountPercent: 0,
      createdAt: new Date().toISOString(),
    });
  }

  const seriesList = await db.select().from(series).where(and(eq(series.orgId, org.id), eq(series.active, true)));
  const chosen = seriesList.find((s) => s.invoiceType === "11.1") ?? seriesList.find((s) => s.invoiceType === "1.1") ?? seriesList[0];
  if (!chosen) return NextResponse.json({ ok: false, error: "no_active_series" }, { status: 400 });

  const lines = ((payload.line_items ?? []) as any[]).map((li) => {
    const qty = Number(li.quantity ?? 1);
    const subtotal = Number(li.subtotal ?? li.total ?? 0);
    const unit = qty > 0 ? subtotal / qty : Number(li.price ?? 0);
    return {
      productId: null, description: li.name ?? "Είδος e-shop",
      quantity: qty, unitPrice: +unit.toFixed(4), discountPercent: 0,
      vatCategory: 1, vatExemptionCategory: null, measurementUnit: 1,
      classificationCategory: "category1_1" as const,
      classificationType: "E3_561_001" as const,
      withholdingCategory: 0, stampDutyCategory: 0,
    };
  });
  if (lines.length === 0) return NextResponse.json({ ok: false, error: "no_line_items" }, { status: 400 });

  const invoiceId = await saveDraft(db, org, {
    customerId, seriesId: chosen.id, issueDate: new Date().toISOString().slice(0, 10),
    dueDate: null, currency: (payload.currency ?? "EUR").toUpperCase(),
    paymentMethod: (payload.payment_method === "cod" ? 3 : 4) as number,
    notes: `Auto-invoice από WooCommerce #${orderNumber} ${marker}`,
    correlatedInvoiceId: null, channel: "woocommerce", lines,
  });
  await issueInvoice(db, org, invoiceId);
  await audit(db, org.id, "invoice", invoiceId, "created", `WooCommerce auto-invoice #${orderNumber}`, { id: "webhook", name: "webhook:woocommerce", ip: null });

  return NextResponse.json({ ok: true, invoiceId, orderNumber, auth: secret ? "hmac" : "token" });
}

export async function GET() {
  const secretSet = !!process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  return NextResponse.json({
    ok: true,
    auth: secretSet ? "HMAC SHA256 via x-wc-webhook-signature (WOOCOMMERCE_WEBHOOK_SECRET)" : "Bearer token via ?token= (WOOCOMMERCE_WEBHOOK_TOKEN) — set WOOCOMMERCE_WEBHOOK_SECRET for production HMAC.",
    hint: "POST WooCommerce order.created payload here.",
  });
}
