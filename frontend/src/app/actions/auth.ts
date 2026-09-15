"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { assertCanAddUser } from "@/lib/billing/limits";
import { accountantProfiles, invitations, memberships, organizations, passwordResets, sessions, users } from "@/db/schema";
import { hashPassword, randomToken, verifyPassword } from "@/lib/auth/password";
import { cookies } from "next/headers";
import { addMembership, createSession, currentSessionId, destroySession, getCurrentUser, setActiveOrgCookie, type Role } from "@/lib/auth/session";
import {
  beginTotpSetup,
  confirmTotpSetup,
  consumePendingLogin,
  createPendingLogin,
  deletePendingLogin,
  disableTotp,
  revokeOtherSessions,
  revokeSession,
  sendVerificationEmail,
  verifyTotpCode,
} from "@/lib/auth/security";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";
import { createOrganization } from "@/lib/services/provisioning";
import { requirePermission } from "@/lib/services/org";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import type { ActionResult } from "./customers";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { clearLoginFailures, LOGIN_LOCK_MINUTES, loginLockedMinutes, recordLoginFailure } from "@/lib/services/login-throttle";

const email = z.string().trim().toLowerCase().email("Μη έγκυρο email.");
const password = z
  .string()
  .min(8, "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.")
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), "Ο κωδικός πρέπει να περιέχει τουλάχιστον ένα γράμμα και έναν αριθμό.");

export async function registerAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ name: z.string().trim().min(2, "Συμπληρώστε το όνομά σας."), email, password, invite: z.string().optional() })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const exists = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (exists) return { ok: false, error: "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε." };

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
    createdAt: new Date().toISOString(),
  });
  await createSession(db, userId);
  const created = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (created) await sendVerificationEmail(db, created);

  if (parsed.data.invite) {
    const accepted = await acceptInvitationInternal(db, userId, parsed.data.email, parsed.data.invite);
    if (accepted) redirect("/dashboard");
  }
  redirect("/onboarding");
}

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1, "Συμπληρώστε τον κωδικό."), next: z.string().optional() }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const lockedFor = await loginLockedMinutes(db, parsed.data.email);
  if (lockedFor > 0) {
    return { ok: false, error: `Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε ${lockedFor} λεπτά ή επαναφέρετε τον κωδικό σας.` };
  }
  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    const { locked, remaining } = await recordLoginFailure(db, parsed.data.email);
    if (locked) return { ok: false, error: `Πολλές αποτυχημένες προσπάθειες. Η σύνδεση κλειδώθηκε για ${LOGIN_LOCK_MINUTES} λεπτά.` };
    if (remaining <= 3) {
      return { ok: false, error: `Λάθος email ή κωδικός. ${remaining === 1 ? "Απομένει 1 προσπάθεια" : `Απομένουν ${remaining} προσπάθειες`} πριν το προσωρινό κλείδωμα.` };
    }
    return { ok: false, error: "Λάθος email ή κωδικός." };
  }
  await clearLoginFailures(db, parsed.data.email);
  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/dashboard";
  if (user.totpEnabledAt && user.totpSecret) {
    // Δεύτερο βήμα: κωδικός εφαρμογής αυθεντικοποίησης.
    const pendingId = await createPendingLogin(db, user.id);
    const jar = await cookies();
    jar.set(PENDING_COOKIE, pendingId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/" });
    redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  }
  await createSession(db, user.id);
  // Οι λογιστές πάνε στο δικό τους πάνελ γραφείου.
  const accProfile = await db.select({ id: accountantProfiles.id }).from(accountantProfiles).where(eq(accountantProfiles.userId, user.id)).limit(1);
  if (accProfile.length && next === "/dashboard") redirect("/office");
  redirect(next);
}

const PENDING_COOKIE = "tc_pending";

