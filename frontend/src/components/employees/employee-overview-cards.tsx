import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeaveDecisionButtons, LeaveSubmitButton } from "@/components/employees/leave-widgets";
import { LEAVE_TYPES } from "@/lib/services/leave";
import type { EmployeeOverview } from "@/lib/services/employee-overview";

const eur = (n: number) => `${n.toFixed(2)} €`;
const KINDS: Record<string, string> = { work: "Εργασία", leave: "Άδεια", sick: "Ασθένεια", off: "Ρεπό" };
const hm = (m: number) => `${Math.floor(m / 60)}ω ${String(m % 60).padStart(2, "0")}′`;
const mask = (iban: string) => (iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : "—");

export function EmployeeHeader({ o, month, basePath, actions }: { o: EmployeeOverview; month: string; basePath: string; actions?: React.ReactNode }) {
  const e = o.emp;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3" data-testid="employee-header">
      <div>
        <h1 className="text-2xl font-semibold">
          {e.lastName} {e.firstName} {!e.active ? <Badge variant="outline">αποχώρησε {e.endDate ?? ""}</Badge> : <Badge>ενεργός</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {e.specialtyName || "Χωρίς ειδικότητα"} · {e.contractType === "full" ? "Πλήρης" : e.contractType === "part" ? "Μερική" : e.contractType} · πρόσληψη {e.hireDate} · {e.hoursPerWeek} ώρες/εβδ.
        </p>
      </div>
      <form className="flex items-end gap-2">
        <input type="month" name="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" data-testid="employee-month" />
        <button type="submit" className="h-9 rounded-md border bg-secondary px-3 text-sm">
          Μήνας
        </button>
        {actions}
        <Link href={basePath} className="h-9 rounded-md border px-3 text-sm leading-9">
          ← Προσωπικό
        </Link>
      </form>
    </div>
  );
}

