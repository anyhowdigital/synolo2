import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Db } from "@/db";
import { customers, invoices, organizations, payments, recurringTemplates, type Customer, type Invoice, type Organization } from "@/db/schema";
import { stripe, stripeEnabled } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/email/mailer";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { recordPayment } from "@/lib/services/invoices";
import { notify } from "@/lib/services/notifications";
import { round2 } from "@/lib/invoice/totals";
import { ONLINE_PAYMENT_METHOD, remainingAmount } from "./online";

/** Δημιουργεί (ή επαναχρησιμοποιεί) πελάτη Stripe για τον πελάτη του οργανισμού. */
export async function ensureStripeCustomer(db: Db, org: Organization, customer: Customer): Promise<string> {
  if (customer.stripeCustomerId) return customer.stripeCustomerId;
  const created = await stripe().customers.create({
    name: customer.name,
    email: customer.email || undefined,
    metadata: { orgId: org.id, customerId: customer.id, afm: customer.afm ?? "" },
  });
  await db.update(customers).set({ stripeCustomerId: created.id }).where(eq(customers.id, customer.id));
  return created.id;
}

/** Σύνδεσμος Stripe Checkout (mode=setup) για να αποθηκεύσει ο πελάτης κάρτα χωρίς χρέωση. */
export async function createSaveCardSession(db: Db, org: Organization, customer: Customer, portalToken: string): Promise<string> {
  if (!stripeEnabled()) throw new Error("Το Stripe δεν έχει ρυθμιστεί (STRIPE_SECRET_KEY).");
  const stripeCustomerId = await ensureStripeCustomer(db, org, customer);
  const session = await stripe().checkout.sessions.create({
    mode: "setup",
    locale: "el",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    success_url: appUrl(`/portal/${portalToken}?card=saved`),
    cancel_url: appUrl(`/portal/${portalToken}?card=cancelled`),
    metadata: { kind: "save_card", orgId: org.id, customerId: customer.id },
  });
  if (!session.url) throw new Error("Το Stripe δεν επέστρεψε URL.");
  return session.url;
}

/** Αποθήκευση της κάρτας στον πελάτη μετά από επιτυχημένο setup (webhook ή success_url). */
export async function storeSavedCard(db: Db, session: Stripe.Checkout.Session): Promise<"saved" | "ignored"> {
  if (session.metadata?.kind !== "save_card") return "ignored";
  const customerId = session.metadata.customerId;
  const orgId = session.metadata.orgId;
  if (!customerId || !orgId) return "ignored";
  const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
  if (!setupIntentId) return "ignored";
  const si = await stripe().setupIntents.retrieve(setupIntentId);
  const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (!pmId) return "ignored";
  const pm = await stripe().paymentMethods.retrieve(pmId);
  const stripeCustomerId = typeof si.customer === "string" ? si.customer : si.customer?.id ?? null;
  if (stripeCustomerId) await stripe().paymentMethods.attach(pmId, { customer: stripeCustomerId }).catch(() => undefined);
  await db
    .update(customers)
    .set({
      stripeCustomerId: stripeCustomerId ?? undefined,
      stripePaymentMethodId: pmId,
      cardBrand: pm.card?.brand ?? "card",
      cardLast4: pm.card?.last4 ?? "",
      cardSavedAt: new Date().toISOString(),
    })
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId)));
  await notify(db, {
    orgId,
    type: "payment_received",
    title: "Ο πελάτης αποθήκευσε κάρτα για αυτόματες πληρωμές",
    body: `${pm.card?.brand ?? "Κάρτα"} •••• ${pm.card?.last4 ?? ""}`,
    link: `/customers/${customerId}`,
    skipEmail: true,
  });
  return "saved";
}

export type ChargeOutcome = { ok: true; amount: number; reference: string } | { ok: false; error: string; requiresAction?: boolean };

