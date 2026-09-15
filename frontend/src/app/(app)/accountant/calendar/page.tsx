import { inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { officeTasks } from "@/db/schema";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { taxDeadlines } from "@/lib/services/compliance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ημερολόγιο γραφείου" };

export default async function OfficeCalendarPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  const firm = await resolveFirm(db, user.id);
  if (!firm) redirect("/office");
  const orgs = (await firmClients(db, firm)).map((c) => c.org);
  const orgIds = orgs.map((o) => o.id);
  const tasks = orgIds.length ? await db.select().from(officeTasks).where(inArray(officeTasks.orgId, orgIds)) : [];

  const rows = orgs
    .flatMap((org) =>
      taxDeadlines(org)
        .items.filter((d) => d.days >= -30 && d.days <= 120)
        .map((d) => {
          const task = tasks.find((t) => t.orgId === org.id && t.code === `deadline:${d.code}:${d.date}`);
          return {
            key: `${org.id}-${d.code}-${d.date}`,
            orgId: org.id,
            orgName: org.name,
            title: d.title,
            date: d.date,
            days: d.days,
            done: task?.status === "done",
            assignee: task?.assigneeUserId ?? null,
          };
        }),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }

  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("el-GR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title="Ημερολόγιο υποχρεώσεων γραφείου" description={`Όλες οι φορολογικές προθεσμίες ${orgs.length} επιχειρήσεων σε ένα σημείο, με κατάσταση και υπεύθυνο.`}>
        <Button asChild variant="outline">
          <Link href="/office/tasks">Εκκρεμότητες →</Link>
        </Button>
      </PageHeader>

      <div className="space-y-6" data-testid="office-calendar">
        {[...byMonth.entries()].map(([month, items]) => (
          <Card key={month}>
            <CardHeader>
              <CardTitle className="capitalize">{monthLabel(month)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((r) => (
                <div key={r.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3" data-testid={`calendar-item-${r.days < 0 ? "past" : r.days <= 7 ? "soon" : "future"}`}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.orgName}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">{new Date(`${r.date}T00:00:00Z`).toLocaleDateString("el-GR", { timeZone: "UTC" })}</span>
                    {r.done ? (
                      <Badge variant="secondary">Υποβλήθηκε</Badge>
                    ) : r.days < 0 ? (
                      <Badge variant="destructive">Εκπρόθεσμο</Badge>
                    ) : r.days <= 7 ? (
                      <Badge variant="destructive">σε {r.days} ημ.</Badge>
                    ) : (
                      <Badge variant="outline">σε {r.days} ημ.</Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Δεν βρέθηκαν προθεσμίες.</p> : null}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Οι προθεσμίες υπολογίζονται από τον τύπο βιβλίων κάθε επιχείρησης. Για ανάθεση σε συνεργάτη και SLA, δείτε τις{" "}
        <Link href="/office/tasks" className="underline">
          Εκκρεμότητες γραφείου
        </Link>
        . Σημείωση: παρατάσεις της ΑΑΔΕ δεν περιλαμβάνονται αυτόματα.
      </p>
    </>
  );
}
