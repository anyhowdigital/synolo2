import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { employees, leaveRequests, shifts } from "@/db/schema";
import { isValidDate } from "@/lib/invoice/totals";
import { notify } from "@/lib/services/notifications";

export const LEAVE_TYPES: Record<string, string> = {
  ΑΔΚΑΝ: "Κανονική άδεια",
  ΑΔΑΑ: "Άδεια άνευ αποδοχών",
  ΑΔΑΣ: "Άδεια ασθένειας",
  ΑΔΓΑΜ: "Άδεια γάμου",
  ΑΔΜΗ: "Άδεια μητρότητας",
  ΑΔΠΑ: "Άδεια πατρότητας",
  ΑΔΦΠ: "Άδεια φροντίδας παιδιού",
  ΑΔΓΟΝ: "Γονική άδεια",
  ΑΔΕΞ: "Άδεια εξετάσεων",
  ΑΔΑΙΜ: "Αιμοδοτική άδεια",
  ΑΔΘΣΥΓ: "Άδεια λόγω θανάτου συγγενούς",
  ΑΔΠΣΕΤ: "Άδεια σχολικής επίδοσης τέκνου",
};

/** Εργάσιμες ημέρες (Δευ–Παρ) μεταξύ δύο ημερομηνιών. */
export function workdaysBetween(from: string, to: string) {
  const days: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export async function createLeaveRequest(db: Db, orgId: string, employeeId: string, input: { leaveType: string; fromDate: string; toDate: string; reason?: string }) {
  if (!isValidDate(input.fromDate) || !isValidDate(input.toDate)) throw new Error("Μη έγκυρες ημερομηνίες.");
  if (input.toDate < input.fromDate) throw new Error("Η ημερομηνία λήξης προηγείται της έναρξης.");
  if (!LEAVE_TYPES[input.leaveType]) throw new Error("Μη έγκυρος τύπος άδειας.");
  const days = workdaysBetween(input.fromDate, input.toDate).length;
  if (!days) throw new Error("Το διάστημα δεν περιλαμβάνει εργάσιμες ημέρες.");
  const emp = await db.query.employees.findFirst({ where: and(eq(employees.id, employeeId), eq(employees.orgId, orgId)) });
  if (!emp) throw new Error("Ο εργαζόμενος δεν βρέθηκε.");
  if (input.fromDate < emp.hireDate || (emp.endDate && input.toDate > emp.endDate)) throw new Error("Η άδεια πρέπει να βρίσκεται μέσα στο διάστημα απασχόλησης του εργαζομένου.");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    const overlapping = await tx.query.leaveRequests.findFirst({ where: and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.employeeId, employeeId), inArray(leaveRequests.status, ["pending", "approved"]), lte(leaveRequests.fromDate, input.toDate), gte(leaveRequests.toDate, input.fromDate)) });
    if (overlapping) throw new Error("Υπάρχει ήδη αίτημα ή εγκεκριμένη άδεια σε αυτό το διάστημα. Ελέγξτε τα υπάρχοντα αιτήματα.");
    await tx.insert(leaveRequests).values({ id, orgId, employeeId, employeeName: `${emp.lastName} ${emp.firstName}`, leaveType: input.leaveType, fromDate: input.fromDate, toDate: input.toDate, days, reason: (input.reason ?? "").slice(0, 200), status: "pending", createdAt: new Date().toISOString() });
  });
  await notify(db, { orgId, type: "tax_deadline", title: `Αίτημα άδειας: ${emp.lastName} ${emp.firstName}`, body: `${LEAVE_TYPES[input.leaveType]} ${input.fromDate} – ${input.toDate} (${days} ημέρες)`, link: `/employees/${employeeId}`, skipEmail: true });
  return { id, days };
}

export async function listLeaveRequests(db: Db, orgId: string, employeeId?: string) {
  const where = employeeId ? and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.employeeId, employeeId)) : eq(leaveRequests.orgId, orgId);
  return db.select().from(leaveRequests).where(where).orderBy(desc(leaveRequests.createdAt));
}

/** Η έγκριση ενημερώνει το πρόγραμμα. Η διαβίβαση ΕΡΓΑΝΗ είναι ξεχωριστή ενέργεια. */
export async function decideLeaveRequest(db: Db, orgId: string, id: string, decision: "approved" | "rejected", decidedBy: string, note = "") {
  if (decision !== "approved" && decision !== "rejected") throw new Error("Μη έγκυρη απόφαση άδειας.");
  const lr = await db.transaction(async (tx) => {
    const row = await tx.query.leaveRequests.findFirst({ where: and(eq(leaveRequests.id, id), eq(leaveRequests.orgId, orgId)) });
    if (!row) throw new Error("Το αίτημα δεν βρέθηκε.");
    if (row.status !== "pending") throw new Error("Το αίτημα έχει ήδη κριθεί.");
    if (decision === "approved") {
      const days = workdaysBetween(row.fromDate, row.toDate);
      const existing = await tx.select().from(shifts).where(and(eq(shifts.orgId, orgId), eq(shifts.employeeId, row.employeeId), inArray(shifts.workDate, days)));
      if (existing.some((s) => s.kind === "work" || s.erganiStatus === "sent" || !!s.erganiRef)) throw new Error("Υπάρχουν καταχωρημένες ώρες εργασίας ή διαβιβασμένες βάρδιες στο διάστημα. Ελέγξτε το πρόγραμμα πριν την έγκριση· δεν διαγράφηκε καμία βάρδια.");
      const kind = row.leaveType === "ΑΔΑΣ" ? "sick" : "leave";
      for (const day of days) {
        const onDay = existing.filter((s) => s.workDate === day);
        if (onDay.length > 1) throw new Error("Υπάρχουν πολλαπλές βάρδιες την ίδια ημέρα. Ελέγξτε το πρόγραμμα.");
        if (onDay[0]) await tx.update(shifts).set({ kind, startTime: "", endTime: "", breakMinutes: 0, overtimeMinutes: 0 }).where(eq(shifts.id, onDay[0].id));
        else await tx.insert(shifts).values({ id: randomUUID(), orgId, employeeId: row.employeeId, workDate: day, startTime: "", endTime: "", breakMinutes: 0, overtimeMinutes: 0, kind, erganiStatus: "pending", erganiRef: "", createdAt: new Date().toISOString() });
      }
    }
    await tx.update(leaveRequests).set({ status: decision, decidedBy, decidedAt: new Date().toISOString(), decisionNote: note.slice(0, 200) }).where(and(eq(leaveRequests.id, id), eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "pending")));
    return row;
  });
  await notify(db, { orgId, type: "tax_deadline", title: `Άδεια ${decision === "approved" ? "εγκρίθηκε" : "απορρίφθηκε"}: ${lr.employeeName}`, body: `${lr.fromDate} – ${lr.toDate}${note ? ` · ${note}` : ""}`, link: `/employees/${lr.employeeId}`, skipEmail: true });
  return { lr };
}