export function EmployeeStats({ o }: { o: EmployeeOverview }) {
  const e = o.emp;
  const cells: [string, string][] = [
    ["Ακαθάριστες/μήνα", e.grossSalary > 0 ? eur(e.grossSalary) : `${eur(e.dailyWage)}/ημέρα`],
    ["Ημέρες εργασίας", String(o.stats.workDays)],
    ["Ώρες εργασίας", hm(o.stats.minutes)],
    ["Υπερωρίες", hm(o.stats.overtime)],
    ["Άδεια / ασθένεια", `${o.stats.leaveDays} / ${o.stats.sickDays}`],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="employee-stats">
      {cells.map(([l, v]) => (
        <Card key={l}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmployeeDetailsCard({ o }: { o: EmployeeOverview }) {
  const e = o.emp;
  const rows: [string, string][] = [
    ["ΑΦΜ / ΔΟΥ", `${e.afm || "—"} / ${e.doy || "—"}`],
    ["ΑΜΚΑ", e.amka || "—"],
    ["Α.Μ. ΕΦΚΑ", e.efkaAm || "—"],
    ["ΚΠΚ", e.kpk],
    ["Ειδικότητα", `${e.specialtyCode || "—"} ${e.specialtyName}`],
    ["Τέκνα", String(e.children)],
    ["IBAN", mask(e.iban)],
    ["Γέννηση / Φύλο", `${e.birthDate || "—"} / ${e.sex === "1" ? "Γ" : "Α"}`],
    ["Ταυτότητα", `${e.idType} ${e.idNumber || "—"}`],
    ["Επικοινωνία", [e.email, e.phone].filter(Boolean).join(" · ") || "—"],
  ];
  return (
    <Card data-testid="employee-details">
      <CardHeader>
        <CardTitle className="text-base">Στοιχεία εργαζομένου</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function EmployeeShiftsCard({ o, month }: { o: EmployeeOverview; month: string }) {
  return (
    <Card data-testid="employee-shifts">
      <CardHeader>
        <CardTitle className="text-base">Βάρδιες & χρονομετρήσεις {month}</CardTitle>
        <CardDescription>Άφιξη/αναχώρηση από την ψηφιακή κάρτα, διαλείμματα, υπερωρίες και κατάσταση ΕΡΓΑΝΗ.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ημ/νία</TableHead>
              <TableHead>Άφιξη – Αναχώρηση</TableHead>
              <TableHead className="text-right">Διάλειμμα</TableHead>
              <TableHead className="text-right">Υπερωρία</TableHead>
              <TableHead>Τύπος</TableHead>
              <TableHead>ΕΡΓΑΝΗ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.shifts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Δεν υπάρχουν βάρδιες τον μήνα.
                </TableCell>
              </TableRow>
            ) : (
              o.shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.workDate}</TableCell>
                  <TableCell className="tabular-nums">{s.startTime ? `${s.startTime} – ${s.endTime || "σε εργασία"}` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.breakMinutes}′</TableCell>
                  <TableCell className="text-right tabular-nums">{s.overtimeMinutes}′</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{KINDS[s.kind] ?? s.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.erganiStatus === "sent" ? <Badge>υποβλήθηκε</Badge> : s.erganiStatus === "failed" ? <Badge variant="destructive">απέτυχε</Badge> : <span className="text-muted-foreground">εκκρεμεί</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function EmployeePayslipsCard({ o, hrefFor }: { o: EmployeeOverview; hrefFor: (key: string) => string }) {
  return (
    <Card data-testid="employee-payslips">
      <CardHeader>
        <CardTitle className="text-base">Αποδοχές, δώρα & επιδόματα</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Περίοδος</TableHead>
              <TableHead className="text-right">Ακαθάριστα</TableHead>
              <TableHead className="text-right">ΕΦΚΑ</TableHead>
              <TableHead className="text-right">ΦΜΥ</TableHead>
              <TableHead className="text-right">Καθαρά</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.payslips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Δεν υπάρχουν υπολογισμένες αποδοχές.
                </TableCell>
              </TableRow>
            ) : (
              o.payslips.map((p) => (
                <TableRow key={p.key}>
                  <TableCell>
                    {p.label} {p.posted ? <Badge variant="outline" className="ml-1">καταχωρημένο</Badge> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{eur(p.gross)}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(p.efka)}</TableCell>
                  <TableCell className="text-right tabular-nums">{eur(p.tax)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{eur(p.net)}</TableCell>
                  <TableCell className="text-right">
                    <a href={hrefFor(p.key)} target="_blank" rel="noreferrer" className="text-sm underline-offset-4 hover:underline" data-testid={`employee-payslip-${p.key}`}>
                      PDF
                    </a>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function EmployeeLeaveCard({ o, orgId, canDecide }: { o: EmployeeOverview; orgId: string; canDecide: boolean }) {
  return (
    <Card data-testid="employee-leaves">
      <CardHeader>
        <CardTitle className="text-base">Αιτήματα άδειας</CardTitle>
        <CardDescription>Η έγκριση ενημερώνει το πρόγραμμα άδειας. Η υποβολή στο ΕΡΓΑΝΗ γίνεται χωριστά, με επιβεβαίωση.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Τύπος</TableHead>
              <TableHead>Διάστημα</TableHead>
              <TableHead className="text-right">Ημέρες</TableHead>
              <TableHead>Κατάσταση</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {o.leaves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Δεν υπάρχουν αιτήματα.
                </TableCell>
              </TableRow>
            ) : (
              o.leaves.map((l) => (
                <TableRow key={l.id} data-testid={`leave-row-${l.id}`}>
                  <TableCell>
                    {LEAVE_TYPES[l.leaveType] ?? l.leaveType}
                    {l.reason ? <p className="text-xs text-muted-foreground">{l.reason}</p> : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.fromDate} – {l.toDate}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.days}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status === "approved" ? "Εγκρίθηκε" : l.status === "rejected" ? "Απορρίφθηκε" : "Εκκρεμεί"}</Badge>
                    {l.decidedBy ? <p className="text-xs text-muted-foreground">{l.decidedBy}</p> : null}
                    {l.erganiProtocol ? <p className="text-xs text-muted-foreground">ΕΡΓΑΝΗ {l.erganiProtocol}</p> : null}
                  </TableCell>
                  <TableCell className="text-right">{canDecide && l.status === "pending" ? <LeaveDecisionButtons orgId={orgId} id={l.id} /> : canDecide && l.status === "approved" && !l.erganiProtocol ? <LeaveSubmitButton orgId={orgId} id={l.id} month={l.fromDate.slice(0, 7)} /> : null}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function EmployeeTerminationCard({ o }: { o: EmployeeOverview }) {
  const t = o.termination;
  if (!t) return null;
  return (
    <Card data-testid="employee-termination">
      <CardHeader>
        <CardTitle className="text-base">Αποχώρηση {t.endDate}</CardTitle>
        <CardDescription>{t.note}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        Αποζημίωση <b className="tabular-nums">{eur(t.gross)}</b> · φόρος {eur(t.tax)} · καθαρό {eur(t.net)} · προϋπηρεσία {t.serviceYears} έτη
      </CardContent>
    </Card>
  );
}
