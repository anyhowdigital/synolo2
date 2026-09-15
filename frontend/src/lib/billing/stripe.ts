import Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, type Organization } from "@/db/schema";
import { appUrl } from "@/lib/email/mailer";
import { getPlan, type Plan, type PlanId } from "./plans";

export type BillingInterval = "monthly" | "yearly";

export function stripeEnabled() {
  return !!process.env.STRIPE_SECRET_KEY;
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Το Stripe δεν έχει ρυθμιστεί (STRIPE_SECRET_KEY).");
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

function priceCents(plan: Plan, interval: BillingInterval) {
  return Math.round((interval === "monthly" ? plan.monthlyPrice : plan.yearlyPrice) * 100);
}

/**
 * Δημιουργία Stripe Checkout Session συνδρομής. Χρησιμοποιεί ad-hoc price_data ώστε να μην
 * απαιτούνται προ-ρυθμισμένα Price IDs· αν υπάρχουν STRIPE_PRICE_<PLAN>_<INTERVAL> χρησιμοποιούνται αυτά.
 */
export async function createCheckoutSession(db: Db, org: Organization, planId: PlanId, interval: BillingInterval, email: string) {
  const plan = getPlan(planId);
  if (!plan) throw new Error("Άγνωστο πακέτο.");
  const s = stripe();

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ email, name: org.legalName || org.name, metadata: { orgId: org.id, afm: org.afm } });
    customerId = customer.id;
    await db.update(organizations).set({ stripeCustomerId: customerId }).where(eq(organizations.id, org.id));
  }

  const envPrice = process.env[`STRIPE_PRICE_${planId.toUpperCase()}_${interval.toUpperCase()}`];
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = envPrice
    ? { price: envPrice, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: priceCents(plan, interval),
          recurring: { interval: interval === "monthly" ? "month" : "year" },
          product_data: { name: `Σύνολο ERP – ${plan.name}`, description: plan.tagline },
        },
      };

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [lineItem],
    allow_promotion_codes: true,
    automatic_tax: { enabled: false },
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    billing_address_collection: "required",
    locale: "el",
    success_url: appUrl(`/billing?success=1&session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl("/billing?cancelled=1"),
    subscription_data: { metadata: { orgId: org.id, planId, interval } },
    metadata: { orgId: org.id, planId, interval },
  });
  if (!session.url) throw new Error("Το Stripe δεν επέστρεψε URL πληρωμής.");
  return session.url;
}

export async function createPortalSession(org: Organization) {
  if (!org.stripeCustomerId) throw new Error("Δεν υπάρχει πελάτης Stripe για τον οργανισμό.");
  const session = await stripe().billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: appUrl("/billing") });
  return session.url;
}

/** Εφαρμογή κατάστασης συνδρομής στον οργανισμό (κοινό για webhook & mock). */
export async function applySubscription(
  db: Db,
  orgId: string,
  patch: { planId?: PlanId; interval?: BillingInterval; status: "active" | "past_due" | "cancelled" | "trialing"; periodEnd?: string | null; subscriptionId?: string | null; customerId?: string | null },
) {
  await db
    .update(organizations)
    .set({
      ...(patch.planId ? { plan: patch.planId } : {}),
      ...(patch.interval ? { planInterval: patch.interval } : {}),
      planStatus: patch.status,
      currentPeriodEnd: patch.periodEnd ?? null,
      ...(patch.subscriptionId !== undefined ? { stripeSubscriptionId: patch.subscriptionId } : {}),
      ...(patch.customerId ? { stripeCustomerId: patch.customerId } : {}),
      ...(patch.status === "active" ? { trialEndsAt: null } : {}),
    })
    .where(eq(organizations.id, orgId));
}

/** Επεξεργασία Stripe webhook event. Επιστρέφει περιγραφή για logging. */
export async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.kind === "invoice_payment_bulk") {
        const { settleBulkSession } = await import("@/lib/payments/bulk");
        return `bulk_payment ${await settleBulkSession(db, session)}`;
      }
      if (session.metadata?.kind === "save_card") {
        const { storeSavedCard } = await import("@/lib/payments/subscriptions");
        return `save_card ${await storeSavedCard(db, session)}`;
      }
      if (session.metadata?.kind === "invoice_payment") {
        const { settleStripeInvoiceSession } = await import("@/lib/payments/online");
        const outcome = await settleStripeInvoiceSession(db, session);
        return `invoice payment ${outcome} (${session.metadata.invoiceId})`;
      }
      const orgId = session.metadata?.orgId;
      const planId = session.metadata?.planId as PlanId | undefined;
      const interval = (session.metadata?.interval as BillingInterval | undefined) ?? "monthly";
      if (!orgId || !planId) return "ignored: missing metadata";
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      let periodEnd: string | null = null;
      if (subId) {
        const sub = await stripe().subscriptions.retrieve(subId);
        const end = sub.items.data[0]?.current_period_end;
        periodEnd = end ? new Date(end * 1000).toISOString() : null;
      }
      await applySubscription(db, orgId, {
        planId,
        interval,
        status: "active",
        periodEnd,
        subscriptionId: subId,
        customerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      });
      return `activated ${planId} for ${orgId}`;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const orgId = sub.metadata?.orgId;
      if (!orgId) return "ignored: no orgId";
      const end = sub.items.data[0]?.current_period_end;
      const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" || sub.status === "unpaid" ? "past_due" : "cancelled";
      await applySubscription(db, orgId, {
        planId: (sub.metadata?.planId as PlanId | undefined) ?? undefined,
        status,
        periodEnd: end ? new Date(end * 1000).toISOString() : null,
        subscriptionId: status === "cancelled" ? null : sub.id,
      });
      return `subscription ${sub.status} for ${orgId}`;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (!customerId) return "ignored";
      const org = await db.query.organizations.findFirst({ where: eq(organizations.stripeCustomerId, customerId) });
      if (org) await db.update(organizations).set({ planStatus: "past_due" }).where(eq(organizations.id, org.id));
      return `past_due for customer ${customerId}`;
    }
    default:
      return `ignored ${event.type}`;
  }
}
