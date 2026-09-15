import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmLinkInvites, firmMembers, organizations, users } from "@/db/schema";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { ClientLinkPanel } from "@/components/office/client-link-panel";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function OfficeClientsPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;

  const all = await firmClients(db, firm, { status: "all" });
  const invites = await db.select().from(firmLinkInvites).where(and(eq(firmLinkInvites.email, user.email.toLowerCase()), eq(firmLinkInvites.status, "pending")));
  const inviteOrgs = invites.length
    ? await db
        .select({ id: organizations.id, name: organizations.name, afm: organizations.afm })
        .from(organizations)
        .where(
          inArray(
            organizations.id,
            invites.map((i) => i.orgId),
          ),
        )
    : [];

  const members = await db.select().from(firmMembers).where(and(eq(firmMembers.firmUserId, firm.firmUserId), eq(firmMembers.status, "active")));
  const memberUsers = members.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(
          inArray(
            users.id,
            members.map((m) => m.userId),
          ),
        )
    : [];
  const owner = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, firm.firmUserId));

  return (
    <ClientLinkPanel
      role={firm.role}
      rows={all.map((c) => ({
        id: c.link.id,
        orgId: c.org.id,
        name: c.org.name,
        afm: c.org.afm || c.link.requestedAfm,
        status: c.link.status,
        accessLevel: c.accessLevel,
        source: c.link.source,
        assigneeUserId: c.link.assigneeUserId,
        createdAt: c.link.createdAt,
      }))}
      invites={invites.map((i) => {
        const org = inviteOrgs.find((o) => o.id === i.orgId);
        return { id: i.id, orgName: org?.name ?? "Επιχείρηση", afm: org?.afm ?? "", note: i.note, accessLevel: i.accessLevel, createdAt: i.createdAt };
      })}
      people={[...owner, ...memberUsers].map((p) => ({ id: p.id, label: p.name || p.email }))}
    />
  );
}
