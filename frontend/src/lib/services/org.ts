import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { Db } from "@/db";
import { organizations, type Organization } from "@/db/schema";
import type { MyDataCredentials, MyDataEnvironment } from "@/lib/mydata/client";
import { can, getCurrentContext, getCurrentUser, type CurrentContext, type PERMISSIONS } from "@/lib/auth/session";

/**
 * Επιστρέφει τον ενεργό οργανισμό (tenant) του συνδεδεμένου χρήστη.
 * Αν δεν υπάρχει session → /login. Αν ο χρήστης δεν έχει οργανισμό → /onboarding.
 */
export async function getCurrentOrg(db: Db): Promise<Organization> {
  return (await requireContext(db)).org;
}

export async function requireContext(db: Db): Promise<CurrentContext> {
  const ctx = await getCurrentContext(db);
  if (!ctx) {
    const user = await getCurrentUser(db);
    redirect(user ? "/onboarding" : "/login");
  }
  return ctx;
}

/** Ελέγχει δικαίωμα· επιστρέφει σφάλμα (όχι throw) ώστε να εμφανίζεται στο UI των server actions. */
export async function requirePermission(db: Db, permission: keyof typeof PERMISSIONS): Promise<{ ctx: CurrentContext; error: string | null }> {
  const ctx = await requireContext(db);
  if (!can(ctx.role, permission)) {
    return { ctx, error: "Δεν έχετε δικαίωμα για αυτή την ενέργεια (ρόλος: " + ctx.role + ")." };
  }
  return { ctx, error: null };
}

/**
 * Επιστρέφει τον ενεργό οργανισμό εφόσον ο χρήστης έχει το δικαίωμα, αλλιώς κάνει throw.
 * Για χρήση μέσα σε try/catch server actions που επιστρέφουν ActionResult.
 */
export async function requireOrg(db: Db, permission: keyof typeof PERMISSIONS): Promise<Organization> {
  const { ctx, error } = await requirePermission(db, permission);
  if (error) throw new Error(error);
  return ctx.org;
}

export function orgMyDataCredentials(org: Organization): MyDataCredentials {
  return {
    environment: (org.mydataEnvironment as MyDataEnvironment) ?? "mock",
    userId: org.mydataUserId ?? "",
    subscriptionKey: org.mydataSubscriptionKey ?? "",
  };
}

export async function updateOrg(db: Db, id: string, patch: Partial<Organization>) {
  await db.update(organizations).set(patch).where(eq(organizations.id, id));
}
