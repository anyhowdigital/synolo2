import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { listEmployees, listShifts } from "@/lib/services/payroll";
import { getErganiCredentials, listSubmissions } from "@/lib/services/ergani-api";
import { ErganiPanel } from "@/components/office/ergani-panel";
import { ErganiCredentialsCard, ErganiSubmissionsTable, ErganiSubmitBar } from "@/components/office/ergani-live";
import { PayrollNav } from "@/components/office/payroll-nav";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function OfficeErganiPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { orgId } = await params;
  const { month: m } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : new Date().toISOString().slice(0, 7);

  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();

  const employees = await listEmployees(db, orgId);
  const rows = await listShifts(db, orgId, month);
  const creds = await getErganiCredentials(db, orgId);
  const submissions = await listSubmissions(db, orgId);
  const readOnly = client.accessLevel === "read" || client.accessLevel === "mydata";

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href={`/office/clients/${orgId}/payroll?month=${month}`}>
            <ArrowLeft data-icon="inline-start" /> {client.org.name} · Μισθοδοσία
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">ΕΡΓΑΝΗ · Κάρτα εργασίας</h1>
        <p className="text-sm text-muted-foreground">Βάρδιες, διαλείμματα και υπερωρίες — εξαγωγή ή απευθείας υποβολή Ε12, Ε4, Ε3, Ε8 στο ΕΡΓΑΝΗ ΙΙ.</p>
      </div>
      <PayrollNav orgId={orgId} month={month} active="ergani" />

      <ErganiCredentialsCard orgId={orgId} current={creds} readOnly={readOnly} orgAfm={client.org.afm} />
      {!readOnly ? <ErganiSubmitBar orgId={orgId} month={month} enabled={!!creds?.verifiedAt} /> : null}

      <ErganiPanel
        orgId={orgId}
        month={month}
        employees={employees.filter((e) => e.active).map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}` }))}
        shifts={rows.map((r) => ({ id: r.id, employeeId: r.employeeId, employeeName: employees.find((e) => e.id === r.employeeId) ? `${employees.find((e) => e.id === r.employeeId)!.lastName} ${employees.find((e) => e.id === r.employeeId)!.firstName}` : "—", workDate: r.workDate, startTime: r.startTime, endTime: r.endTime, breakMinutes: r.breakMinutes, overtimeMinutes: r.overtimeMinutes, kind: r.kind }))}
        readOnly={readOnly}
      />

      <ErganiSubmissionsTable rows={submissions.map((s) => ({ id: s.id, form: s.form, period: s.period, status: s.status, protocol: s.protocol, response: s.response, createdAt: s.createdAt, createdBy: s.createdBy }))} />
    </div>
  );
}
