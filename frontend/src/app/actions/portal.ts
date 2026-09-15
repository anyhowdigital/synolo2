"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { emailPortalLink, ensurePortalToken, portalUrl, requestPortalLinks, rotatePortalToken } from "@/lib/services/portal";
import { loginLockedMinutes, recordLoginFailure } from "@/lib/services/login-throttle";
import type { ActionResult } from "./customers";

type LinkResult = { ok: true; url: string; warning?: string } | { ok: false; error: string };

async function loadCustomer(customerId: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { db, ctx, error, customer: null };
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.orgId, ctx.org.id)) });
  if (!customer) return { db, ctx, error: "Ο πελάτης δεν βρέθηκε.", customer: null };
  return { db, ctx, error: null, customer };
}

/** Επιστρέφει (δημιουργώντας αν χρειάζεται) τον σύνδεσμο portal του πελάτη για αντιγραφή. */
export async function getPortalLinkAction(customerId: string): Promise<LinkResult> {
  const { db, customer, error } = await loadCustomer(customerId);
  if (error || !customer) return { ok: false, error: error ?? "Σφάλμα." };
  const token = await ensurePortalToken(db, customer);
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, url: portalUrl(token) };
}

/** Ανανέωση συνδέσμου – οι παλιοί σύνδεσμοι σταματούν να ισχύουν. */
export async function rotatePortalLinkAction(customerId: string): Promise<LinkResult> {
  const { db, ctx, customer, error } = await loadCustomer(customerId);
  if (error || !customer) return { ok: false, error: error ?? "Σφάλμα." };
  const token = await rotatePortalToken(db, customer);
  await audit(db, ctx.org.id, "customer", customer.id, "portal_link_rotated", customer.name, await resolveActor(db));
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, url: portalUrl(token) };
}

/** Αποστολή πρόσκλησης portal με email στον πελάτη. */
export async function sendPortalInviteAction(customerId: string, message?: string): Promise<ActionResult> {
  const { db, ctx, customer, error } = await loadCustomer(customerId);
  if (error || !customer) return { ok: false, error: error ?? "Σφάλμα." };
  try {
    const result = await emailPortalLink(db, ctx.org, customer, { message });
    await audit(db, ctx.org.id, "customer", customer.id, "portal_invite_sent", `${customer.name} <${customer.email}>`, await resolveActor(db));
    revalidatePath(`/customers/${customerId}`);
    return result.delivered
      ? { ok: true }
      : { ok: true, warning: "Η πρόσκληση καταγράφηκε αλλά δεν στάλθηκε (δεν έχει ρυθμιστεί SMTP). Αντιγράψτε τον σύνδεσμο και στείλτε τον χειροκίνητα." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Δημόσιο αίτημα magic link (σελίδα /portal). Πάντα ίδια απάντηση για να μην αποκαλύπτονται πελάτες. */
export async function requestPortalLinkAction(email: string): Promise<ActionResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return { ok: false, error: "Δώστε μια έγκυρη διεύθυνση email." };
  const db = await getDb();
  const key = `portal:${normalized}`;
  const locked = await loginLockedMinutes(db, key);
  if (locked > 0) return { ok: false, error: `Πολλά αιτήματα. Δοκιμάστε ξανά σε ${locked} λεπτά.` };
  await recordLoginFailure(db, key);
  await requestPortalLinks(db, normalized);
  return { ok: true };
}