export async function verifyTotpLoginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ code: z.string().trim().min(6, "Συμπληρώστε τον 6ψήφιο κωδικό."), next: z.string().optional() }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const jar = await cookies();
  const pendingId = jar.get(PENDING_COOKIE)?.value;
  if (!pendingId) return { ok: false, error: "Η σύνδεση έληξε. Συνδεθείτε ξανά." };
  const user = await consumePendingLogin(db, pendingId);
  if (!user) {
    jar.delete(PENDING_COOKIE);
    return { ok: false, error: "Η σύνδεση έληξε. Συνδεθείτε ξανά." };
  }
  const totpKey = `totp:${user.id}`;
  if ((await loginLockedMinutes(db, totpKey)) > 0) {
    await deletePendingLogin(db, pendingId);
    jar.delete(PENDING_COOKIE);
    return { ok: false, error: "Πολλές λάθος προσπάθειες κωδικού επαλήθευσης. Συνδεθείτε ξανά σε λίγα λεπτά." };
  }
  if (!verifyTotpCode(user, parsed.data.code)) {
    const { locked } = await recordLoginFailure(db, totpKey);
    if (locked) {
      await deletePendingLogin(db, pendingId);
      jar.delete(PENDING_COOKIE);
      return { ok: false, error: `Πολλές λάθος προσπάθειες. Η επαλήθευση κλειδώθηκε για ${LOGIN_LOCK_MINUTES} λεπτά.` };
    }
    return { ok: false, error: "Λάθος κωδικός επαλήθευσης." };
  }
  await clearLoginFailures(db, totpKey);
  await deletePendingLogin(db, pendingId);
  jar.delete(PENDING_COOKIE);
  await createSession(db, user.id);
  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/dashboard";
  redirect(next);
}

/* ---------- Λογαριασμός: επαλήθευση email, 2FA, συνδέσεις, προφίλ ---------- */

export async function resendVerificationAction(): Promise<ActionResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  if (user.emailVerifiedAt) return { ok: true };
  await sendVerificationEmail(db, user);
  return { ok: true };
}

export async function beginTotpSetupAction(): Promise<{ ok: true; secret: string; uri: string; qrDataUrl: string } | { ok: false; error: string }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  if (user.totpEnabledAt) return { ok: false, error: "Η επαλήθευση δύο βημάτων είναι ήδη ενεργή." };
  const setup = await beginTotpSetup(db, user);
  return { ok: true, ...setup };
}

export async function confirmTotpSetupAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ code: z.string().trim().min(6, "Συμπληρώστε τον 6ψήφιο κωδικό.") }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const ok = await confirmTotpSetup(db, user, parsed.data.code);
  if (!ok) return { ok: false, error: "Ο κωδικός δεν είναι σωστός. Ελέγξτε την ώρα της συσκευής και δοκιμάστε ξανά." };
  revalidatePath("/account");
  return { ok: true };
}

export async function disableTotpAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ password: z.string().min(1, "Συμπληρώστε τον κωδικό σας."), code: z.string().trim().min(6, "Συμπληρώστε τον 6ψήφιο κωδικό.") }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return { ok: false, error: "Λάθος κωδικός πρόσβασης." };
  if (!verifyTotpCode(user, parsed.data.code)) return { ok: false, error: "Λάθος κωδικός επαλήθευσης." };
  await disableTotp(db, user.id);
  revalidatePath("/account");
  return { ok: true };
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  await revokeSession(db, user.id, sessionId);
  if ((await currentSessionId()) === sessionId) {
    await destroySession(db);
    redirect("/login");
  }
  revalidatePath("/account");
  return { ok: true };
}

export async function revokeOtherSessionsAction(): Promise<ActionResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const current = await currentSessionId();
  if (!current) return { ok: false, error: "Δεν βρέθηκε ενεργή σύνδεση." };
  await revokeOtherSessions(db, user.id, current);
  revalidatePath("/account");
  return { ok: true };
}

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(2, "Συμπληρώστε το όνομά σας.") }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ current: z.string().min(1, "Συμπληρώστε τον τρέχοντα κωδικό."), password, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "Οι κωδικοί δεν ταιριάζουν.", path: ["confirm"] })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { ok: false, error: "Ο τρέχων κωδικός είναι λάθος." };
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(users.id, user.id));
  // Αποσύνδεση από όλες τις άλλες συσκευές μετά την αλλαγή κωδικού.
  const current = await currentSessionId();
  if (current) await revokeOtherSessions(db, user.id, current);
  revalidatePath("/account");
  return { ok: true };
}

