"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { accountantProfiles, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm } from "@/lib/services/firm";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { audit } from "@/lib/services/audit";

export async function saveSignatureAction(input: { signatureName: string; regNo: string; stampDataUrl: string }) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (!firm || firm.role !== "owner") return { ok: false as const, error: "Μόνο ο ιδιοκτήτης του γραφείου ορίζει την υπογραφή." };
  await db
    .update(accountantProfiles)
    .set({ signatureName: input.signatureName.slice(0, 120), regNo: input.regNo.slice(0, 40), stampDataUrl: input.stampDataUrl.slice(0, 600_000) })
    .where(eq(accountantProfiles.userId, firm.firmUserId));
  revalidatePath("/office/documents-registry");
  return { ok: true as const };
}

/** Η επιχείρηση επιλέγει αν διαχειρίζεται η ίδια τα ευαίσθητα λογιστικά. */
export async function setBooksSelfManageAction(enabled: boolean) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false as const, error };
  await db.update(organizations).set({ booksSelfManage: enabled }).where(eq(organizations.id, ctx.org.id));
  await audit(db, ctx.org.id, "settings", "books_self_manage", enabled ? "books_self_manage_on" : "books_self_manage_off", enabled ? "Η επιχείρηση διαχειρίζεται η ίδια τα διπλογραφικά" : "Τα διπλογραφικά διαχειρίζεται μόνο ο λογιστής", await resolveActor(db));
  revalidatePath("/accounting");
  revalidatePath("/settings");
  return { ok: true as const };
}
