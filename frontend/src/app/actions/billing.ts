"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getPlan, type PlanId } from "@/lib/billing/plans";
import { applySubscription, createCheckoutSession, createPortalSession, stripe, stripeEnabled, type BillingInterval } from "@/lib/billing/stripe";
import { requirePermission } from "@/lib/services/org";
import type { ActionResult } from "./customers";

/** Έναρξη αγοράς πακέτου: Stripe Checkout αν έχει ρυθμιστεί, αλλιώς τοπική προσομοίωση πληρωμής. */
export async function startCheckoutAction(planId: string, interval: BillingInterval): Promise<ActionResult> {
  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: "Άγνωστο πακέτο." };
  let url: string;
  try {
    const db = await getDb();
    const { ctx, error } = await requirePermission(db, "manageBilling");
    if (error) return { ok: false, error };
    if (stripeEnabled()) {
      url = await createCheckoutSession(db, ctx.org, plan.id, interval, ctx.org.billingEmail || ctx.user.email);
    } else {
      url = `/billing/checkout?plan=${plan.id}&interval=${interval}`;
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  redirect(url);
}

/** Ολοκλήρωση προσομοίωσης πληρωμής (χωρίς Stripe). */
export async function completeMockCheckoutAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const planId = String(formData.get("plan") ?? "") as PlanId;
  const interval = (String(formData.get("interval") ?? "monthly") as BillingInterval) === "yearly" ? "yearly" : "monthly";
  const card = String(formData.get("card") ?? "").replace(/\s/g, "");
  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: "Άγνωστο πακέτο." };
  if (!/^\d{12,19}$/.test(card)) return { ok: false, error: "Μη έγκυρος αριθμός κάρτας." };
  if (card.endsWith("0002")) return { ok: false, error: "Η κάρτα απορρίφθηκε από την εκδότρια τράπεζα (δοκιμαστικό σενάριο αποτυχίας)." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageBilling");
  if (error) return { ok: false, error };
  const periodEnd = new Date();
  if (interval === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
  else periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  await applySubscription(db, ctx.org.id, { planId, interval, status: "active", periodEnd: periodEnd.toISOString(), subscriptionId: `mock_sub_${Date.now()}` });
  revalidatePath("/billing");
  revalidatePath("/", "layout");
  redirect("/billing?success=1");
}

export async function openBillingPortalAction(): Promise<ActionResult> {
  let url: string;
  try {
    const db = await getDb();
    const { ctx, error } = await requirePermission(db, "manageBilling");
    if (error) return { ok: false, error };
    if (!stripeEnabled()) return { ok: false, error: "Η διαχείριση κάρτας/αποδείξεων είναι διαθέσιμη μόνο με ενεργό Stripe." };
    url = await createPortalSession(ctx.org);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  redirect(url);
}

/** Ακύρωση συνδρομής στο τέλος της περιόδου. */
export async function cancelSubscriptionAction(): Promise<ActionResult> {
  try {
    const db = await getDb();
    const { ctx, error } = await requirePermission(db, "manageBilling");
    if (error) return { ok: false, error };
    const org = ctx.org;
    if (stripeEnabled() && org.stripeSubscriptionId && !org.stripeSubscriptionId.startsWith("mock_")) {
      await stripe().subscriptions.update(org.stripeSubscriptionId, { cancel_at_period_end: true });
    }
    await applySubscription(db, org.id, { status: "cancelled", periodEnd: org.currentPeriodEnd, subscriptionId: null });
    revalidatePath("/billing");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