/** Χρέωση αποθηκευμένης κάρτας off-session για το υπόλοιπο ενός εκδοθέντος παραστατικού. */
export async function chargeInvoiceOffSession(db: Db, org: Organization, invoice: Invoice, customer: Customer): Promise<ChargeOutcome> {
  if (!stripeEnabled()) return { ok: false, error: "Το Stripe δεν έχει ρυθμιστεί." };
  if (!customer.stripeCustomerId || !customer.stripePaymentMethodId) return { ok: false, error: "Ο πελάτης δεν έχει αποθηκευμένη κάρτα." };
  const amount = remainingAmount(invoice);
  if (amount <= 0.005) return { ok: false, error: "Το παραστατικό είναι εξοφλημένο." };

  try {
    const intent = await stripe().paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: (invoice.currency || "EUR").toLowerCase(),
        customer: customer.stripeCustomerId,
        payment_method: customer.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `${invoiceDisplayNumber(invoice)} – ${org.name}`,
        metadata: { kind: "subscription_charge", orgId: org.id, invoiceId: invoice.id, customerId: customer.id },
        ...(org.stripeAccountId ? { transfer_data: { destination: org.stripeAccountId } } : {}),
      },
      { idempotencyKey: `sub-charge-${invoice.id}-${round2(amount)}` },
    );
    if (intent.status !== "succeeded") {
      return { ok: false, error: `Η χρέωση απαιτεί επιβεβαίωση από τον πελάτη (${intent.status}).`, requiresAction: true };
    }
    const reference = `Stripe ${intent.id}`;
    const existing = await db.query.payments.findFirst({ where: and(eq(payments.invoiceId, invoice.id), eq(payments.reference, reference)) });
    if (!existing) {
      await recordPayment(db, org, { invoiceId: invoice.id, amount, paidAt: new Date().toISOString().slice(0, 10), method: ONLINE_PAYMENT_METHOD, reference });
    }
    return { ok: true, amount, reference };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Αυτόματη χρέωση συνδρομής μετά την έκδοση. Ποτέ δεν πετάει σφάλμα – καταγράφει αποτυχίες
 * στο πρότυπο και ειδοποιεί, ώστε να ακολουθήσει dunning.
 */
export async function chargeSubscriptionInvoice(db: Db, org: Organization, templateId: string, invoiceId: string): Promise<ChargeOutcome> {
  const now = new Date().toISOString();
  const invoice = await db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.orgId, org.id)) });
  const template = await db.query.recurringTemplates.findFirst({ where: and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, org.id)) });
  if (!invoice || !template) return { ok: false, error: "Δεν βρέθηκε το παραστατικό ή το πρότυπο." };
  const customer = invoice.customerId ? await db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId) }) : null;
  if (!customer) return { ok: false, error: "Δεν βρέθηκε ο πελάτης." };

  const result = await chargeInvoiceOffSession(db, org, invoice, customer);
  if (result.ok) {
    await db.update(recurringTemplates).set({ chargeFailCount: 0, chargeLastError: null, chargeLastAt: now }).where(eq(recurringTemplates.id, templateId));
    await notify(db, {
      orgId: org.id,
      type: "payment_received",
      title: `Αυτόματη χρέωση συνδρομής ${result.amount.toFixed(2)}€ – ${invoiceDisplayNumber(invoice)}`,
      body: `${customer.name} · ${customer.cardBrand} •••• ${customer.cardLast4}`,
      link: `/invoices/${invoiceId}`,
      skipEmail: true,
    });
  } else {
    await db
      .update(recurringTemplates)
      .set({ chargeFailCount: (template.chargeFailCount ?? 0) + 1, chargeLastError: result.error.slice(0, 500), chargeLastAt: now })
      .where(eq(recurringTemplates.id, templateId));
    await notify(db, {
      orgId: org.id,
      type: "payment_received",
      title: `Αποτυχία αυτόματης χρέωσης – ${invoiceDisplayNumber(invoice)}`,
      body: `${customer.name}: ${result.error}. Το παραστατικό παραμένει ανεξόφλητο – στείλτε νέο σύνδεσμο πληρωμής ή ζητήστε νέα κάρτα.`,
      link: `/invoices/${invoiceId}`,
    });
  }
  return result;
}

export interface ProrationInput {
  /** Καθαρή αξία της τρέχουσας συνδρομής για την περίοδο. */
  currentNet: number;
  /** Καθαρή αξία της νέας συνδρομής για την περίοδο. */
  newNet: number;
  periodStart: string;
  periodEnd: string;
  changeDate: string;
}

export interface ProrationResult {
  /** Ημέρες που απομένουν στην περίοδο (συμπεριλαμβάνεται η ημέρα αλλαγής). */
  remainingDays: number;
  totalDays: number;
  unusedCredit: number;
  newCharge: number;
  /** Θετικό = χρέωση διαφοράς, αρνητικό = πίστωση προς τον πελάτη. */
  difference: number;
}

const DAY = 86_400_000;

/** Αναλογικός υπολογισμός σε αλλαγή πλάνου μέσα στην περίοδο (proration). */
export function prorate({ currentNet, newNet, periodStart, periodEnd, changeDate }: ProrationInput): ProrationResult {
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);
  const change = Math.min(Math.max(Date.parse(changeDate), start), end);
  const totalDays = Math.max(1, Math.round((end - start) / DAY));
  const remainingDays = Math.max(0, Math.round((end - change) / DAY));
  const ratio = remainingDays / totalDays;
  const unusedCredit = round2(currentNet * ratio);
  const newCharge = round2(newNet * ratio);
  return { remainingDays, totalDays, unusedCredit, newCharge, difference: round2(newCharge - unusedCredit) };
}

/** Βοηθητικό: ο οργανισμός ενός πελάτη (για δημόσιες ροές portal). */
export async function orgOf(db: Db, orgId: string) {
  return db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
}
