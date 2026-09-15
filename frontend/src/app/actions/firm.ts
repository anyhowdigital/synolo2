"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  accountantProfiles,
  firmFeeCharges,
  firmFees,
  firmLinkInvites,
  firmLinks,
  firmMembers,
  firmStaffInvites,
  memberships,
  organizations,
  users,
} from "@/db/schema";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { requireContext } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveFirm, generateLinkCode, type AccessLevel, type FirmRole } from "@/lib/services/firm";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";
import { normalizeAfm } from "@/lib/greek/afm";

type Res<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const DAY = 86_400_000;
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/* ------------------------------ Πλευρά επιχείρησης ------------------------------ */

async function businessCtx() {
  const db = await getDb();
  const ctx = await requireContext(db);
  if (ctx.role !== "owner" && ctx.role !== "admin") return { db, ctx, error: "Μόνο ο ιδιοκτήτης/διαχειριστής διαχειρίζεται τη συνεργασία λογιστή." as string | null };
  return { db, ctx, error: null as string | null };
}

/** Παράγει 6ψήφιο κωδικό σύνδεσης (7 ημέρες) – ο λογιστής συνδέεται άμεσα με αυτόν. */
export async function generateAccountantCodeAction(): Promise<Res<{ code: string; expiresAt: string }>> {
  const { db, ctx, error } = await businessCtx();
  if (error) return { ok: false, error };
  const code = generateLinkCode();
  const expiresAt = iso(7 * DAY);
  await db.update(organizations).set({ accountantLinkCode: code, accountantLinkCodeExpires: expiresAt }).where(eq(organizations.id, ctx.org.id));
  await audit(db, ctx.org.id, "firm_link", "code", "accountant_code_generated");
  revalidatePath("/settings");
  return { ok: true, code, expiresAt };
}

export async function revokeAccountantCodeAction(): Promise<Res> {
  const { db, ctx, error } = await businessCtx();
  if (error) return { ok: false, error };
  await db.update(organizations).set({ accountantLinkCode: "", accountantLinkCodeExpires: null }).where(eq(organizations.id, ctx.org.id));
  revalidatePath("/settings");
  return { ok: true };
}

/** Πρόσκληση λογιστικού γραφείου με email – το γραφείο την αποδέχεται στο /office/clients. */
export async function inviteAccountantAction(emailRaw: string, note: string, level: AccessLevel): Promise<Res> {
  const { db, ctx, error } = await businessCtx();
  if (error) return { ok: false, error };
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Μη έγκυρο email γραφείου." };

  const open = await db.query.firmLinkInvites.findFirst({ where: and(eq(firmLinkInvites.orgId, ctx.org.id), eq(firmLinkInvites.email, email), eq(firmLinkInvites.status, "pending")) });
  if (open) return { ok: false, error: "Υπάρχει ήδη ενεργή πρόσκληση για αυτό το email." };

  await db.insert(firmLinkInvites).values({
    id: randomUUID(),
    orgId: ctx.org.id,
    email,
    note: note.trim().slice(0, 300),
    accessLevel: level,
    status: "pending",
    createdAt: iso(),
    expiresAt: iso(14 * DAY),
  });
  await sendMail(db, {
    orgId: ctx.org.id,
    to: email,
    subject: `${ctx.org.name}: πρόσκληση λογιστικής συνεργασίας`,
    html: layoutEmail(
      "Πρόσκληση λογιστικής συνεργασίας",
      `<p>Η επιχείρηση <strong>${ctx.org.name}</strong> (ΑΦΜ ${ctx.org.afm}) σας προσκαλεί να αναλάβετε τη λογιστική υποστήριξή της.</p>
       <p>Συνδεθείτε στο πάνελ γραφείου και αποδεχτείτε την πρόσκληση από τους «Πελάτες».</p>`,
      { label: "Άνοιγμα πάνελ γραφείου", url: appUrl("/office/clients") },
    ),
    relatedEntity: "firm_link",
    relatedId: email,
  });
  await audit(db, ctx.org.id, "firm_link", email, "accountant_invited", `Πρόσκληση σε ${email}`);
  revalidatePath("/settings");
  return { ok: true };
}

