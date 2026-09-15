"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm, WRITE_LEVELS } from "@/lib/services/firm";
import { audit } from "@/lib/services/audit";
import { generateEntries, seedChart, type Plan } from "@/lib/services/gl";

async function guard(orgId: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { error: "Απαιτείται σύνδεση." as string };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { error: "Δεν βρέθηκε λογιστικό γραφείο." };
  const client = await firmClient(db, firm, orgId);
  if (!client || !WRITE_LEVELS.includes(client.accessLevel)) return { error: "Δεν έχετε δικαίωμα αλλαγών σε αυτόν τον πελάτη." };
  return { db, user, firm, org: client.org };
}

export async function officeEnableBooksAction(orgId: string, plan: Plan) {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false as const, error: g.error };
  const created = await seedChart(g.db, orgId, plan);
  await g.db.update(organizations).set({ accountingPlan: plan, booksCategory: "double" }).where(eq(organizations.id, orgId));
  await audit(g.db, orgId, "accounting", plan, "double_entry_enabled", `Ενεργοποίηση διπλογραφικών από λογιστή (${g.firm.firmName})`, { id: g.user.id, name: g.user.name || g.user.email });
  revalidatePath(`/office/clients/${orgId}/accounting`);
  return { ok: true as const, created };
}

export async function officeGenerateEntriesAction(orgId: string, from: string, to: string) {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false as const, error: g.error };
  try {
    const created = await generateEntries(g.db, g.org, { from, to }, g.user.name || g.user.email);
    await audit(g.db, orgId, "accounting", `${from}_${to}`, "gl_entries_generated", `${created} άρθρα από τον λογιστή (${g.firm.firmName})`, { id: g.user.id, name: g.user.name || g.user.email });
    revalidatePath(`/office/clients/${orgId}/accounting`);
    return { ok: true as const, created };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}
