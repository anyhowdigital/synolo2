import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { employees, organizations, payrollItems, payrollRuns, shifts, terminations } from "@/db/schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ενεργοποίηση πρόσβασης εργαζομένου στην προσωπική πύλη (token + 4ψήφιο PIN). */
export async function ensurePortalAccess(db: Db, orgId: string, employeeId: string, rotate = false) {
  const emp = await db.query.employees.findFirst({ where: and(eq(employees.id, employeeId), eq(employees.orgId, orgId)) });
  if (!emp) throw new Error("Ο εργαζόμενος δεν βρέθηκε.");
  if (emp.portalToken && emp.portalPin && !rotate) return { token: emp.portalToken, pin: emp.portalPin };
  const token = randomBytes(24).toString("base64url");
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  await db.update(employees).set({ portalToken: token, portalPin: pin }).where(eq(employees.id, emp.id));
  return { token, pin };
}

export async function getStaffByToken(db: Db, token: string) {
  if (!token || token.length < 16) return null;
  const emp = await db.query.employees.findFirst({ where: eq(employees.portalToken, token) });
  if (!emp) return null;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, emp.orgId) });
  if (!org) return null;
  return { emp, org };
}

export function periodLabel(key: string) {
  if (/^\d{4}-\d{2}$/.test(key)) return `Μισθοδοσία ${key}`;
  const y = key.slice(0, 4);
  return key.endsWith("DX") ? `Δώρο Χριστουγέννων ${y}` : key.endsWith("DP") ? `Δώρο Πάσχα ${y}` : `Επίδομα αδείας ${y}`;
}

export async function staffPortalData(db: Db, employeeId: string, month: string) {
  const items = await db.select().from(payrollItems).where(eq(payrollItems.employeeId, employeeId));
  const runIds = [...new Set(items.map((i) => i.runId))];
  const runs = runIds.length ? await db.select().from(payrollRuns).where(inArray(payrollRuns.id, runIds)) : [];
  const payslips = items
    .map((i) => ({ item: i, run: runs.find((r) => r.id === i.runId)! }))
    .filter((x) => x.run)
    .sort((a, b) => (a.run.month < b.run.month ? 1 : -1))
    .map(({ item, run }) => ({ key: run.month, label: periodLabel(run.month), kind: run.kind, gross: item.gross, net: item.net, tax: item.tax, efka: item.efkaEmployee, days: item.days, posted: run.status === "posted" }));
  const monthShifts = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.employeeId, employeeId), gte(shifts.workDate, `${month}-01`), lte(shifts.workDate, `${month}-31`)))
    .orderBy(desc(shifts.workDate));
  const yearLeave = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.employeeId, employeeId), eq(shifts.kind, "leave"), gte(shifts.workDate, `${month.slice(0, 4)}-01-01`), lte(shifts.workDate, `${month.slice(0, 4)}-12-31`)));
  const term = await db.query.terminations.findFirst({ where: eq(terminations.employeeId, employeeId) });
  const today = new Date().toISOString().slice(0, 10);
  const open = monthShifts.find((s) => s.workDate === today && s.kind === "work" && s.startTime && !s.endTime);
  const doneToday = monthShifts.find((s) => s.workDate === today && s.kind === "work" && s.endTime);
  return { payslips, shifts: monthShifts, leaveTaken: yearLeave.length, termination: term ?? null, openShift: open ?? null, doneToday: doneToday ?? null };
}

const hhmm = () => new Date().toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Athens" });
const todayAthens = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });

/** Ψηφιακή κάρτα: άφιξη. */
export async function clockIn(db: Db, employeeId: string, orgId: string) {
  const today = todayAthens();
  const existing = await db.query.shifts.findFirst({ where: and(eq(shifts.employeeId, employeeId), eq(shifts.workDate, today), eq(shifts.kind, "work")) });
  if (existing) throw new Error(existing.endTime ? "Έχετε ήδη ολοκληρώσει τη σημερινή βάρδια." : "Έχετε ήδη δηλώσει άφιξη.");
  const id = randomUUID();
  await db.insert(shifts).values({ id, orgId, employeeId, workDate: today, startTime: hhmm(), endTime: "", breakMinutes: 0, overtimeMinutes: 0, kind: "work", erganiStatus: "pending", erganiRef: "", createdAt: new Date().toISOString() });
  return id;
}

/** Ψηφιακή κάρτα: αναχώρηση — υπολογίζει αυτόματα υπερωρία πέραν 8 ωρών. */
export async function clockOut(db: Db, employeeId: string, hoursPerWeek: number) {
  const today = todayAthens();
  const open = await db.query.shifts.findFirst({ where: and(eq(shifts.employeeId, employeeId), eq(shifts.workDate, today), eq(shifts.kind, "work")) });
  if (!open || !open.startTime) throw new Error("Δεν έχετε δηλώσει άφιξη σήμερα.");
  if (open.endTime) throw new Error("Η αναχώρηση έχει ήδη δηλωθεί.");
  const end = hhmm();
  const [sh, sm] = open.startTime.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const worked = Math.max(0, eh * 60 + em - (sh * 60 + sm));
  const dailyMinutes = round2((hoursPerWeek || 40) / 5) * 60;
  const overtime = Math.max(0, worked - dailyMinutes);
  await db.update(shifts).set({ endTime: end, overtimeMinutes: overtime }).where(eq(shifts.id, open.id));
  return { end, worked, overtime, shiftId: open.id };
}