export async function cancelAccountantInviteAction(id: string): Promise<Res> {
  const { db, ctx, error } = await businessCtx();
  if (error) return { ok: false, error };
  await db.update(firmLinkInvites).set({ status: "cancelled" }).where(and(eq(firmLinkInvites.id, id), eq(firmLinkInvites.orgId, ctx.org.id)));
  revalidatePath("/settings");
  return { ok: true };
}

/** Αλλαγή επιπέδου πρόσβασης συνεργασίας – ορίζεται από την επιχείρηση. */
export async function setFirmLinkAccessAction(linkId: string, level: AccessLevel): Promise<Res> {
  const { db, ctx, error } = await businessCtx();
  if (error) return { ok: false, error };
  const link = await db.query.firmLinks.findFirst({ where: and(eq(firmLinks.id, linkId), eq(firmLinks.orgId, ctx.org.id)) });
  if (!link) return { ok: false, error: "Η συνεργασία δεν βρέθηκε." };
  await db.update(firmLinks).set({ accessLevel: level }).where(eq(firmLinks.id, linkId));
  await db.update(memberships).set({ role: level === "manager" ? "admin" : level === "full" ? "accountant" : "viewer" }).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, link.accountantUserId)));
  await audit(db, ctx.org.id, "firm_link", linkId, "accountant_access_changed", level);
  revalidatePath("/settings");
  return { ok: true };
}

/** Διακοπή συνεργασίας από την επιχείρηση. */
export async function unlinkAccountantAction(linkId: string): Promise<Res> {
  const { db, ctx, error } = await businessCtx();
  if (error) return { ok: false, error };
  const link = await db.query.firmLinks.findFirst({ where: and(eq(firmLinks.id, linkId), eq(firmLinks.orgId, ctx.org.id)) });
  if (!link) return { ok: false, error: "Η συνεργασία δεν βρέθηκε." };
  await db.delete(firmLinks).where(eq(firmLinks.id, linkId));
  await db.delete(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, link.accountantUserId)));
  await audit(db, ctx.org.id, "firm_link", linkId, "accountant_unlinked", "Διακοπή από την επιχείρηση");
  revalidatePath("/settings");
  return { ok: true };
}

/* ------------------------------ Πλευρά γραφείου ------------------------------ */

async function firmCtx() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { db, user: null, firm: null, error: "Απαιτείται σύνδεση." as string | null };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { db, user, firm: null, error: "Ο λογαριασμός δεν ανήκει σε λογιστικό γραφείο." as string | null };
  return { db, user, firm, error: null as string | null };
}

async function activateLink(db: Awaited<ReturnType<typeof getDb>>, orgId: string, accountantUserId: string, level: AccessLevel, source: string) {
  const now = iso();
  const existing = await db.query.firmLinks.findFirst({ where: and(eq(firmLinks.orgId, orgId), eq(firmLinks.accountantUserId, accountantUserId)) });
  const linkId = existing?.id ?? randomUUID();
  if (existing) {
    await db.update(firmLinks).set({ status: "active", accessLevel: level, decidedAt: now, source }).where(eq(firmLinks.id, existing.id));
  } else {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
    await db.insert(firmLinks).values({
      id: linkId,
      accountantUserId,
      orgId,
      status: "active",
      requestedAfm: org?.afm ?? "",
      note: "",
      accessLevel: level,
      source,
      createdAt: now,
      decidedAt: now,
    });
  }
  const already = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, accountantUserId)) });
  if (!already) {
    await db.insert(memberships).values({ id: randomUUID(), orgId, userId: accountantUserId, role: level === "manager" ? "admin" : level === "full" ? "accountant" : "viewer", createdAt: now });
  }
  return linkId;
}