export async function logoutAction() {
  const db = await getDb();
  await destroySession(db);
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.email, parsed.data.email) });
  if (user) {
    const token = randomToken(24);
    await db.insert(passwordResets).values({ id: randomUUID(), userId: user.id, token, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    const orgRow = await db.query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
    await sendMail(db, {
      orgId: orgRow?.orgId ?? "system",
      to: user.email,
      subject: "Επαναφορά κωδικού – Σύνολο ERP",
      html: layoutEmail("Επαναφορά κωδικού", `Λάβαμε αίτημα επαναφοράς κωδικού για τον λογαριασμό <b>${user.email}</b>. Ο σύνδεσμος ισχύει για 1 ώρα.`, {
        label: "Ορισμός νέου κωδικού",
        url: appUrl(`/reset-password/${token}`),
      }),
      relatedEntity: "user",
      relatedId: user.id,
    });
  }
  return { ok: true };
}

export async function resetPasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ token: z.string().min(1), password, confirm: z.string().optional() })
    .refine((d) => d.confirm === undefined || d.confirm === d.password, { message: "Οι κωδικοί δεν ταιριάζουν.", path: ["confirm"] })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const row = await db.query.passwordResets.findFirst({ where: eq(passwordResets.token, parsed.data.token) });
  if (!row || row.usedAt || new Date(row.expiresAt) < new Date()) return { ok: false, error: "Ο σύνδεσμος δεν ισχύει πλέον. Ζητήστε νέο." };
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(users.id, row.userId));
  await db.update(passwordResets).set({ usedAt: new Date().toISOString() }).where(eq(passwordResets.id, row.id));
  await createSession(db, row.userId);
  redirect("/dashboard");
}

export async function onboardingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Η επωνυμία είναι υποχρεωτική."),
      afm: z.string().trim().min(1, "Το ΑΦΜ είναι υποχρεωτικό."),
      gemi: z.string().trim().default(""),
      doy: z.string().trim().default(""),
      activity: z.string().trim().default(""),
      address: z.string().trim().default(""),
      city: z.string().trim().default(""),
      postalCode: z.string().trim().default(""),
      email: z.string().trim().default(""),
      phone: z.string().trim().default(""),
      mydataEnvironment: z.enum(["mock", "dev", "prod"]).default("mock"),
      mydataUserId: z.string().trim().default(""),
      mydataSubscriptionKey: z.string().trim().default(""),
      defaultPaymentTermsDays: z.coerce.number().int().min(0).max(180).default(30),
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  const afm = normalizeAfm(parsed.data.afm);
  if (!isValidAfm(afm)) return { ok: false, error: "Το ΑΦΜ δεν είναι έγκυρο (9 ψηφία με σωστό ψηφίο ελέγχου)." };
  if (parsed.data.gemi && !/^\d{12}$/.test(parsed.data.gemi)) return { ok: false, error: "Ο αριθμός ΓΕΜΗ αποτελείται από 12 ψηφία." };
  const orgId = await createOrganization(db, user.id, { ...parsed.data, afm, email: parsed.data.email || user.email });
  await db
    .update(organizations)
    .set({
      mydataEnvironment: parsed.data.mydataEnvironment,
      mydataUserId: parsed.data.mydataUserId,
      mydataSubscriptionKey: parsed.data.mydataSubscriptionKey,
      defaultPaymentTermsDays: parsed.data.defaultPaymentTermsDays,
    })
    .where(eq(organizations.id, orgId));
  await db.update(users).set({ lastOrgId: orgId }).where(eq(users.id, user.id));
  await setActiveOrgCookie(orgId);
  redirect("/dashboard?welcome=1");
}

