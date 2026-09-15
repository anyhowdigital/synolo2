import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { listEmployees } from "@/lib/services/payroll";
import { listLeaveRequests } from "@/lib/services/leave";
import { getErganiCredentials } from "@/lib/services/ergani-api";
import { PayrollNav } from "@/components/office/payroll-nav";
import { StaffAccessButton } from "@/components/office/payroll-extras";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
const eur = (n: number) => `${n.toFixed(2)} €`;

export default async function OfficeEmployeesPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ month?: string; q?: string }> }) {
  const { orgId } = await params;
  const { month: m, q } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : new Date().toISOString().slice(0, 7);
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();
  const readOnly = client.accessLevel === "read" || client.accessLevel === "mydata";
  const all = await listEmployees(db, orgId);
  const staff = q ? all.filter((e) => `${e.lastName} ${e.firstName} ${e.afm} ${e.amka}`.toLowerCase().includes(q.toLowerCase())) : all;
  const leaves = await listLeaveRequests(db, orgId);
  const pending = leaves.filter((l) => l.status === "pending");
  const ergani = await getErganiCredentials(db, orgId);

  return (
    <div className="space-y-6" data-testid="office-employees-page">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href={`/office/clients/${orgId}`}>
            <ArrowLeft data-icon="inline-start" /> {client.org.name}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Προσωπικό</h1>
        <p className="text-sm text-muted-foreground">Καρτέλες εργαζομένων, πύλη/PIN, άδειες προς έγκριση και σύνδεση ΕΡΓΑΝΗ {ergani?.verifiedAt ? <Badge>ΕΡΓΑΝΗ ✓ {ergani.employerName}</Badge> : <Badge variant="outline">ΕΡΓΑΝΗ μη επαληθευμένο</Badge>}</p>
      </div>
      <PayrollNav orgId={orgId} month={month} active="employees" />

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Αναζήτηση ονόματος / ΑΦΜ" className="h-9 w-64 rounded-md border bg-background px-3 text-sm" data-testid="employees-search" />
          <input type="hidden" name="month" value={month} />
          <Button type="submit" size="sm" variant="secondary">
            Αναζήτηση
          </Button>
        </form>
        {pending.length ? <Badge variant="secondary" data-testid="employees-pending-count">{pending.length} αιτήματα άδειας</Badge> : null}
        {!readOnly ? (
          <Button asChild size="sm" className="ml-auto">
            <Link href={`/office/clients/${orgId}/employees/new`} data-testid="employee-new">
              <Plus data-icon="inline-start" /> Νέος εργαζόμενος
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table data-testid="office-employees-table">
            <TableHeader>
              <TableRow>
                <TableHead>Εργαζόμενος</TableHead>
                <TableHead>ΑΦΜ / ΑΜΚΑ</TableHead>
                <TableHead>Ειδικότητα</TableHead>
                <TableHead className="text-right">Ακαθάριστες</TableHead>
                <TableHead>IBAN</TableHead>
                <TableHead>Άδειες</TableHead>
                <TableHead>Κατάσταση</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Δεν βρέθηκαν εργαζόμενοι.
                  </TableCell>
                </TableRow>
              ) : (
                staff.map((e) => {
                  const p = pending.filter((l) => l.employeeId === e.id).length;
                  return (
                    <TableRow key={e.id} className={e.active ? "" : "opacity-60"}>
                      <TableCell>
                        <Link href={`/office/clients/${orgId}/employees/${e.id}?month=${month}`} className="font-medium underline-offset-4 hover:underline" data-testid={`office-employee-link-${e.id}`}>
                          {e.lastName} {e.firstName}
                        </Link>
                        <p className="text-xs text-muted-foreground">πρόσληψη {e.hireDate}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.afm || <span className="text-destructive">λείπει ΑΦΜ</span>} / {e.amka || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{e.specialtyName || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(e.grossSalary || e.dailyWage)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.iban ? `${e.iban.slice(0, 4)}…${e.iban.slice(-4)}` : <span className="text-destructive">λείπει</span>}</TableCell>
                      <TableCell>{p ? <Badge variant="secondary">{p} εκκρεμή</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{e.active ? <Badge>Ενεργός</Badge> : <Badge variant="outline">Αποχώρησε</Badge>}</TableCell>
                      <TableCell className="text-right">{!readOnly ? <StaffAccessButton orgId={orgId} employeeId={e.id} /> : null}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
