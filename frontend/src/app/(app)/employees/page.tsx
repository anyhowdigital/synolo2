import Link from "next/link";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { listEmployees } from "@/lib/services/payroll";
import { listLeaveRequests } from "@/lib/services/leave";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination, TableShell } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Προσωπικό" };

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : "";
  const pageSize = parsePageSize(sp.pageSize);
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith("/employees", { q, status, pageSize }, patch);
  const db = await getDb();
  const { org } = await requireContext(db);
  const staff = await listEmployees(db, org.id);
  const leaves = await listLeaveRequests(db, org.id);
  const pending = leaves.filter((l) => l.status === "pending");
  const active = staff.filter((e) => e.active);
  const filtered = staff.filter((e) => (!q || `${e.lastName} ${e.firstName} ${e.afm} ${e.amka} ${e.specialtyName}`.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR"))) && (!status || e.active === (status === "active")));
  const paged = paginate(filtered, parsePage(sp.page), pageSize);

  return (
    <div className="space-y-6" data-testid="employees-page">
      <PageHeader title="Προσωπικό" description="Οι εργαζόμενοι της επιχείρησης όπως τους διαχειρίζεται ο λογιστής σας: βάρδιες, χρονομετρήσεις, αποδοχές, άδειες. Μόνο προβολή — οι αλλαγές γίνονται από το λογιστικό γραφείο." />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Ενεργοί εργαζόμενοι", String(active.length)],
          ["Μηνιαίο μισθολογικό κόστος", formatMoney(active.reduce((s, e) => s + (e.grossSalary > 0 ? e.grossSalary : e.dailyWage * 25) * 1.2229, 0))],
          ["Εκκρεμή αιτήματα άδειας", String(pending.length)],
        ].map(([l, v]) => (
          <Card key={l}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {pending.length ? (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20" data-testid="employees-pending-leaves">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Αιτήματα άδειας προς έγκριση</p>
            <ul className="mt-2 space-y-1">
              {pending.map((l) => (
                <li key={l.id}>
                  <Link href={`/employees/${l.employeeId}`} className="break-all underline-offset-4 hover:underline" data-testid={`employee-leave-${l.id}`}>
                    {l.employeeName}: {formatDate(l.fromDate)} – {formatDate(l.toDate)} ({l.days} ημ.)
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <FilterBar action="/employees" q={q} showDates={false} searchPlaceholder="Αναζήτηση ονόματος, ΑΦΜ, ΑΜΚΑ, ειδικότητας…"
          hidden={{ status, pageSize: String(pageSize) }} filtersActive={!!status} clearHref={linkFor({ q: "", status: "" })}
          chips={[{ key: "all", label: "Όλοι", href: linkFor({ status: "" }), active: !status }, { key: "active", label: "Ενεργοί", href: linkFor({ status: "active" }), active: status === "active" }, { key: "inactive", label: "Αποχωρήσαντες", href: linkFor({ status: "inactive" }), active: status === "inactive" }]} />
        <TableShell>
          <Table data-testid="employees-list">
            <TableHeader>
              <TableRow>
                <TableHead>Εργαζόμενος</TableHead>
                <TableHead>Ειδικότητα</TableHead>
                <TableHead>Σύμβαση</TableHead>
                <TableHead className="text-right">Ακαθάριστες</TableHead>
                <TableHead>Πρόσληψη</TableHead>
                <TableHead>Κατάσταση</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.total === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {q || status ? "Δεν βρέθηκαν εργαζόμενοι. Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση." : "Δεν έχουν καταχωρηθεί εργαζόμενοι. Ο λογιστής σας τους προσθέτει από το πάνελ του γραφείου."}
                  </TableCell>
                </TableRow>
              ) : (
                paged.rows.map((e) => (
                  <TableRow key={e.id} className={e.active ? "" : "opacity-60"}>
                    <TableCell>
                      <Link href={`/employees/${e.id}`} className="font-medium underline-offset-4 hover:underline" data-testid={`employee-link-${e.id}`}>
                        {e.lastName} {e.firstName}
                      </Link>
                      <p className="text-xs text-muted-foreground">ΑΦΜ {e.afm || "—"} · ΑΜΚΑ {e.amka || "—"}</p>
                    </TableCell>
                    <TableCell className="text-sm">{e.specialtyName || "—"}</TableCell>
                    <TableCell className="text-sm">{e.contractType === "full" ? "Πλήρης" : e.contractType === "part" ? "Μερική" : e.contractType}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.grossSalary > 0 ? formatMoney(e.grossSalary) : `${formatMoney(e.dailyWage)}/ημ.`}</TableCell>
                    <TableCell className="text-sm">{formatDate(e.hireDate)}</TableCell>
                    <TableCell>{e.active ? <Badge>Ενεργός</Badge> : <Badge variant="outline">Αποχώρησε {e.endDate ? formatDate(e.endDate) : ""}</Badge>}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableShell>
        <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun="εργαζόμενοι" />
      </div>
    </div>
  );
}
