import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { accountantProfiles, firmLinks, firmMembers, organizations, users, type FirmLink, type Organization } from "@/db/schema";

export type FirmRole = "owner" | "partner" | "staff";
export type AccessLevel = "manager" | "full" | "read" | "mydata";

export const ACCESS_LEVELS: Record<AccessLevel, { label: string; hint: string }> = {
  manager: { label: "Διαχειριστής βιβλίων", hint: "Πλήρης πρόσβαση + διορθώσεις, διαβιβάσεις, κλείδωμα και συμφωνίες εξ ονόματος της επιχείρησης" },
  full: { label: "Πλήρης πρόσβαση", hint: "Βιβλία, τιμολόγηση, myDATA, μαζικές ενέργειες" },
  read: { label: "Μόνο ανάγνωση", hint: "Βλέπει στοιχεία και αναφορές, δεν αλλάζει τίποτα" },
  mydata: { label: "Μόνο myDATA & έγγραφα", hint: "Διαβίβαση/έλεγχος myDATA και αιτήματα εγγράφων" },
};

/** Επίπεδα που επιτρέπουν αλλαγές στα βιβλία του πελάτη. */
export const WRITE_LEVELS: AccessLevel[] = ["manager", "full"];

export const FIRM_ROLES: Record<FirmRole, string> = { owner: "Ιδιοκτήτης γραφείου", partner: "Συνεργάτης (partner)", staff: "Υπάλληλος" };

export interface FirmContext {
  /** Ο χρήστης-ιδιοκτήτης του γραφείου (κάτω του κρέμονται τα firm_links). */
  firmUserId: string;
  firmName: string;
  role: FirmRole;
  /** Ο συνδεδεμένος χρήστης. */
  userId: string;
}

/** Επιστρέφει το context γραφείου για τον συνδεδεμένο χρήστη (ιδιοκτήτης ή συνεργάτης). */
export async function resolveFirm(db: Db, userId: string): Promise<FirmContext | null> {
  const profile = await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, userId) });
  if (profile) return { firmUserId: userId, firmName: profile.firmName || "Λογιστικό γραφείο", role: "owner", userId };

  const member = (
    await db
      .select()
      .from(firmMembers)
      .where(and(eq(firmMembers.userId, userId), eq(firmMembers.status, "active")))
      .limit(1)
  )[0];
  if (!member) return null;
  const owner = await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, member.firmUserId) });
  return { firmUserId: member.firmUserId, firmName: owner?.firmName || "Λογιστικό γραφείο", role: member.role as FirmRole, userId };
}

export interface FirmClient {
  link: FirmLink;
  org: Organization;
  accessLevel: AccessLevel;
}

/**
 * Οι πελάτες του γραφείου. Ο υπάλληλος βλέπει μόνο όσους του έχουν ανατεθεί,
 * ο ιδιοκτήτης/partner όλους.
 */
export async function firmClients(db: Db, firm: FirmContext, opts: { status?: "active" | "all" } = {}): Promise<FirmClient[]> {
  const status = opts.status ?? "active";
  const links = await db
    .select()
    .from(firmLinks)
    .where(status === "active" ? and(eq(firmLinks.accountantUserId, firm.firmUserId), eq(firmLinks.status, "active")) : eq(firmLinks.accountantUserId, firm.firmUserId));
  const visible = firm.role === "staff" ? links.filter((l) => l.assigneeUserId === firm.userId) : links;
  if (!visible.length) return [];
  const orgs = await db
    .select()
    .from(organizations)
    .where(
      inArray(
        organizations.id,
        visible.map((l) => l.orgId),
      ),
    );
  return visible
    .map((link) => {
      const org = orgs.find((o) => o.id === link.orgId);
      return org ? { link, org, accessLevel: (link.accessLevel as AccessLevel) ?? "full" } : null;
    })
    .filter((x): x is FirmClient => x !== null)
    .sort((a, b) => a.org.name.localeCompare(b.org.name, "el"));
}

/** Ένας πελάτης του γραφείου με έλεγχο πρόσβασης (null αν δεν επιτρέπεται). */
export async function firmClient(db: Db, firm: FirmContext, orgId: string): Promise<FirmClient | null> {
  const clients = await firmClients(db, firm);
  return clients.find((c) => c.org.id === orgId) ?? null;
}

export function canWrite(level: AccessLevel) {
  return level === "full" || level === "manager";
}

export function canMyData(level: AccessLevel) {
  return level === "full" || level === "manager" || level === "mydata";
}

export function generateLinkCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export interface FirmTeamMember {
  userId: string;
  name: string;
  email: string;
  role: FirmRole;
}

/** Η ομάδα του γραφείου (ιδιοκτήτης + ενεργοί συνεργάτες) — για ανάθεση εργασιών. */
export async function firmTeam(db: Db, firm: FirmContext): Promise<FirmTeamMember[]> {
  const members = await db
    .select()
    .from(firmMembers)
    .where(and(eq(firmMembers.firmUserId, firm.firmUserId), eq(firmMembers.status, "active")));
  const ids = Array.from(new Set([firm.firmUserId, ...members.map((m) => m.userId)]));
  const us = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const byId = new Map(us.map((u) => [u.id, u]));
  const out: FirmTeamMember[] = [];
  const owner = byId.get(firm.firmUserId);
  if (owner) out.push({ userId: owner.id, name: owner.name, email: owner.email, role: "owner" });
  for (const m of members) {
    const u = byId.get(m.userId);
    if (u && u.id !== firm.firmUserId) out.push({ userId: u.id, name: u.name, email: u.email, role: m.role as FirmRole });
  }
  return out;
}
