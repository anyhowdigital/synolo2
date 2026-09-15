import { desc, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { officeTasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClients, firmTeam } from "@/lib/services/firm";
import { PageHeader } from "@/components/page-header";
import { OfficeTaskList } from "@/components/accountant/office-task-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Εκκρεμότητες γραφείου" };

export default async function OfficeTasksPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login?next=/office/tasks");
  const firm = await resolveFirm(db, user.id);
  if (!firm) redirect("/office");
  const clients = await firmClients(db, firm);
  const scoped = sp.org ? clients.filter((c) => c.org.id === sp.org) : clients;
  const orgIds = scoped.map((c) => c.org.id);

  const tasks = orgIds.length ? await db.select().from(officeTasks).where(inArray(officeTasks.orgId, orgIds)).orderBy(desc(officeTasks.severity), officeTasks.dueDate) : [];
  const team = await firmTeam(db, firm);
  const people = team.map((t) => ({ id: t.userId, name: t.name, email: t.email }));

  const orgNames = new Map(scoped.map((c) => [c.org.id, c.org.name]));
  const items = tasks.map((t) => ({
    id: t.id,
    orgName: orgNames.get(t.orgId) ?? "—",
    orgId: t.orgId,
    title: t.title,
    severity: t.severity,
    status: t.status,
    dueDate: t.dueDate,
    assigneeUserId: t.assigneeUserId,
    note: t.note,
  }));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Εκκρεμότητες γραφείου"
        description={`${items.filter((i) => i.status === "open").length} ανοιχτές εκκρεμότητες σε ${scoped.length} πελάτες${sp.org ? " (φίλτρο πελάτη)" : ""}. Ανάθεση σε συνεργάτη και προθεσμία παράδοσης (SLA).`}
      />
      <OfficeTaskList items={items} people={people.map((p) => ({ id: p.id, label: p.name || p.email }))} />
    </div>
  );
}
