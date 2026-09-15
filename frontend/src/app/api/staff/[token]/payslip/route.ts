import { getDb } from "@/db";
import { staffSession } from "@/app/actions/staff";
import { getRun } from "@/lib/services/payroll";
import { periodLabel } from "@/lib/services/staff-portal";
import { renderPayslipPdf, payslipFilename } from "@/lib/pdf/payslip-pdf";

/** Απόδειξη αποδοχών για τον ίδιο τον εργαζόμενο (μέσω προσωπικής πύλης + PIN). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await staffSession(token);
  if (!found) return new Response("Απαιτείται PIN.", { status: 401 });
  const key = new URL(req.url).searchParams.get("period") ?? "";
  const db = await getDb();
  const data = await getRun(db, found.org.id, key);
  const item = data?.items.find((i) => i.employeeId === found.emp.id);
  if (!item) return new Response("Δεν βρέθηκε απόδειξη.", { status: 404 });
  const buffer = await renderPayslipPdf({
    org: found.org,
    data: { month: periodLabel(key), employeeName: item.employeeName, afm: found.emp.afm, amka: found.emp.amka, specialty: found.emp.specialtyName, days: item.days, gross: item.gross, overtimeAmount: item.overtimeAmount, bonus: item.bonus, efkaEmployee: item.efkaEmployee, efkaEmployer: item.efkaEmployer, tax: item.tax, net: item.net },
  });
  const name = payslipFilename(key, item.employeeName);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7E]/g, "_")}"` } });
}