/** Σύνδεση με 6ψήφιο κωδικό της επιχείρησης – άμεση, χωρίς αναμονή έγκρισης. */
export async function linkByCodeAction(codeRaw: string): Promise<Res<{ orgName: string }>> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  const code = codeRaw.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Ο κωδικός είναι 6 ψηφία." };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.accountantLinkCode, code) });
  if (!org) return { ok: false, error: "Ο κωδικός δεν αντιστοιχεί σε επιχείρηση." };
  if (org.accountantLinkCodeExpires && org.accountantLinkCodeExpires < iso()) return { ok: false, error: "Ο κωδικός έχει λήξει. Ζητήστε νέο από την επιχείρηση." };

  const linkId = await activateLink(db, org.id, firm.firmUserId, "full", "code");
  await db.update(organizations).set({ accountantLinkCode: "", accountantLinkCodeExpires: null }).where(eq(organizations.id, org.id));
  await audit(db, org.id, "firm_link", linkId, "accountant_linked_by_code", firm.firmName);
  revalidatePath("/office/clients");
  revalidatePath("/office");
  return { ok: true, orgName: org.name };
}

/** Αποδοχή πρόσκλησης που έστειλε η επιχείρηση στο email του γραφείου. */
export async function respondOrgInviteAction(inviteId: string, accept: boolean): Promise<Res> {
  const { db, user, firm, error } = await firmCtx();
  if (error || !firm || !user) return { ok: false, error: error ?? "Σφάλμα." };
  const invite = await db.query.firmLinkInvites.findFirst({ where: and(eq(firmLinkInvites.id, inviteId), eq(firmLinkInvites.status, "pending")) });
  if (!invite || invite.email !== user.email.toLowerCase()) return { ok: false, error: "Η πρόσκληση δεν βρέθηκε." };
  await db.update(firmLinkInvites).set({ status: accept ? "accepted" : "declined" }).where(eq(firmLinkInvites.id, inviteId));
  if (accept) {
    const linkId = await activateLink(db, invite.orgId, firm.firmUserId, (invite.accessLevel as AccessLevel) ?? "full", "invite");
    await audit(db, invite.orgId, "firm_link", linkId, "accountant_accepted_invite", firm.firmName);
  }
  revalidatePath("/office/clients");
  revalidatePath("/office");
  return { ok: true };
}

/** Διακοπή συνεργασίας από το γραφείο. */
export async function firmUnlinkAction(linkId: string): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  if (firm.role === "staff") return { ok: false, error: "Μόνο ο ιδιοκτήτης/partner διακόπτει συνεργασία." };
  const link = await db.query.firmLinks.findFirst({ where: and(eq(firmLinks.id, linkId), eq(firmLinks.accountantUserId, firm.firmUserId)) });
  if (!link) return { ok: false, error: "Η συνεργασία δεν βρέθηκε." };
  await db.delete(firmLinks).where(eq(firmLinks.id, linkId));
  await db.delete(memberships).where(and(eq(memberships.orgId, link.orgId), eq(memberships.userId, firm.firmUserId)));
  await audit(db, link.orgId, "firm_link", linkId, "accountant_unlinked", `Διακοπή από το γραφείο ${firm.firmName}`);
  revalidatePath("/office/clients");
  return { ok: true };
}

/** Ανάθεση πελάτη σε συνεργάτη του γραφείου. */
export async function assignClientAction(linkId: string, userId: string | null): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  if (firm.role === "staff") return { ok: false, error: "Μόνο ο ιδιοκτήτης/partner αναθέτει πελάτες." };
  await db.update(firmLinks).set({ assigneeUserId: userId }).where(and(eq(firmLinks.id, linkId), eq(firmLinks.accountantUserId, firm.firmUserId)));
  revalidatePath("/office/clients");
  revalidatePath("/office/team");
  return { ok: true };
}

