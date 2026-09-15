"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { webhooks } from "@/db/schema";
import { createApiKey, revokeApiKey } from "@/lib/api/auth";
import { randomToken } from "@/lib/auth/password";
import { requirePermission } from "@/lib/services/org";
import { lookupVat } from "@/lib/greek/vies";
import type { ActionResult } from "./customers";
import { audit } from "@/lib/services/audit";
import { processWebhookQueue, retryDelivery } from "@/lib/services/webhooks";
import { featureBlockedMessage } from "@/lib/billing/limits";
import { resolveActor } from "@/lib/services/actor";

export async function createApiKeyAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Δώστε όνομα στο κλειδί (π.χ. «e-shop»)." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const blocked = featureBlockedMessage(ctx.org, "api");
  if (blocked) return { ok: false, error: blocked };
  const secret = await createApiKey(db, ctx.org.id, name);
  await audit(db, ctx.org.id, "api_key", name, "api_key_created", name, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true, id: secret };
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  await revokeApiKey(db, ctx.org.id, id);
  await audit(db, ctx.org.id, "api_key", id, "api_key_revoked", "", await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

const webhookSchema = z.object({
  url: z.string().trim().url("Μη έγκυρο URL."),
  events: z.string().trim().default("*"),
});

export async function createWebhookAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = webhookSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  if (!/^https?:\/\//.test(parsed.data.url)) return { ok: false, error: "Το URL πρέπει να ξεκινά με http(s)://" };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const blocked = featureBlockedMessage(ctx.org, "api");
  if (blocked) return { ok: false, error: blocked };
  const secret = `whsec_${randomToken(24)}`;
  const hookId = randomUUID();
  await db.insert(webhooks).values({ id: hookId, orgId: ctx.org.id, url: parsed.data.url, secret, events: parsed.data.events || "*", active: true, createdAt: new Date().toISOString() });
  await audit(db, ctx.org.id, "webhook", hookId, "webhook_created", parsed.data.url, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true, id: secret };
}

export async function deleteWebhookAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.org.id)));
  await audit(db, ctx.org.id, "webhook", id, "webhook_deleted", "", await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleWebhookAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const h = await db.query.webhooks.findFirst({ where: and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.org.id)) });
  if (!h) return { ok: false, error: "Δεν βρέθηκε." };
  await db.update(webhooks).set({ active: !h.active }).where(eq(webhooks.id, id));
  revalidatePath("/settings");
  return { ok: true };
}

/** Αναζήτηση στοιχείων επιχείρησης μέσω VIES (ΑΦΜ / VAT). */
export async function viesLookupAction(country: string, vat: string) {
  const db = await getDb();
  const { error } = await requirePermission(db, "read");
  if (error) return { valid: false, error } as const;
  return lookupVat(country, vat);
}

export async function retryDeliveryAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  try {
    const r = await retryDelivery(db, ctx.org.id, id);
    revalidatePath("/settings");
    if (r?.status === "delivered") return { ok: true };
    return { ok: false, error: `Η παράδοση απέτυχε ξανά: ${r?.lastError ?? "άγνωστο σφάλμα"}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function processQueueAction(): Promise<ActionResult> {
  const db = await getDb();
  const { error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const r = await processWebhookQueue(db);
  revalidatePath("/settings");
  return { ok: true, id: String(r.processed), warning: r.failed ? `${r.failed} εγκαταλείφθηκαν οριστικά.` : undefined };
}
