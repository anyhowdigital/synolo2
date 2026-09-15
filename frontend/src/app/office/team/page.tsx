import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmMembers, firmStaffInvites, users } from "@/db/schema";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { TeamPanel } from "@/components/office/team-panel";

export const dynamic = "force-dynamic";

export default async function OfficeTeamPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;

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
  const invites = await db.select().from(firmStaffInvites).where(and(eq(firmStaffInvites.firmUserId, firm.firmUserId), eq(firmStaffInvites.status, "pending")));
  const [owner] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, firm.firmUserId));
  const clients = await firmClients(db, firm);

  return (
    <TeamPanel
      role={firm.role}
      firmName={firm.firmName}
      owner={{ id: owner.id, label: owner.name || owner.email, email: owner.email }}
      members={members.map((m) => {
        const u = memberUsers.find((x) => x.id === m.userId);
        return { id: m.id, userId: m.userId, label: u?.name || u?.email || m.userId, email: u?.email ?? "", role: m.role, clients: clients.filter((c) => c.link.assigneeUserId === m.userId).length };
      })}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token, createdAt: i.createdAt }))}
      ownerClients={clients.filter((c) => !c.link.assigneeUserId || c.link.assigneeUserId === firm.firmUserId).length}
    />
  );
}
