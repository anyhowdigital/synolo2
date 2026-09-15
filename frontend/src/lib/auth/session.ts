import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import type { Db } from "@/db";
import { memberships, organizations, sessions, users, type Membership, type Organization, type User } from "@/db/schema";
import { randomToken } from "./password";
import { ensurePlatformOverrides } from "@/lib/billing/platform-settings";

export const SESSION_COOKIE = "tc_session";
export const ORG_COOKIE = "tc_org";
const SESSION_DAYS = 30;

import { type Role } from "./roles";

export { PERMISSIONS, ROLE_LABELS, can, type Role } from "./roles";

export async function requestIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64);
}

export async function createSession(db: Db, userId: string) {
  const id = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const ua = (await headers()).get("user-agent") ?? "";
  const now = new Date().toISOString();
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt: expires.toISOString(),
    userAgent: ua.slice(0, 200),
    ipAddress: await requestIp(),
    lastSeenAt: now,
    createdAt: now,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires, path: "/" });
}

/** Το id της τρέχουσας session (για επισήμανση στη λίστα συσκευών). */
export async function currentSessionId(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession(db: Db) {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  jar.delete(SESSION_COOKIE);
  jar.delete(ORG_COOKIE);
}

export async function setActiveOrgCookie(orgId: string) {
  const jar = await cookies();
  jar.set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86_400 });
}

/** Τρέχων συνδεδεμένος χρήστης (ή null). Cached ανά request. */
export const getCurrentUser = cache(async (db: Db): Promise<User | null> => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Ενημέρωση «τελευταίας δραστηριότητας» το πολύ κάθε 5 λεπτά (αποφυγή write ανά request).
  if (!session.lastSeenAt || Date.now() - new Date(session.lastSeenAt).getTime() > 5 * 60_000) {
    try {
      await db.update(sessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(sessions.id, id));
    } catch {
      // Σε rendering χωρίς δικαίωμα εγγραφής (π.χ. static) αγνοείται.
    }
  }
  return (await db.query.users.findFirst({ where: eq(users.id, session.userId) })) ?? null;
});

export interface CurrentContext {
  user: User;
  org: Organization;
  membership: Membership;
  role: Role;
  orgs: { org: Organization; role: string }[];
}

/** Χρήστης + ενεργός οργανισμός + ρόλος. Επιστρέφει null αν δεν υπάρχει session ή οργανισμός. */
export const getCurrentContext = cache(async (db: Db): Promise<CurrentContext | null> => {
  await ensurePlatformOverrides(db);
  const user = await getCurrentUser(db);
  if (!user) return null;
  const rows = await db
    .select({ membership: memberships, org: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, user.id));
  if (rows.length === 0) return null;

  const jar = await cookies();
  const wanted = jar.get(ORG_COOKIE)?.value ?? user.lastOrgId ?? undefined;
  const picked = rows.find((r) => r.org.id === wanted) ?? rows[0];
  return {
    user,
    org: picked.org,
    membership: picked.membership,
    role: picked.membership.role as Role,
    orgs: rows.map((r) => ({ org: r.org, role: r.membership.role })),
  };
});

export async function addMembership(db: Db, userId: string, orgId: string, role: Role) {
  const existing = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)) });
  if (existing) return existing.id;
  const id = randomUUID();
  await db.insert(memberships).values({ id, userId, orgId, role, createdAt: new Date().toISOString() });
  return id;
}
