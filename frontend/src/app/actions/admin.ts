"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { currentSuperAdmin, endSuperAdminSession, startSuperAdminSession, verifySuperAdmin } from "@/lib/admin/auth";
import { createSession, setActiveOrgCookie } from "@/lib/auth/session";
import { logAdminAction } from "@/lib/admin/audit";
import { PLANS, type PlatformPlanOverrides } from "@/lib/billing/plans";
import { savePlatformOverrides } from "@/lib/billing/platform-settings";

type Res = { ok: boolean; error?: string };

export async function adminLoginAction(fd: FormData): Promise<void> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!(await verifySuperAdmin(email, password))) redirect("/admin/login?e=1");
  await startSuperAdminSession(email);
  redirect("/admin");
}

export async function adminLogoutAction() {
  await endSuperAdminSession();
  redirect("/admin/login");
}

const VALID_PLANS = ["trial", ...PLANS.map((p) => p.id)];

export async function setOrgPlanAction(orgId: string, plan: string): Promise<Res> {
  const admin = await currentSuperAdmin();
  if (!admin) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  if (!VALID_PLANS.includes(plan)) return { ok: false, error: "Άγνωστο πλάνο." };
  const db = await getDb();
  await db.update(organizations).set({ plan, planStatus: plan === "trial" ? "trialing" : "active" }).where(eq(organizations.id, orgId));
  await logAdminAction(admin, "set_plan", { orgId, detail: plan });
  revalidatePath("/admin");
  return { ok: true };
}

export async function setOrgFrozenAction(orgId: string, frozen: boolean): Promise<Res> {
  const admin = await currentSuperAdmin();
  if (!admin) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const db = await getDb();
  await db.update(organizations).set({ planStatus: frozen ? "frozen" : "active" }).where(eq(organizations.id, orgId));
  await logAdminAction(admin, frozen ? "freeze" : "unfreeze", { orgId });
  revalidatePath("/admin");
  return { ok: true };
}

/** Per-organization override δυνατοτήτων & ορίων (feature flags). */
export async function setOrgOverridesAction(orgId: string, overrides: Record<string, unknown>): Promise<Res> {
  const admin = await currentSuperAdmin();
  if (!admin) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const db = await getDb();
  await db.update(organizations).set({ overridesJson: JSON.stringify(overrides ?? {}) }).where(eq(organizations.id, orgId));
  await logAdminAction(admin, "set_overrides", { orgId, detail: JSON.stringify(overrides ?? {}) });
  revalidatePath("/admin");
  revalidatePath(`/admin/orgs/${orgId}`);
  return { ok: true };
}

/** Global επεξεργασία δυνατοτήτων & ορίων ανά πλάνο. */
export async function savePlanOverridesAction(overrides: PlatformPlanOverrides): Promise<Res> {
  const admin = await currentSuperAdmin();
  if (!admin) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  await savePlatformOverrides(overrides);
  await logAdminAction(admin, "save_plan_overrides", { detail: JSON.stringify(overrides ?? {}) });
  revalidatePath("/admin");
  revalidatePath("/admin/plans");
  return { ok: true };
}

/** Ορισμός/παράταση ημερομηνίας λήξης δοκιμαστικής περιόδου. */
export async function setOrgTrialFormAction(fd: FormData): Promise<void> {
  const admin = await currentSuperAdmin();
  if (!admin) redirect("/admin/login");
  const orgId = String(fd.get("orgId") ?? "");
  const date = String(fd.get("trialEndsAt") ?? "");
  const db = await getDb();
  const d = new Date(date);
  if (orgId && !Number.isNaN(d.getTime())) {
    await db.update(organizations).set({ trialEndsAt: d.toISOString() }).where(eq(organizations.id, orgId));
    await logAdminAction(admin, "set_trial", { orgId, detail: d.toISOString() });
  }
  revalidatePath(`/admin/orgs/${orgId}`);
  redirect(`/admin/orgs/${orgId}`);
}

/** «Είσοδος ως» — δημιουργεί session για τον ιδιοκτήτη του οργανισμού (υποστήριξη). */
export async function impersonateOrgAction(orgId: string): Promise<void> {
  const admin = await currentSuperAdmin();
  if (!admin) redirect("/admin/login");
  const db = await getDb();
  const rows = await db.select({ userId: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.orgId, orgId));
  const target = rows.find((r) => r.role === "owner") ?? rows.find((r) => r.role === "admin") ?? rows[0];
  if (!target) redirect(`/admin/orgs/${orgId}?e=noowner`);
  await createSession(db, target.userId);
  await setActiveOrgCookie(orgId);
  await logAdminAction(admin, "impersonate", { orgId, detail: `userId=${target.userId}` });
  redirect("/");
}
