import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmMembers, officeTasks, users } from "@/db/schema";
import { resolveFirm, firmClients, FIRM_ROLES } from "@/lib/services/firm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/date-range-picker";
import { resolveRange } from "@/lib/date-range";

export const dynamic = "force-dynamic";

const currentTimeMs = () => Date.now();


export default async function OfficeProductivityPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const orgIds = clients.map((c) => c.org.id);

  const allTasks = orgIds.length ? await db.select().from(officeTasks).where(inArray(officeTasks.orgId, orgIds)) : [];
  const tasks = allTasks.filter((t) => t.createdAt.slice(0, 10) >= range.from && t.createdAt.slice(0, 10) <= range.to);
  const members = await db.select().from(firmMembers).where(and(eq(firmMembers.firmUserId, firm.firmUserId), eq(firmMembers.status, "active")));
  const ids = [...new Set([firm.firmUserId, ...members.map((m) => m.userId)])];
  const people = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids));

  const nowMs = currentTimeMs();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const dueSoon = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= new Date(nowMs + 7 * 86_400_000).toISOString().slice(0, 10));
  const slaOk = tasks.length ? Math.round(((tasks.length - overdue.length) / tasks.length) * 100) : 100;

  const workload = people
    .map((p) => {
      const mine = open.filter((t) => t.assigneeUserId === p.id);
      const role = p.id === firm.firmUserId ? "owner" : (members.find((m) => m.userId === p.id)?.role as keyof typeof FIRM_ROLES) ?? "staff";
      return {
        id: p.id,
        label: p.name || p.email,
        role,
        open: mine.length,
        overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
        critical: mine.filter((t) => t.severity === "critical").length,
        clients: clients.filter((c) => c.link.assigneeUserId === p.id).length,
      };
    })
    .sort((a, b) => b.open - a.open);
  const unassigned = open.filter((t) => !t.assigneeUserId).length;
  const maxLoad = Math.max(1, ...workload.map((w) => w.open));

  const kpis: [string, string, string | null][] = [
    ["Ανοιχτές εκκρεμότητες", String(open.length), null],
    ["Εκπρόθεσμες", String(overdue.length), overdue.length ? "warn" : null],
    ["Λήγουν σε 7 ημέρες", String(dueSoon.length), null],
    ["Τήρηση SLA", `${slaOk}%`, slaOk < 80 ? "warn" : null],
    ["Ολοκληρωμένες", String(done.length), null],
    ["Χωρίς υπεύθυνο", String(unassigned), unassigned ? "warn" : null],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Παραγωγικότητα γραφείου</h1>
          <p className="text-sm text-muted-foreground">Τήρηση SLA, εκπρόθεσμα και φόρτος ανά συνεργάτη σε {clients.length} πελάτες.</p>
        </div>
        <DateRangePicker from={range.from} to={range.to} showCompare={false} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="productivity-kpis">
        {kpis.map(([label, value, tone]) => (
          <Card key={label} className={tone === "warn" ? "border-amber-300" : ""}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Φόρτος ανά συνεργάτη</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4" data-testid="workload-list">
          {workload.map((w) => (
            <div key={w.id} className="space-y-1" data-testid={`workload-${w.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {w.label} <span className="text-xs text-muted-foreground">· {FIRM_ROLES[w.role]}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {w.clients} πελάτες · {w.open} ανοιχτές
                  {w.overdue ? <Badge variant="destructive">{w.overdue} εκπρόθεσμες</Badge> : null}
                  {w.critical ? <Badge variant="outline">{w.critical} κρίσιμες</Badge> : null}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${(w.open / maxLoad) * 100}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Εκπρόθεσμες εκκρεμότητες ({overdue.length})</CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm" data-testid="overdue-list">
          {overdue.length === 0 ? (
            <p className="py-4 text-muted-foreground">Καμία εκπρόθεσμη εκκρεμότητα. Μπράβο!</p>
          ) : (
            overdue.slice(0, 25).map((t) => {
              const client = clients.find((c) => c.org.id === t.orgId);
              const days = Math.floor((nowMs - new Date(t.dueDate!).getTime()) / 86_400_000);
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0">
                  <div className="min-w-0">
                    <div className="truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{client?.org.name ?? "—"}</div>
                  </div>
                  <Badge variant="destructive">{days} ημ. καθυστέρηση</Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
