import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { employeeOverview } from "@/lib/services/employee-overview";
import { EmployeeDetailsCard, EmployeeHeader, EmployeeLeaveCard, EmployeePayslipsCard, EmployeeShiftsCard, EmployeeStats, EmployeeTerminationCard } from "@/components/employees/employee-overview-cards";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  const { month: m } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : new Date().toISOString().slice(0, 7);
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const o = await employeeOverview(db, org.id, id, month);
  if (!o) notFound();
  const canDecide = role === "owner" || role === "admin";

  return (
    <div className="space-y-6" data-testid="employee-detail-page">
      <EmployeeHeader o={o} month={month} basePath="/employees" />
      <p className="rounded-lg border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Προβολή μόνο — τα στοιχεία, οι βάρδιες και η μισθοδοσία μεταβάλλονται από το λογιστικό γραφείο.</p>
      <EmployeeStats o={o} />
      <div className="grid gap-6 lg:grid-cols-2">
        <EmployeeDetailsCard o={o} />
        <EmployeePayslipsCard o={o} hrefFor={(key) => `/api/office/payroll?org=${org.id}&month=${key}&kind=payslip&employee=${o.emp.id}`} />
      </div>
      <EmployeeShiftsCard o={o} month={month} />
      <EmployeeLeaveCard o={o} orgId={org.id} canDecide={canDecide} />
      <EmployeeTerminationCard o={o} />
    </div>
  );
}
