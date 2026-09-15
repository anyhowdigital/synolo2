import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, customers, series, invoices } from "@/db/schema";
import { saveDraft, issueInvoice } from "@/lib/services/invoices";
import { audit } from "@/lib/services/audit";

/**
 * Shopify order/create (or order/paid) webhook.
 *
 * URL: POST /api/webhooks/shopify/[orgId]
 * Verification: HMAC SHA256 του body με το shared secret του app (env SHOPIFY_WEBHOOK_SECRET),
 * παραδίδεται στο header `X-Shopify-Hmac-Sha256` (base64).
 *
 * Στο Shopify admin: Settings → Notifications → Webhooks → Create webhook.
 */

function verifyShopifyHmac(secret: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  try {
    const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    const provided = Buffer.from(header, "base64");
    if (provided.length !== digest.length) return false;
    return timingSafeEqual(digest, provided);
  } catch {
    return false;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const raw = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";
  if (secret) {
    if (!verifyShopifyHmac(secret, raw, hmac)) return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let order: any;
  try { order = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const db = await getDb();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });

  const orderId = String(order.id ?? "");
  const orderName = String(order.name ?? orderId);
  const marker = `[SHOP#${orderId}]`;
  const existing = await db.select().from(invoices).where(and(eq(invoices.orgId, org.id), eq(invoices.channel, "shopify")));
  if (existing.some((i) => i.notes?.includes(marker))) {
    return NextResponse.json({ ok: true, skipped: "already_invoiced", orderId });
  }

  // Early check: no line items → return 400 BEFORE creating customer (avoid orphan records)
  if (!Array.isArray(order.line_items) || order.line_items.length === 0) {
    return NextResponse.json({ ok: false, error: "no_line_items" }, { status: 400 });
  }

  const b = order.billing_address ?? order.customer?.default_address ?? {};
  const email = order.email ?? order.contact_email ?? order.customer?.email ?? "";
  const custName = [b.first_name, b.last_name].filter(Boolean).join(" ").trim() || b.company || "Πελάτης Shopify";
  let customerId: string | null = null;
  if (email) {
    const found = await db.select().from(customers).where(and(eq(customers.orgId, org.id), eq(customers.email, email)));
    if (found[0]) customerId = found[0].id;
  }
  if (!customerId) {
    customerId = randomUUID();
    await db.insert(customers).values({
      id: customerId, orgId: org.id,
      kind: b.company ? "company" : "individual", name: custName,
      afm: "", country: b.country_code ?? "GR",
      email, phone: b.phone ?? order.phone ?? "",
      address: [b.address1, b.address2].filter(Boolean).join(" "),
      city: b.city ?? "", postalCode: b.zip ?? "",
      doy: "", activity: "", contactPerson: "", language: "el",
      stage: "customer", tags: '["shopify"]',
      customFieldsJson: "{}", notes: `Auto-created from Shopify ${orderName}`,
      salespersonId: null, paymentTermsDays: null, discountPercent: 0,
      createdAt: new Date().toISOString(),
    });
  }

  const seriesList = await db.select().from(series).where(and(eq(series.orgId, org.id), eq(series.active, true)));
  const chosen = seriesList.find((s) => s.invoiceType === "11.1") ?? seriesList.find((s) => s.invoiceType === "1.1") ?? seriesList[0];
  if (!chosen) return NextResponse.json({ ok: false, error: "no_active_series" }, { status: 400 });

  const lines = ((order.line_items ?? []) as any[]).map((li) => {
    const qty = Number(li.quantity ?? 1);
    const price = Number(li.price ?? 0);
    return {
      productId: null, description: li.title ?? li.name ?? "Είδος",
      quantity: qty, unitPrice: +price.toFixed(4), discountPercent: 0,
      vatCategory: 1, vatExemptionCategory: null, measurementUnit: 1,
      classificationCategory: "category1_1" as const,
      classificationType: "E3_561_001" as const,
      withholdingCategory: 0, stampDutyCategory: 0,
    };
  });
  if (lines.length === 0) return NextResponse.json({ ok: false, error: "no_line_items" }, { status: 400 });

  const invoiceId = await saveDraft(db, org, {
    customerId, seriesId: chosen.id,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: null, currency: (order.currency ?? "EUR").toUpperCase(),
    paymentMethod: 4,
    notes: `Auto-invoice από Shopify ${orderName} ${marker}`,
    correlatedInvoiceId: null, channel: "shopify", lines,
  });
  await issueInvoice(db, org, invoiceId);
  await audit(db, org.id, "invoice", invoiceId, "created", `Shopify auto-invoice ${orderName}`, { id: "webhook", name: "webhook:shopify", ip: null });

  return NextResponse.json({ ok: true, invoiceId, orderName });
}

export async function GET() {
  const secretSet = !!process.env.SHOPIFY_WEBHOOK_SECRET;
  return NextResponse.json({
    ok: true,
    auth: secretSet ? "HMAC SHA256 via x-shopify-hmac-sha256 (SHOPIFY_WEBHOOK_SECRET)" : "⚠ SHOPIFY_WEBHOOK_SECRET δεν έχει οριστεί — για δοκιμές μόνο.",
    hint: "POST Shopify orders/create ή orders/paid payload εδώ.",
  });
}
