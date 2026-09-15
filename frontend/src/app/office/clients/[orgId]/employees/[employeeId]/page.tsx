import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { employeeOverview } from "@/lib/services/employee-overview";
import { getErganiCredentials } from "@/lib/services/ergani-api";
import { listTerminations } from "@/lib/services/severance";
import { PayrollNav } from "@/components/office/payroll-nav";
import { EmployeeForm, EMPTY_EMPLOYEE } from "@/components/office/employee-form";
import { StaffAccessButton, TerminationCard } from "@/components/office/payroll-extras";
import { EmployeeHeader, EmployeeLeaveCard, EmployeePayslipsCard, EmployeeShiftsCard, EmployeeStats, EmployeeTerminationCard } from "@/components/employees/employee-overview-cards";

export const dynamic = "force-dynamic";

export default async function OfficeEmployeePage({ params, searchParams }: { params: Promise<{ orgId: string; employeeId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { orgId, employeeId } = await params;
  const { month: m } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : new Date().toISOString().slice(0, 7);
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();
  const readOnly = client.accessLevel === "read" || client.accessLevel === "mydata";
  const ergani = await getErganiCredentials(db, orgId);
  const base = `/office/clients/${orgId}/employees?month=${month}`;

  if (employeeId === "new") {
    if (readOnly) notFound();
    return (
      <div className="space-y-6">
        <PayrollNav orgId={orgId} month={month} active="employees" />
        <EmployeeForm orgId={orgId} initial={EMPTY_EMPLOYEE} hasErgani={!!ergani?.verifiedAt} />
      </div>
    );
  }

  const o = await employeeOverview(db, orgId, employeeId, month);
  if (!o) notFound();
  const terms = (await listTerminations(db, orgId)).filter((t) => t.employeeId === employeeId);
  const e = o.emp;

  return (
    <div className="space-y-6" data-testid="office-employee-page">
      <PayrollNav orgId={orgId} month={month} active="employees" />
      <EmployeeHeader o={o} month={month} basePath={base} actions={!readOnly ? <StaffAccessButton orgId={orgId} employeeId={e.id} /> : null} />
      <EmployeeStats o={o} />
      {!readOnly ? (
        <EmployeeForm
          orgId={orgId}
          employeeId={e.id}
          hasErgani={!!ergani?.verifiedAt}
          initial={{ firstName: e.firstName, lastName: e.lastName, afm: e.afm, amka: e.amka, efkaAm: e.efkaAm, doy: e.doy, specialtyCode: e.specialtyCode, specialtyName: e.specialtyName, kpk: e.kpk, contractType: e.contractType, hireDate: e.hireDate, grossSalary: e.grossSalary, dailyWage: e.dailyWage, hoursPerWeek: e.hoursPerWeek, children: e.children, iban: e.iban, birthDate: e.birthDate, sex: e.sex, fatherName: e.fatherName, motherName: e.motherName, nationality: e.nationality, idType: e.idType, idNumber: e.idNumber, maritalStatus: e.maritalStatus, educationLevel: e.educationLevel, email: e.email, phone: e.phone }}
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <EmployeePayslipsCard o={o} hrefFor={(key) => `/api/office/payroll?org=${orgId}&month=${key}&kind=payslip&employee=${e.id}`} />
        <EmployeeLeaveCard o={o} orgId={orgId} canDecide={!readOnly} />
      </div>
      <EmployeeShiftsCard o={o} month={month} />
      <EmployeeTerminationCard o={o} />
      {!readOnly && e.active ? (
        <TerminationCard orgId={orgId} employees={[{ id: e.id, name: `${e.lastName} ${e.firstName}` }]} rows={terms.map((t) => ({ id: t.id, employeeName: t.employeeName, kind: t.kind, endDate: t.endDate, withNotice: t.withNotice, serviceYears: t.serviceYears, monthsOwed: t.monthsOwed, gross: t.gross, tax: t.tax, net: t.net, note: t.note }))} hasErgani={!!ergani?.verifiedAt} />
      ) : null}
    </div>
  );
}
