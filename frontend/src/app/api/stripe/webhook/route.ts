import { getDb } from "@/db";
import { handleStripeEvent, stripe, stripeEnabled } from "@/lib/billing/stripe";

/** Stripe webhook: ρυθμίστε endpoint `/api/stripe/webhook` και STRIPE_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  if (!stripeEnabled()) return Response.json({ error: "Stripe disabled" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  let event;
  try {
    if (!secret) throw new Error("Λείπει το STRIPE_WEBHOOK_SECRET.");
    if (!signature) throw new Error("Λείπει η υπογραφή Stripe.");
    event = await stripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  const db = await getDb();
  const result = await handleStripeEvent(db, event);
  return Response.json({ received: true, result });
}
