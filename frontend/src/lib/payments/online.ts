import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db } from "@/db";
import { invoices, organizations, payments, type Invoice, type Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { orgHasFeature } from "@/lib/billing/limits";
import { stripe, stripeEnabled } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/email/mailer";
import { invoiceDisplayNumber, recordPayment } from "@/lib/services/invoices";
import { notify } from "@/lib/services/notifications";
import { formatMoney } from "@/lib/invoice/totals";

/** myDATA payment method 7 = POS / e-POS – ταιριάζει σε πληρωμές με κάρτα online. */
export const ONLINE_PAYMENT_METHOD = 7;
const STRIPE_CURRENCIES = new Set(["EUR", "USD", "GBP"]);

export function remainingAmount(inv: Invoice) {
  return Math.round((inv.totalGrossValue - inv.paidAmount) * 100) / 100;
}

/** Επιστρέφει null όταν η online πληρωμή είναι διαθέσιμη, αλλιώς τον λόγο (για εσωτερική χρήση). */
export function onlinePaymentBlocked(org: Organization, inv: Invoice): string | null {
  if (!org.onlinePayments) return "disabled";
  if (!orgHasFeature(org, "onlinePayments")) return "plan";
  if (getDocumentType(inv.invoiceType).kind !== "invoice") return "kind";
  if (inv.status === "draft" || inv.status === "cancelled" || inv.status === "paid") return "status";
  if (remainingAmount(inv) < 0.5) return "amount";
  if (!STRIPE_CURRENCIES.has(inv.currency)) return "currency";
  return null;
}

export function onlinePaymentAvailable(org: Organization, inv: Invoice) {
  return onlinePaymentBlocked(org, inv) === null;
}

/**
 * Ξεκινά πληρωμή για δημόσιο παραστατικό. Με Stripe δημιουργείται Checkout Session (mode=payment)·
 * χωρίς κλειδί επιστρέφεται η τοπική σελίδα προσομοίωσης (σαφώς σημασμένη ως demo).
 */
export async function startInvoiceCheckout(db: Db, org: Organization, inv: Invoice, token: string): Promise<string> {
  if (!onlinePaymentAvailable(org, inv)) throw new Error("Η online πληρωμή δεν είναι διαθέσιμη για αυτό το παραστατικό.");
  const amount = remainingAmount(inv);
  if (!stripeEnabled()) return `/p/${token}/pay`;

  const s = stripe();
  const session = await s.checkout.sessions.create({
    mode: "payment",
    locale: "el",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: inv.currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: { name: `${getDocumentType(inv.invoiceType).name} ${invoiceDisplayNumber(inv)}`, description: `${org.legalName || org.name} · ${inv.customerName}` },
        },
      },
    ],
    payment_intent_data: {
      description: `${invoiceDisplayNumber(inv)} – ${org.name}`,
      metadata: { orgId: org.id, invoiceId: inv.id, kind: "invoice_payment" },
      ...(org.stripeAccountId ? { transfer_data: { destination: org.stripeAccountId } } : {}),
    },
    success_url: appUrl(`/p/${token}?paid=1&session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl(`/p/${token}?cancelled=1`),
    metadata: { orgId: org.id, invoiceId: inv.id, kind: "invoice_payment", token },
  });
  if (!session.url) throw new Error("Το Stripe δεν επέστρεψε URL πληρωμής.");
  return session.url;
}

/**
 * Καταχώρηση είσπραξης από επιτυχημένη Stripe συνεδρία. Idempotent: αν υπάρχει ήδη είσπραξη με την ίδια
 * αναφορά (payment_intent) δεν ξαναγράφεται – καλείται τόσο από το webhook όσο και από την success_url.
 */
export async function settleStripeInvoiceSession(db: Db, session: Stripe.Checkout.Session): Promise<"recorded" | "duplicate" | "ignored"> {
  if (session.metadata?.kind !== "invoice_payment" || session.payment_status !== "paid") return "ignored";
  const orgId = session.metadata.orgId;
  const invoiceId = session.metadata.invoiceId;
  if (!orgId || !invoiceId) return "ignored";
  const reference = `Stripe ${typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? session.id}`;
  return settleOnlinePayment(db, orgId, invoiceId, (session.amount_total ?? 0) / 100, reference);
}

export async function settleOnlinePayment(db: Db, orgId: string, invoiceId: string, amount: number, reference: string): Promise<"recorded" | "duplicate" | "ignored"> {
  const [org, inv, existing] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, orgId) }),
    db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)) }),
    db.query.payments.findFirst({ where: and(eq(payments.invoiceId, invoiceId), eq(payments.reference, reference)) }),
  ]);
  if (!org || !inv) return "ignored";
  if (existing) return "duplicate";
  const capped = Math.min(amount, remainingAmount(inv));
  if (capped <= 0) return "ignored";
  await recordPayment(db, org, { invoiceId, amount: capped, paidAt: new Date().toISOString().slice(0, 10), method: ONLINE_PAYMENT_METHOD, reference });
  await notify(db, {
    orgId,
    type: "payment_received",
    title: `Online πληρωμή ${formatMoney(capped, inv.currency)} για ${invoiceDisplayNumber(inv)}`,
    body: `${inv.customerName || "Πελάτης"} · αναφορά ${reference}${capped >= remainingAmount(inv) ? " · το παραστατικό εξοφλήθηκε" : ""}`,
    link: `/invoices/${invoiceId}`,
  });
  return "recorded";
}

/** Επαλήθευση από success_url (fallback όταν δεν έχει ρυθμιστεί webhook). */
export async function settleStripeSessionById(db: Db, sessionId: string) {
  if (!stripeEnabled() || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return "ignored" as const;
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  return settleStripeInvoiceSession(db, session);
}

export function demoPaymentReference() {
  return `DEMO-${randomBytes(4).toString("hex").toUpperCase()}`;
}