/* ------------------------------ Ομάδα γραφείου ------------------------------ */

export async function inviteStaffAction(emailRaw: string, role: FirmRole): Promise<Res<{ url: string }>> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  if (firm.role !== "owner") return { ok: false, error: "Μόνο ο ιδιοκτήτης του γραφείου προσκαλεί συνεργάτες." };
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Μη έγκυρο email." };

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  const now = iso();
  if (existingUser) {
    const already = await db.query.firmMembers.findFirst({ where: and(eq(firmMembers.firmUserId, firm.firmUserId), eq(firmMembers.userId, existingUser.id)) });
    if (already) return { ok: false, error: "Ο χρήστης είναι ήδη στην ομάδα." };
    await db.insert(firmMembers).values({ id: randomUUID(), firmUserId: firm.firmUserId, userId: existingUser.id, role, status: "active", createdAt: now });
    revalidatePath("/office/team");
    return { ok: true, url: appUrl("/office") };
  }

  const token = randomUUID().replace(/-/g, "");
  await db.insert(firmStaffInvites).values({ id: randomUUID(), firmUserId: firm.firmUserId, email, role, token, status: "pending", createdAt: now, expiresAt: iso(14 * DAY) });
  revalidatePath("/office/team");
  return { ok: true, url: appUrl(`/office-join/${token}`) };
}

export async function removeStaffAction(memberId: string): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  if (firm.role !== "owner") return { ok: false, error: "Μόνο ο ιδιοκτήτης του γραφείου αλλάζει την ομάδα." };
  await db.delete(firmMembers).where(and(eq(firmMembers.id, memberId), eq(firmMembers.firmUserId, firm.firmUserId)));
  revalidatePath("/office/team");
  return { ok: true };
}

export async function cancelStaffInviteAction(id: string): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  await db.update(firmStaffInvites).set({ status: "cancelled" }).where(and(eq(firmStaffInvites.id, id), eq(firmStaffInvites.firmUserId, firm.firmUserId)));
  revalidatePath("/office/team");
  return { ok: true };
}

/* ------------------------------ Αμοιβές γραφείου ------------------------------ */

export async function saveFeeAction(orgId: string, amount: number, cadence: string, note: string): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  const existing = await db.query.firmFees.findFirst({ where: and(eq(firmFees.firmUserId, firm.firmUserId), eq(firmFees.orgId, orgId)) });
  if (existing) {
    await db.update(firmFees).set({ amount, cadence, note: note.slice(0, 200), active: amount > 0 }).where(eq(firmFees.id, existing.id));
  } else {
    await db.insert(firmFees).values({ id: randomUUID(), firmUserId: firm.firmUserId, orgId, amount, cadence, note: note.slice(0, 200), active: amount > 0, createdAt: iso() });
  }
  revalidatePath("/office/fees");
  return { ok: true };
}

/** Δημιουργεί τις χρεώσεις του μήνα για όλους τους πελάτες με ενεργή αμοιβή (idempotent). */
export async function generateFeeChargesAction(month: string): Promise<Res<{ created: number; total: number }>> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Μη έγκυρος μήνας." };
  const fees = await db.select().from(firmFees).where(and(eq(firmFees.firmUserId, firm.firmUserId), eq(firmFees.active, true)));
  let created = 0;
  let total = 0;
  for (const fee of fees) {
    if (fee.cadence === "quarterly" && ![1, 4, 7, 10].includes(Number(month.slice(5, 7)))) continue;
    if (fee.cadence === "annual" && month.slice(5, 7) !== "01") continue;
    const exists = await db.query.firmFeeCharges.findFirst({ where: and(eq(firmFeeCharges.firmUserId, firm.firmUserId), eq(firmFeeCharges.orgId, fee.orgId), eq(firmFeeCharges.month, month)) });
    if (exists) continue;
    await db.insert(firmFeeCharges).values({ id: randomUUID(), firmUserId: firm.firmUserId, orgId: fee.orgId, month, amount: fee.amount, status: "unpaid", createdAt: iso() });
    created++;
    total += fee.amount;
  }
  revalidatePath("/office/fees");
  return { ok: true, created, total: Math.round(total * 100) / 100 };
}

