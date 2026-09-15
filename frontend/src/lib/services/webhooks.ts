import { createHmac, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { organizations, webhookDeliveries, webhooks, type WebhookDelivery } from "@/db/schema";
import { hasCapability } from "@/lib/billing/plans";

export const WEBHOOK_EVENTS = [
  { code: "invoice.issued", label: "Έκδοση παραστατικού" },
  { code: "invoice.cancelled", label: "Ακύρωση παραστατικού" },
  { code: "mydata.sent", label: "Επιτυχής διαβίβαση στο myDATA" },
  { code: "mydata.error", label: "Αποτυχία διαβίβασης στο myDATA" },
  { code: "payment.recorded", label: "Καταχώρηση είσπραξης" },
  { code: "quote.accepted", label: "Αποδοχή προσφοράς από πελάτη" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["code"];

export function signPayload(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Καθυστερήσεις επαναπροσπάθειας (εκθετικές): 1', 5', 30', 2h, 12h. Μετά → failed. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/**
 * Καταχωρεί παραδόσεις στην ουρά για όλα τα ενεργά endpoints που ακούν το event
 * και προσπαθεί αμέσως μία πρώτη παράδοση. Οι αποτυχίες ξαναδοκιμάζονται από το /api/cron/webhooks.
 * Δεν κάνει throw.
 */
export async function dispatchWebhooks(db: Db, orgId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { plan: true } });
  if (!org || !hasCapability(org.plan, "api")) return [];
  const hooks = await db.select().from(webhooks).where(and(eq(webhooks.orgId, orgId), eq(webhooks.active, true)));
  const targets = hooks.filter((h) => h.events === "*" || h.events.split(",").map((s) => s.trim()).includes(event));
  if (targets.length === 0) return [];

  const now = new Date().toISOString();
  const rows = targets.map((hook) => ({
    id: randomUUID(),
    orgId,
    webhookId: hook.id,
    event,
    payload: JSON.stringify({ id: randomUUID(), event, createdAt: now, data }),
    attempts: 0,
    status: "pending",
    nextAttemptAt: now,
    createdAt: now,
  }));
  await db.insert(webhookDeliveries).values(rows);
  const ids = rows.map((r) => r.id);
  // Πρώτη προσπάθεια άμεσα (best effort) – δεν καθυστερεί το UI πάνω από ~8s ανά endpoint.
  await Promise.all(ids.map((id) => attemptDelivery(db, id).catch(() => undefined)));
  return ids;
}

/** Μία προσπάθεια παράδοσης. Ενημερώνει ουρά και endpoint. */
export async function attemptDelivery(db: Db, deliveryId: string) {
  const d = await db.query.webhookDeliveries.findFirst({ where: eq(webhookDeliveries.id, deliveryId) });
  if (!d || d.status === "delivered") return d;
  const hook = await db.query.webhooks.findFirst({ where: eq(webhooks.id, d.webhookId) });
  if (!hook) {
    await db.update(webhookDeliveries).set({ status: "failed", lastError: "Το endpoint διαγράφηκε." }).where(eq(webhookDeliveries.id, d.id));
    return null;
  }

  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TimologioCloud-Webhooks/1.0",
        "X-TC-Event": d.event,
        "X-TC-Delivery": d.id,
        "X-TC-Attempt": String(d.attempts + 1),
        "X-TC-Signature": `sha256=${signPayload(hook.secret, d.payload)}`,
      },
      body: d.payload,
      signal: AbortSignal.timeout(8000),
    });
    statusCode = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = (err as Error).message.slice(0, 200);
  }

  const attempts = d.attempts + 1;
  const now = new Date();
  const ok = !error;
  const exhausted = !ok && attempts >= MAX_ATTEMPTS;
  const next = ok || exhausted ? d.nextAttemptAt : new Date(now.getTime() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]).toISOString();

  await db
    .update(webhookDeliveries)
    .set({
      attempts,
      status: ok ? "delivered" : exhausted ? "failed" : "pending",
      lastStatusCode: statusCode,
      lastError: error,
      nextAttemptAt: next,
      deliveredAt: ok ? now.toISOString() : null,
    })
    .where(eq(webhookDeliveries.id, d.id));
  await db
    .update(webhooks)
    .set({ lastStatus: ok ? String(statusCode) : `${error}${exhausted ? " (εγκατάλειψη)" : ` – επανάληψη ${attempts}/${MAX_ATTEMPTS}`}`, lastDeliveredAt: now.toISOString() })
    .where(eq(webhooks.id, hook.id));

  return { ...d, attempts, status: ok ? "delivered" : exhausted ? "failed" : "pending", lastStatusCode: statusCode, lastError: error };
}

/** Επεξεργασία ουράς: όλες οι εκκρεμείς παραδόσεις με nextAttemptAt <= τώρα. Καλείται από cron. */
export async function processWebhookQueue(db: Db, limit = 100) {
  const due = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, new Date().toISOString())))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit);
  let delivered = 0;
  let failed = 0;
  let retrying = 0;
  for (const { id } of due) {
    const r = await attemptDelivery(db, id);
    if (!r) continue;
    if (r.status === "delivered") delivered++;
    else if (r.status === "failed") failed++;
    else retrying++;
  }
  return { processed: due.length, delivered, failed, retrying };
}

/** Χειροκίνητη επανάληψη (από UI) – επαναφέρει failed σε pending και προσπαθεί αμέσως. */
export async function retryDelivery(db: Db, orgId: string, deliveryId: string) {
  const d = await db.query.webhookDeliveries.findFirst({ where: and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.orgId, orgId)) });
  if (!d) throw new Error("Η παράδοση δεν βρέθηκε.");
  if (d.status === "delivered") throw new Error("Έχει ήδη παραδοθεί.");
  await db.update(webhookDeliveries).set({ status: "pending", attempts: Math.min(d.attempts, MAX_ATTEMPTS - 1), nextAttemptAt: new Date().toISOString() }).where(eq(webhookDeliveries.id, d.id));
  return attemptDelivery(db, d.id);
}

export async function listDeliveries(db: Db, orgId: string, opts: { webhookId?: string; limit?: number } = {}): Promise<WebhookDelivery[]> {
  const conds = [eq(webhookDeliveries.orgId, orgId)];
  if (opts.webhookId) conds.push(eq(webhookDeliveries.webhookId, opts.webhookId));
  return db
    .select()
    .from(webhookDeliveries)
    .where(and(...conds))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(opts.limit ?? 50);
}

export async function deliveryStats(db: Db, orgId: string) {
  const rows = await db.select({ status: webhookDeliveries.status }).from(webhookDeliveries).where(and(eq(webhookDeliveries.orgId, orgId), inArray(webhookDeliveries.status, ["pending", "failed"])));
  return { pending: rows.filter((r) => r.status === "pending").length, failed: rows.filter((r) => r.status === "failed").length };
}
