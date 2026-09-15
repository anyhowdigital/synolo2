import type { Db } from "@/db";
import type { Invoice, Organization } from "@/db/schema";
import type Stripe from "stripe";
import { getDocumentType } from "@/lib/greek/document-types";
import { stripe, stripeEnabled } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/email/mailer";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { onlinePaymentAvailable, remainingAmount, settleOnlinePayment } from "./online";

const MAX_BULK = 20;

/** Μία Stripe Checkout συνεδρία για πολλά ανεξόφλητα παραστατικά του ίδιου πελάτη. */
export async function startBulkCheckout(db: Db, org: Organization, invs: Invoice[], token: string): Promise<string> {
  const payable = invs.filter((i) => onlinePaymentAvailable(org, i)).slice(0, MAX_BULK);
  if (payable.length === 0) throw new Error("Κανένα από τα επιλεγμένα παραστατικά δεν μπορεί να πληρωθεί online.");
  if (!stripeEnabled()) throw new Error("Η online πληρωμή με κάρτα δεν έχει ρυθμιστεί.");
  const currency = payable[0].currency;
  if (payable.some((i) => i.currency !== currency)) throw new Error("Επιλέξτε παραστατικά με το ίδιο νόμισμα.");

  const total = payable.reduce((s, i) => s + remainingAmount(i), 0);
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    locale: "el",
    line_items: payable.map((inv) => ({
      quantity: 1,
      price_data: {
        currency: inv.currency.toLowerCase(),
        unit_amount: Math.round(remainingAmount(inv) * 100),
        product_data: { name: `${getDocumentType(inv.invoiceType).name} ${invoiceDisplayNumber(inv)}`, description: `${org.legalName || org.name} · ${inv.customerName}` },
      },
    })),
    payment_intent_data: {
      description: `${payable.length} παραστατικά – ${org.name}`,
      metadata: { orgId: org.id, kind: "invoice_payment_bulk" },
      ...(org.stripeAccountId ? { transfer_data: { destination: org.stripeAccountId } } : {}),
    },
    success_url: appUrl(`/portal/${token}?paid=${payable.length}&session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl(`/portal/${token}?cancelled=1`),
    metadata: { orgId: org.id, kind: "invoice_payment_bulk", token, invoiceIds: payable.map((i) => i.id).join(","), total: total.toFixed(2) },
  });
  if (!session.url) throw new Error("Το Stripe δεν επέστρεψε URL πληρωμής.");
  return session.url;
}

/** Καταχώρηση εισπράξεων από μαζική συνεδρία – idempotent ανά παραστατικό. */
export async function settleBulkSession(db: Db, session: Stripe.Checkout.Session): Promise<number> {
  if (session.metadata?.kind !== "invoice_payment_bulk" || session.payment_status !== "paid") return 0;
  const orgId = session.metadata.orgId;
  const ids = (session.metadata.invoiceIds ?? "").split(",").filter(Boolean);
  if (!orgId || ids.length === 0) return 0;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id;
  let recorded = 0;
  for (const id of ids) {
    const inv = await db.query.invoices.findFirst({ where: (t, { and, eq }) => and(eq(t.id, id), eq(t.orgId, orgId)) });
    if (!inv) continue;
    const res = await settleOnlinePayment(db, orgId, id, remainingAmount(inv), `Stripe ${pi} · ${invoiceDisplayNumber(inv)}`);
    if (res === "recorded") recorded++;
  }
  return recorded;
}

export async function settleBulkSessionById(db: Db, sessionId: string) {
  if (!stripeEnabled() || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return 0;
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return settleBulkSession(db, session);
}