export async function switchOrgAction(orgId: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)) });
  if (!m) return;
  await db.update(users).set({ lastOrgId: orgId }).where(eq(users.id, user.id));
  await setActiveOrgCookie(orgId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

const ROLES: Role[] = ["owner", "admin", "member", "accountant"];

export async function inviteUserAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z.object({ email, role: z.enum(ROLES as [Role, ...Role[]]) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageUsers");
  if (error) return { ok: false, error };
  if (parsed.data.role === "owner" && ctx.role !== "owner") return { ok: false, error: "Μόνο ο ιδιοκτήτης μπορεί να ορίσει νέο ιδιοκτήτη." };
  try {
    await assertCanAddUser(db, ctx.org);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const token = randomToken(24);
  await db.insert(invitations).values({
    id: randomUUID(),
    orgId: ctx.org.id,
    email: parsed.data.email,
    role: parsed.data.role,
    token,
    invitedBy: ctx.user.id,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  await sendMail(db, {
    orgId: ctx.org.id,
    to: parsed.data.email,
    subject: `Πρόσκληση στην επιχείρηση ${ctx.org.name} – Σύνολο ERP`,
    html: layoutEmail(
      "Πρόσκληση συνεργασίας",
      `Ο/η <b>${ctx.user.name}</b> σας προσκαλεί να αποκτήσετε πρόσβαση στην επιχείρηση <b>${ctx.org.name}</b> με ρόλο <b>${parsed.data.role}</b>.`,
      { label: "Αποδοχή πρόσκλησης", url: appUrl(`/invite/${token}`) },
    ),
    relatedEntity: "invitation",
    relatedId: token,
  });
  await audit(db, ctx.org.id, "membership", parsed.data.email, "member_invited", `${parsed.data.email} → ${parsed.data.role}`, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

async function acceptInvitationInternal(db: Awaited<ReturnType<typeof getDb>>, userId: string, userEmail: string, token: string) {
  const inv = await db.query.invitations.findFirst({ where: eq(invitations.token, token) });
  if (!inv || inv.acceptedAt || new Date(inv.expiresAt) < new Date()) return false;
  if (inv.email.toLowerCase() !== userEmail.toLowerCase()) return false;
  await addMembership(db, userId, inv.orgId, inv.role as Role);
  await db.update(invitations).set({ acceptedAt: new Date().toISOString() }).where(eq(invitations.id, inv.id));
  await db.update(users).set({ lastOrgId: inv.orgId }).where(eq(users.id, userId));
  await setActiveOrgCookie(inv.orgId);
  return true;
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect(`/register?invite=${encodeURIComponent(token)}`);
  const ok = await acceptInvitationInternal(db, user.id, user.email, token);
  if (!ok) return { ok: false, error: "Η πρόσκληση δεν ισχύει ή αφορά διαφορετικό email." };
  redirect("/dashboard");
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageUsers");
  if (error) return { ok: false, error };
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.org.id)) });
  if (!m) return { ok: false, error: "Δεν βρέθηκε." };
  if (m.role === "owner") return { ok: false, error: "Ο ιδιοκτήτης δεν αφαιρείται." };
  await db.delete(memberships).where(eq(memberships.id, membershipId));
  await db.delete(sessions).where(eq(sessions.userId, m.userId));
  await audit(db, ctx.org.id, "membership", m.userId, "member_removed", m.role, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

export async function changeMemberRoleAction(membershipId: string, role: Role): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageUsers");
  if (error) return { ok: false, error };
  if (!ROLES.includes(role)) return { ok: false, error: "Άγνωστος ρόλος." };
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.id, membershipId), eq(memberships.orgId, ctx.org.id)) });
  if (!m) return { ok: false, error: "Δεν βρέθηκε." };
  if (m.role === "owner" && ctx.role !== "owner") return { ok: false, error: "Μόνο ο ιδιοκτήτης αλλάζει τον ρόλο ιδιοκτήτη." };
  await db.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
  await audit(db, ctx.org.id, "membership", m.userId, "member_role_changed", `${m.role} → ${role}`, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}
