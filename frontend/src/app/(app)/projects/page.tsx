import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { projects, customers, timeEntries } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { orgHasFeature } from "@/lib/billing/limits";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { can } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/invoice/totals";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination, TableShell } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";

const STATUS_LABEL: Record<string, string> = {
  active: "Ενεργό",
  on_hold: "Σε αναμονή",
  completed: "Ολοκληρωμένο",
  archived: "Αρχείο",
};
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  archived: "bg-muted text-muted-foreground",
};

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && sp.status in STATUS_LABEL ? sp.status : "";
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const pageSize = parsePageSize(sp.pageSize);
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith("/projects", { q, status, from, to, pageSize }, patch);
  const db = await getDb();
  const { org, role } = await requireContext(db);
  if (!orgHasFeature(org, "projects")) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <UpgradeNotice capability="projects" />
      </div>
    );
  }
  const canWrite = can(role, "write");
  const rows = await db.select().from(projects).where(eq(projects.orgId, org.id)).orderBy(desc(projects.createdAt));
  const allCustomers = await db.select().from(customers).where(eq(customers.orgId, org.id));
  const custMap = new Map(allCustomers.map((c) => [c.id, c.name]));
  const filtered = rows.filter((p) => {
    const date = p.createdAt.slice(0, 10);
    return (!q || `${p.name} ${p.code} ${custMap.get(p.customerId ?? "") ?? ""}`.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR")))
      && (!status || p.status === status) && (!from || date >= from) && (!to || date <= to);
  });
  const paged = paginate(filtered, parsePage(sp.page), pageSize);
  const hasFilters = !!(q || status || from || to);
  const allTime = await db.select().from(timeEntries).where(eq(timeEntries.orgId, org.id));
  const stats = new Map<string, { minutes: number; unbilled: number; revenue: number }>();
  for (const t of allTime) {
    const s = stats.get(t.projectId) ?? { minutes: 0, unbilled: 0, revenue: 0 };
    s.minutes += t.minutes;
    if (t.billable && t.status === "logged") s.unbilled += (t.hourlyRate * t.minutes) / 60;
    if (t.status === "invoiced") s.revenue += (t.hourlyRate * t.minutes) / 60;
    stats.set(t.projectId, s);
  }

  return (
    <>
      <PageHeader
        title="Έργα & χρονοχρέωση"
        description="Παρακολουθήστε ώρες, έξοδα και κερδοφορία ανά έργο. Τιμολογήστε μη χρεωμένες ώρες με ένα κλικ."
      >
        {canWrite ? (
          <Button asChild data-testid="new-project-btn">
            <Link href="/projects/new">
              <Plus data-icon="inline-start" /> Νέο έργο
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <FilterBar action="/projects" q={q} from={from} to={to} searchPlaceholder="Αναζήτηση έργου, πελάτη, κωδικού…"
        hidden={{ status, pageSize: String(pageSize) }} filtersActive={!!status} clearHref={linkFor({ q: "", status: "", from: "", to: "" })}
        chips={[{ key: "all", label: "Όλα", href: linkFor({ status: "" }), active: !status }, ...Object.entries(STATUS_LABEL).map(([key, label]) => ({ key, label, href: linkFor({ status: key }), active: status === key }))]} />
      <p className="mb-3 text-xs text-muted-foreground" data-testid="projects-date-hint">Το εύρος ημερομηνιών αφορά τη δημιουργία του έργου.</p>
      {paged.total === 0 ? (
        <EmptyState
          title={hasFilters ? "Δεν βρέθηκαν έργα" : "Δεν υπάρχουν έργα ακόμη"}
          description={hasFilters ? "Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση." : "Δημιουργήστε το πρώτο σας έργο για να καταγράφετε ώρες, έξοδα και να εκδίδετε τιμολόγια βάσει χρόνου."}
        />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Έργο</TableHead>
                <TableHead>Πελάτης</TableHead>
                <TableHead>Κατάσταση</TableHead>
                <TableHead className="text-right">Ώρες</TableHead>
                <TableHead className="text-right">Μη χρεωμένα</TableHead>
                <TableHead className="text-right">Τιμολογημένα</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map((p) => {
                const s = stats.get(p.id) ?? { minutes: 0, unbilled: 0, revenue: 0 };
                return (
                  <TableRow key={p.id} data-testid={`project-row-${p.id}`}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="block max-w-[240px] truncate font-medium hover:underline" title={p.name} data-testid={`project-open-${p.id}`}>
                        <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: p.color }} />
                        {p.name}
                      </Link>
                      {p.code ? <div className="text-xs text-muted-foreground">Κωδικός: {p.code}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{p.customerId ? custMap.get(p.customerId) ?? "—" : "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{(s.minutes / 60).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{formatMoney(s.unbilled)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{formatMoney(s.revenue)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableShell>
      )}
      <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun="έργα" />
    </>
  );
}
