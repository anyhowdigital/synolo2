import type { Db } from "@/db";
import { and, eq } from "drizzle-orm";
import { employees, erganiSubmissions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { staffPortalData } from "@/lib/services/staff-portal";
import { listLeaveRequests } from "@/lib/services/leave";

/** Πλήρης εικόνα εργαζομένου (κοινή για πάνελ επιχείρησης & λογιστή). */
export async function employeeOverview(db: Db, orgId: string, employeeId: string, month: string) {
  const emp = await db.query.employees.findFirst({ where: and(eq(employees.id, employeeId), eq(employees.orgId, orgId)) });
  if (!emp) return null;
  const data = await staffPortalData(db, employeeId, month);
  const leaves = await listLeaveRequests(db, orgId, employeeId);
  const subs = await db.select().from(erganiSubmissions).where(eq(erganiSubmissions.orgId, orgId)).orderBy(desc(erganiSubmissions.createdAt)).limit(10);
  const worked = data.shifts.filter((s) => s.kind === "work" && s.startTime && s.endTime);
  const minutes = worked.reduce((sum, s) => {
    const [sh, sm] = s.startTime.split(":").map(Number);
    const [eh, em] = s.endTime.split(":").map(Number);
    return sum + Math.max(0, eh * 60 + em - sh * 60 - sm - s.breakMinutes);
  }, 0);
  const overtime = data.shifts.reduce((s, x) => s + x.overtimeMinutes, 0);
  return { emp, ...data, leaves, submissions: subs, stats: { workDays: worked.length, minutes, overtime, leaveDays: data.shifts.filter((s) => s.kind === "leave").length, sickDays: data.shifts.filter((s) => s.kind === "sick").length } };
}

export type EmployeeOverview = NonNullable<Awaited<ReturnType<typeof employeeOverview>>>;
