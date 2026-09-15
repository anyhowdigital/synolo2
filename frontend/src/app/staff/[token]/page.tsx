import { notFound } from "next/navigation";
import { Clock, Download, Building2 } from "lucide-react";
import { getDb } from "@/db";
import { staffSession } from "@/app/actions/staff";
import { getStaffByToken, staffPortalData } from "@/lib/services/staff-portal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StaffPinForm, StaffClock } from "@/components/staff/staff-widgets";
import { StaffLeaveForm } from "@/components/employees/leave-widgets";
import { LEAVE_TYPES, listLeaveRequests } from "@/lib/services/leave";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const found = await getStaffByToken(db, token);
  return { title: found ? `Πύλη εργαζομένου – ${found.org.name}` : "Δεν βρέθηκε", robots: { index: false, follow: false } };
}

const eur = (n: number) => `${n.toFixed(2)} €`;
const KINDS: Record<string, string> = { work: "Εργασία", leave: "Άδεια", sick: "Ασθένεια", off: "Ρεπό" };

export default async function StaffPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const found = await getStaffByToken(db, token);
  if (!found) notFound();
  const session = await staffSession(token);

  return (
    <main className="min-h-screen bg-[#f6f5f0] px-4 py-10 text-[#1b1b1b] dark:bg-neutral-950 dark:text-neutral-100" data-testid="staff-portal">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              <Building2 className="size-3.5" /> {found.org.name}
            </p>
            <h1 className="mt-1 text-2xl font-semibold" data-testid="staff-name">
              {found.emp.firstName} {found.emp.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{found.emp.specialtyName || "Προσωπική πύλη εργαζομένου"} · πρόσληψη {found.emp.hireDate}</p>
          </div>
        </header>

        {!session ? (
          <StaffPinForm token={token} />
        ) : (
          <StaffContent token={token} employeeId={found.emp.id} orgId={found.emp.orgId} />
        )}
      </div>
    </main>
  );
}

async function StaffContent({ token, employeeId, orgId }: { token: string; employeeId: string; orgId: string }) {
  const db = await getDb();
  const month = new Date().toISOString().slice(0, 7);
  const data = await staffPortalData(db, employeeId, month);
  const leaves = await listLeaveRequests(db, orgId, employeeId);
  return (
    <>
      <Card data-testid="staff-clock-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4" /> Ψηφιακή κάρτα εργασίας
          </CardTitle>
          <CardDescription>
            {data.openShift ? `Άφιξη ${data.openShift.startTime} — σε εργασία` : data.doneToday ? `Σήμερα: ${data.doneToday.startTime} – ${data.doneToday.endTime}` : "Δεν έχετε δηλώσει άφιξη σήμερα."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffClock token={token} open={!!data.openShift} done={!!data.doneToday} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Αποδείξεις αποδοχών</CardTitle>
          <CardDescription>Μισθοδοσία, δώρα και επίδομα αδείας.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table data-testid="staff-payslips">
            <TableHeader>
              <TableRow>
                <TableHead>Περίοδος</TableHead>
                <TableHead className="text-right">Ακαθάριστα</TableHead>
                <TableHead className="text-right">Καθαρά</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payslips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Δεν υπάρχουν ακόμη αποδείξεις.
                  </TableCell>
                </TableRow>
              ) : (
                data.payslips.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell>
                      {p.label} {p.kind !== "monthly" ? <Badge variant="secondary" className="ml-1">δώρο</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{eur(p.gross)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(p.net)}</TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/staff/${token}/payslip?period=${p.key}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline" data-testid={`staff-payslip-${p.key}`}>
                        <Download className="size-3.5" /> PDF
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Βάρδιες {month}</CardTitle>
          <CardDescription>Ημέρες άδειας που έχουν ληφθεί φέτος: {data.leaveTaken}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table data-testid="staff-shifts">
            <TableHeader>
              <TableRow>
                <TableHead>Ημερομηνία</TableHead>
                <TableHead>Ώρες</TableHead>
                <TableHead className="text-right">Υπερωρία</TableHead>
                <TableHead>Τύπος</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Δεν υπάρχουν βάρδιες αυτόν τον μήνα.
                  </TableCell>
                </TableRow>
              ) : (
                data.shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.workDate}</TableCell>
                    <TableCell>{s.startTime ? `${s.startTime} – ${s.endTime || "…"}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.overtimeMinutes}′</TableCell>
                    <TableCell>
                      <Badge variant="outline">{KINDS[s.kind] ?? s.kind}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <StaffLeaveForm token={token} types={LEAVE_TYPES} />
      {leaves.length ? (
        <Card data-testid="staff-leaves">
          <CardHeader>
            <CardTitle className="text-base">Τα αιτήματά μου</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {leaves.map((l) => (
              <p key={l.id} className="flex flex-wrap justify-between gap-2 border-b py-1.5" data-testid={`staff-leave-${l.id}`}>
                <span>
                  {LEAVE_TYPES[l.leaveType] ?? l.leaveType} · {l.fromDate} – {l.toDate} ({l.days} ημ.)
                </span>
                <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status === "approved" ? "Εγκρίθηκε" : l.status === "rejected" ? "Απορρίφθηκε" : "Εκκρεμεί"}</Badge>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {data.termination ? (
        <Card data-testid="staff-termination">
          <CardHeader>
            <CardTitle className="text-base">Αποχώρηση {data.termination.endDate}</CardTitle>
            <CardDescription>{data.termination.note}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            Αποζημίωση: <span className="font-medium tabular-nums">{eur(data.termination.gross)}</span> · φόρος {eur(data.termination.tax)} · καθαρό {eur(data.termination.net)}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
