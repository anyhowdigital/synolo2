import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { adminAuditLog } from "@/db/schema";

/** Καταγράφει μια ενέργεια super-admin. Δεν ρίχνει ποτέ την βασική ενέργεια. */
export async function logAdminAction(adminEmail: string, action: string, opts?: { orgId?: string | null; detail?: string }) {
  try {
    const db = await getDb();
    await db.insert(adminAuditLog).values({
      id: randomUUID(),
      adminEmail,
      action,
      targetOrgId: opts?.orgId ?? null,
      detail: (opts?.detail ?? "").slice(0, 2000),
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Η καταγραφή audit δεν πρέπει να ρίχνει τη βασική ενέργεια.
  }
}
