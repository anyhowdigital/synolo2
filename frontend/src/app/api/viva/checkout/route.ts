import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, organizations } from "@/db/schema";
import { getInvoiceByPublicToken } from "@/lib/services/invoices";

/**
 * Viva Wallet Smart Checkout — δημιουργία order code και redirect στο πραγματικό checkout.
 *
 * Env που απαιτείται:
 *   VIVA_MERCHANT_ID          - Merchant ID από demo/live Viva
 *   VIVA_API_KEY              - API key
 *   VIVA_SOURCE_CODE          - Source code (πχ 1234)
 *   VIVA_BASE_URL             - https://demo-api.vivapayments.com ή https://api.vivapayments.com
 *   VIVA_CHECKOUT_URL         - https://demo.vivapayments.com/web/checkout ή https://www.vivapayments.com/web/checkout
 *
 * Αν λείπουν, επιστρέφουμε mock success ώστε να δουλεύει το UI σε demo mode.
 */
export async function POST(req: Request) {
  let token = "";
  try {
    const body = await req.json();
    token = String(body.token ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });

  const db = await getDb();
  const inv = await getInvoiceByPublicToken(db, token);
  if (!inv) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, inv.orgId) });
  if (!org) return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });

  const remaining = +(inv.totalGrossValue - inv.paidAmount).toFixed(2);
  if (remaining <= 0.005) return NextResponse.json({ ok: false, error: "already_paid" }, { status: 400 });

  const mId = process.env.VIVA_MERCHANT_ID;
  const apiKey = process.env.VIVA_API_KEY;
  const sourceCode = process.env.VIVA_SOURCE_CODE ?? "Default";
  const base = process.env.VIVA_BASE_URL ?? "https://demo-api.vivapayments.com";
  const checkoutBase = process.env.VIVA_CHECKOUT_URL ?? "https://demo.vivapayments.com/web/checkout";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!mId || !apiKey) {
    // Demo mode: no real order created
    return NextResponse.json({
      ok: true,
      mode: "demo",
      checkoutUrl: `${appUrl}/p/${token}/pay?viva=demo`,
      message: "Viva credentials δεν έχουν οριστεί. Ρυθμίστε VIVA_MERCHANT_ID, VIVA_API_KEY και VIVA_SOURCE_CODE.",
    });
  }

  // Πραγματική κλήση Viva Smart Checkout (Basic Auth)
  try {
    const auth = Buffer.from(`${mId}:${apiKey}`).toString("base64");
    const resp = await fetch(`${base}/checkout/v2/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(remaining * 100), // cents
        customerTrns: `${org.name} · ${inv.seriesCode} ${inv.number}`,
        customer: {
          fullName: inv.customerName ?? undefined,
          countryCode: inv.customerCountry ?? "GR",
          requestLang: "el-GR",
        },
        paymentTimeout: 900,
        preauth: false,
        allowRecurring: false,
        maxInstallments: 12,
        paymentNotification: true,
        merchantTrns: inv.id,
        sourceCode,
        tags: ["timologio-cloud", `invoice:${inv.id}`],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return NextResponse.json({ ok: false, error: `Viva ${resp.status}: ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await resp.json();
    const orderCode = data.orderCode ?? data.OrderCode;
    if (!orderCode) return NextResponse.json({ ok: false, error: "no_order_code" }, { status: 502 });
    return NextResponse.json({
      ok: true,
      mode: "live",
      orderCode,
      checkoutUrl: `${checkoutBase}?ref=${orderCode}&color=1E88E5`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
