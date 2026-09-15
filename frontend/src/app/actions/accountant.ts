"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { accountantProfiles, firmLinks, memberships, organizations, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { requireContext } from "@/lib/services/org";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import { audit } from "@/lib/services/audit";

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  name: z.string().trim().min(2, "Συμπληρώστε το ονοματεπώνυμό σας."),
  firmName: z.string().trim().min(2, "Συμπληρώστε την επωνυμία του γραφείου."),
  email: z.string().trim().toLowerCase().email("Μη έγκυρο email."),
  password: z.string().min(8, "Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες."),
  afm: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
});

/** Εγγραφή λογιστικού γραφείου: δικός του λογαριασμός, χωρίς δική του επιχείρηση. */
export async function registerAccountantAction(_prev: Result | null, fd: FormData): Promise<Result> {
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, firmName, email, password } = parsed.data;
  const db = await getDb();

  const exists = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (exists) return { ok: false, error: "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε." };

  const userId = randomUUID();
  const now = new Date().toISOString();
  await db.insert(users).values({ id: userId, email, name, passwordHash: await hashPassword(password), createdAt: now });
  await db.insert(accountantProfiles).values({
    id: randomUUID(),
    userId,
    firmName,
    afm: normalizeAfm(parsed.data.afm ?? ""),
    phone: (parsed.data.phone ?? "").trim(),
    city: (parsed.data.city ?? "").trim(),
    createdAt: now,
  });
  await createSession(db, userId);
  redirect("/office");
}

/** Αίτημα συνεργασίας με επιχείρηση βάσει ΑΦΜ – εγκρίνεται από τον ιδιοκτήτη. */
export async function requestFirmLinkAction(afmRaw: string, note: string): Promise<Result & { pending?: boolean }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const profile = await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, user.id) });
  if (!profile) return { ok: false, error: "Ο λογαριασμός δεν είναι λογιστικού γραφείου." };

  const afm = normalizeAfm(afmRaw);
  if (!isValidAfm(afm)) return { ok: false, error: "Μη έγκυρο ΑΦΜ επιχείρησης." };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.afm, afm) });
  if (!org) return { ok: false, error: "Δεν βρέθηκε επιχείρηση με αυτό το ΑΦΜ στην πλατφόρμα." };

  const existing = await db.query.firmLinks.findFirst({
    where: and(eq(firmLinks.accountantUserId, user.id), eq(firmLinks.orgId, org.id)),
  });
  if (existing && existing.status !== "rejected") {
    return { ok: false, error: existing.status === "active" ? "Η συνεργασία είναι ήδη ενεργή." : "Το αίτημα εκκρεμεί έγκριση από την επιχείρηση." };
  }

  await db.insert(firmLinks).values({
    id: randomUUID(),
    accountantUserId: user.id,
    orgId: org.id,
    status: "pending",
    requestedAfm: afm,
    note: note.trim().slice(0, 300),
    createdAt: new Date().toISOString(),
  });
  revalidatePath("/office/clients");
  return { ok: true, pending: true };
}

/** Έγκριση/απόρριψη αιτήματος – μόνο owner/admin της επιχείρησης (αποτροπή privilege escalation). */
export async function decideFirmLinkAction(linkId: string, approve: boolean): Promise<Result> {
  const db = await getDb();
  const ctx = await requireContext(db);
  if (ctx.role !== "owner" && ctx.role !== "admin") return { ok: false, error: "Μόνο ο ιδιοκτήτης μπορεί να εγκρίνει συνεργασία λογιστή." };

  const link = await db.query.firmLinks.findFirst({ where: and(eq(firmLinks.id, linkId), eq(firmLinks.orgId, ctx.org.id)) });
  if (!link || link.status !== "pending") return { ok: false, error: "Το αίτημα δεν βρέθηκε ή έχει απαντηθεί." };

  const now = new Date().toISOString();
  await db.update(firmLinks).set({ status: approve ? "active" : "rejected", decidedAt: now }).where(eq(firmLinks.id, linkId));

  if (approve) {
    const already = await db.query.memberships.findFirst({
      where: and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, link.accountantUserId)),
    });
    if (!already) {
      await db.insert(memberships).values({ id: randomUUID(), orgId: ctx.org.id, userId: link.accountantUserId, role: "accountant", createdAt: now });
    }
  }
  await audit(db, ctx.org.id, "firm_link", linkId, approve ? "accountant_linked" : "accountant_rejected");
  revalidatePath("/settings");
  return { ok: true };
}
