import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { getRun, listEmployees } from "@/lib/services/payroll";
import { bonusDeadline, bonusRunKey, listBonusRuns, type BonusKind } from "@/lib/services/bonuses";
import { listTerminations } from "@/lib/services/severance";
import { getErganiCredentials } from "@/lib/services/ergani-api";
import { PayrollPanel } from "@/components/office/payroll-panel";
import { BonusPanel } from "@/components/office/bonus-panel";
import { SepaCard, TerminationCard } from "@/components/office/payroll-extras";
import { Button } from "@/components/ui/button";
import { PayrollNav } from "@/components/office/payroll-nav";

export const dynamic = "force-dynamic";

export default async function OfficePayrollPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { orgId } = await params;
  const { month: m } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : new Date().toISOString().slice(0, 7);
  const year = Number(month.slice(0, 4));

  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();

  const employees = await listEmployees(db, orgId);
  const data = await getRun(db, orgId, month);
  const bonuses = await listBonusRuns(db, orgId, year);
  const terms = await listTerminations(db, orgId);
  const ergani = await getErganiCredentials(db, orgId);
  const readOnly = client.accessLevel === "read" || client.accessLevel === "mydata";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
            <Link href={`/office/clients/${orgId}`}>
              <ArrowLeft data-icon="inline-start" /> {client.org.name}
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Μισθοδοσία</h1>
          <p className="text-sm text-muted-foreground">
            Υπολογισμός ΕΦΚΑ & ΦΜΥ, δώρα & επιδόματα, αποδείξεις αποδοχών, αρχεία ΑΠΔ/ΦΜΥ, εμβάσματα SEPA και αποζημιώσεις απόλυσης.
          </p>
        </div>
        <form className="flex items-end gap-2">
          <input type="month" name="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" data-testid="payroll-month" />
          <Button type="submit" variant="secondary" size="sm">
            Αλλαγή μήνα
          </Button>
        </form>
      </div>
      <PayrollNav orgId={orgId} month={month} active="payroll" />

      {readOnly ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Χρειάζεστε επίπεδο πρόσβασης «Πλήρης» ή «Διαχειριστής βιβλίων» για τη μισθοδοσία αυτού του πελάτη.
        </p>
      ) : (
        <>
          <PayrollPanel
            orgId={orgId}
            month={month}
            posted={data?.run.status === "posted"}
            totals={data ? { gross: data.run.grossTotal, efkaEmployee: data.run.efkaEmployee, efkaEmployer: data.run.efkaEmployer, tax: data.run.taxTotal, net: data.run.netTotal } : null}
            items={(data?.items ?? []).map((i) => ({ employeeId: i.employeeId, employeeName: i.employeeName, days: i.days, overtimeHours: i.overtimeHours, gross: i.gross, efkaEmployee: i.efkaEmployee, efkaEmployer: i.efkaEmployer, tax: i.tax, net: i.net }))}
            employees={employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}`, afm: e.afm, amka: e.amka, specialty: e.specialtyName, contractType: e.contractType, gross: e.grossSalary, hireDate: e.hireDate, iban: e.iban, active: e.active }))}
          />
          <SepaCard orgId={orgId} runKey={month} orgIban={client.org.iban ?? ""} hasItems={(data?.items.length ?? 0) > 0} />
          <BonusPanel
            orgId={orgId}
            year={year}
            sepaBase={`/api/office/payroll?org=${orgId}&kind=sepa&iban=${encodeURIComponent(client.org.iban ?? "")}&date=${new Date().toISOString().slice(0, 10)}`}
            runs={(["xmas", "easter", "leave"] as BonusKind[]).map((kind) => {
              const r = bonuses[kind];
              return {
                kind,
                key: bonusRunKey(year, kind),
                deadline: bonusDeadline(kind, year),
                posted: r?.run.status === "posted",
                totals: r ? { gross: r.run.grossTotal, efkaEmployee: r.run.efkaEmployee, tax: r.run.taxTotal, net: r.run.netTotal } : null,
                items: (r?.items ?? []).map((i) => ({ employeeId: i.employeeId, employeeName: i.employeeName, days: i.days, overtimeHours: 0, gross: i.gross, efkaEmployee: i.efkaEmployee, efkaEmployer: i.efkaEmployer, tax: i.tax, net: i.net, note: i.note })),
              };
            })}
          />
          <TerminationCard
            orgId={orgId}
            employees={employees.filter((e) => e.active).map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))}
            rows={terms.map((t) => ({ id: t.id, employeeName: t.employeeName, kind: t.kind, endDate: t.endDate, withNotice: t.withNotice, serviceYears: t.serviceYears, monthsOwed: t.monthsOwed, gross: t.gross, tax: t.tax, net: t.net, note: t.note }))}
            hasErgani={!!ergani}
          />
        </>
      )}
    </div>
  );
}
