"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { docRequests, periodLocks } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";

/** Κλείδωμα μήνα μετά την υποβολή δηλώσεων. */
export async function lockMonthAction(month: string, note = "") {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false as const, error };
  const actor = await resolveActor(db);
  const existing = await db
    .select()
    .from(periodLocks)
    .where(and(eq(periodLocks.orgId, ctx.org.id), eq(periodLocks.month, month)))
    .limit(1);
  if (existing.length) return { ok: true as const, locked: true };
  await db.insert(periodLocks).values({ id: randomUUID(), orgId: ctx.org.id, month, lockedBy: actor?.name ?? "", note, createdAt: new Date().toISOString() });
  await audit(db, ctx.org.id, "period", month, "period_locked", note, actor);
  revalidatePath("/reports/closing");
  return { ok: true as const, locked: true };
}

export async function unlockMonthAction(month: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false as const, error };
  const actor = await resolveActor(db);
  await db.delete(periodLocks).where(and(eq(periodLocks.orgId, ctx.org.id), eq(periodLocks.month, month)));
  await audit(db, ctx.org.id, "period", month, "period_unlocked", "", actor);
  revalidatePath("/reports/closing");
  return { ok: true as const, locked: false };
}

/** Δημιουργεί αίτημα εγγράφων με δημόσιο link (χωρίς login) που λήγει σε 7 ημέρες. */
export async function createDocRequestAction(title: string, items: string[], message: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false as const, error };
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (!clean.length) return { ok: false as const, error: "Προσθέστε τουλάχιστον ένα ζητούμενο έγγραφο." };
  const token = randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await db.insert(docRequests).values({
    id: randomUUID(),
    orgId: ctx.org.id,
    token,
    title: title.trim() || "Δικαιολογητικά",
    itemsJson: JSON.stringify(clean.map((label) => ({ label, uploaded: false }))),
    message: message.trim(),
    status: "open",
    expiresAt: expires,
    createdAt: new Date().toISOString(),
  });
  await audit(db, ctx.org.id, "doc_request", token, "doc_request_created", `${clean.length} έγγραφα`, await resolveActor(db));
  revalidatePath("/accountant/documents");
  return { ok: true as const, token, url: `/upload/${token}`, expiresAt: expires };
}

export async function closeDocRequestAction(id: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false as const, error };
  await db
    .update(docRequests)
    .set({ status: "closed" })
    .where(and(eq(docRequests.id, id), eq(docRequests.orgId, ctx.org.id)));
  revalidatePath("/accountant/documents");
  return { ok: true as const };
}