export async function markFeeChargeAction(id: string, paid: boolean): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  await db
    .update(firmFeeCharges)
    .set({ status: paid ? "paid" : "unpaid", paidAt: paid ? iso() : null })
    .where(and(eq(firmFeeCharges.id, id), eq(firmFeeCharges.firmUserId, firm.firmUserId)));
  revalidatePath("/office/fees");
  return { ok: true };
}

/** Αποδοχή πρόσκλησης συνεργάτη γραφείου (δημιουργεί λογαριασμό αν δεν υπάρχει). */
export async function acceptStaffInviteAction(_prev: { ok: boolean; error?: string } | null, fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const token = String(fd.get("token") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const db = await getDb();
  const invite = await db.query.firmStaffInvites.findFirst({ where: and(eq(firmStaffInvites.token, token), eq(firmStaffInvites.status, "pending")) });
  if (!invite) return { ok: false, error: "Η πρόσκληση δεν βρέθηκε ή έχει χρησιμοποιηθεί." };
  if (invite.expiresAt < iso()) return { ok: false, error: "Η πρόσκληση έχει λήξει." };

  const now = iso();
  let user = await db.query.users.findFirst({ where: eq(users.email, invite.email) });
  if (!user) {
    if (name.length < 2) return { ok: false, error: "Συμπληρώστε το ονοματεπώνυμό σας." };
    if (password.length < 8) return { ok: false, error: "Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες." };
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, email: invite.email, name, passwordHash: await hashPassword(password), createdAt: now });
    user = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  }
  const already = await db.query.firmMembers.findFirst({ where: and(eq(firmMembers.firmUserId, invite.firmUserId), eq(firmMembers.userId, user.id)) });
  if (!already) {
    await db.insert(firmMembers).values({ id: randomUUID(), firmUserId: invite.firmUserId, userId: user.id, role: invite.role, status: "active", createdAt: now });
  }
  await db.update(firmStaffInvites).set({ status: "accepted" }).where(eq(firmStaffInvites.id, invite.id));
  await createSession(db, user.id);
  redirect("/office");
}

/* ------------------------------ Αίτημα με ΑΦΜ (συμπλήρωμα) ------------------------------ */

/** Το γραφείο ακυρώνει ένα δικό του εκκρεμές αίτημα ΑΦΜ. */
export async function cancelFirmRequestAction(linkId: string): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  await db.delete(firmLinks).where(and(eq(firmLinks.id, linkId), eq(firmLinks.accountantUserId, firm.firmUserId), eq(firmLinks.status, "pending")));
  revalidatePath("/office/clients");
  return { ok: true };
}

/** Ενημέρωση στοιχείων γραφείου. */
export async function updateFirmProfileAction(patch: { firmName?: string; phone?: string; city?: string; afm?: string }): Promise<Res> {
  const { db, firm, error } = await firmCtx();
  if (error || !firm) return { ok: false, error: error ?? "Σφάλμα." };
  if (firm.role !== "owner") return { ok: false, error: "Μόνο ο ιδιοκτήτης αλλάζει τα στοιχεία του γραφείου." };
  await db
    .update(accountantProfiles)
    .set({ ...(patch.firmName ? { firmName: patch.firmName } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}), ...(patch.city !== undefined ? { city: patch.city } : {}), ...(patch.afm !== undefined ? { afm: normalizeAfm(patch.afm) } : {}) })
    .where(eq(accountantProfiles.userId, firm.firmUserId));
  revalidatePath("/office");
  return { ok: true };
}
