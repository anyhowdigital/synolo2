import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { apiKeys, organizations, type Organization } from "@/db/schema";
import { randomToken } from "@/lib/auth/password";
import { featureBlockedMessage } from "@/lib/billing/limits";

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Δημιουργία κλειδιού. Το πλήρες κλειδί επιστρέφεται ΜΟΝΟ μία φορά. */
export async function createApiKey(db: Db, orgId: string, name: string) {
  const secret = `tc_live_${randomToken(24)}`;
  const prefix = secret.slice(0, 15);
  await db.insert(apiKeys).values({ id: randomUUID(), orgId, name, prefix, keyHash: hashApiKey(secret), createdAt: new Date().toISOString() });
  return secret;
}

export async function revokeApiKey(db: Db, orgId: string, id: string) {
  await db.update(apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, orgId)));
}

/** Αυθεντικοποίηση αιτήματος API με `Authorization: Bearer tc_live_...`. */
export async function authenticateApiRequest(db: Db, req: Request): Promise<Organization | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(tc_live_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return null;
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.keyHash, hashApiKey(match[1])), isNull(apiKeys.revokedAt)) });
  if (!key) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, key.id));
  return (await db.query.organizations.findFirst({ where: eq(organizations.id, key.orgId) })) ?? null;
}

export function apiError(status: number, message: string, details?: unknown) {
  return Response.json({ error: { status, message, details } }, { status });
}

/* ---------- Rate limiting (in-memory, sliding window ανά API key) ---------- */

export const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT ?? 120); // αιτήματα / λεπτό
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, limit = API_RATE_LIMIT) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const allowed = hits.length < limit;
  if (allowed) hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < WINDOW_MS)) buckets.delete(k);
  const resetAt = hits.length ? hits[0] + WINDOW_MS : now + WINDOW_MS;
  return { allowed, limit, remaining: Math.max(0, limit - hits.length), resetAt };
}

export function rateLimitHeaders(rl: ReturnType<typeof checkRateLimit>) {
  return {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
}

export type ApiGate = { org: Organization; key: ApiKeyRow; headers: Record<string, string>; error: null } | { org: null; key: null; headers: Record<string, string>; error: Response };
type ApiKeyRow = typeof apiKeys.$inferSelect;

/**
 * Πλήρης πύλη API: κλειδί → πακέτο (δυνατότητα «api») → rate limit.
 * Οι headers X-RateLimit-* επιστρέφονται για να προστεθούν στην απάντηση.
 */
export async function requireApiOrg(db: Db, req: Request): Promise<ApiGate> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(tc_live_[A-Za-z0-9_-]+)$/.exec(header.trim());
  if (!match) return { org: null, key: null, headers: {}, error: apiError(401, "Μη έγκυρο ή ελλιπές API key. Χρησιμοποιήστε Authorization: Bearer tc_live_…") };
  const key = await db.query.apiKeys.findFirst({ where: and(eq(apiKeys.keyHash, hashApiKey(match[1])), isNull(apiKeys.revokedAt)) });
  if (!key) return { org: null, key: null, headers: {}, error: apiError(401, "Μη έγκυρο ή ανακληθέν API key.") };

  const rl = checkRateLimit(key.id);
  const headers = rateLimitHeaders(rl);
  if (!rl.allowed) {
    return {
      org: null,
      key: null,
      headers,
      error: Response.json({ error: { status: 429, message: `Υπέρβαση ορίου ${rl.limit} αιτημάτων/λεπτό.` } }, { status: 429, headers: { ...headers, "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }),
    };
  }

  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, key.orgId) });
  if (!org) return { org: null, key: null, headers, error: apiError(401, "Ο οργανισμός του κλειδιού δεν υπάρχει.") };
  const blocked = featureBlockedMessage(org, "api");
  if (blocked) return { org: null, key: null, headers, error: Response.json({ error: { status: 403, message: blocked, code: "plan_upgrade_required" } }, { status: 403, headers }) };

  await db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, key.id));
  return { org, key, headers, error: null };
}

/** JSON απάντηση με headers rate limit. */
export function apiJson(data: unknown, headers: Record<string, string>, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
}
