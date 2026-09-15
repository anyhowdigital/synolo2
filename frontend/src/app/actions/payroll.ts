"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type Employee } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageBooks } from "@/lib/services/gl";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { computeRun, deleteShift, postRun, saveEmployee, saveShift } from "@/lib/services/payroll";
import { deleteAsset, postMonthlyDepreciation, saveAsset, type AssetInput } from "@/lib/services/fixed-assets";
import { audit } from "@/lib/services/audit";
import { BONUS_LABEL, computeBonusRun, type BonusKind } from "@/lib/services/bonuses";
import { computeSeverance, saveTermination, type TerminationKind } from "@/lib/services/severance";
import { saveErganiCredentials, submitErgani, testErganiConnection, type ErganiForm } from "@/lib/services/ergani-api";
import { ensurePortalAccess } from "@/lib/services/staff-portal";
import { employees, memberships } from "@/db/schema";
import { and } from "drizzle-orm";
import { decideLeaveRequest } from "@/lib/services/leave";

type Fail = { ok: false; error: string };

/** Πρόσβαση: μόνο ο λογιστής του πελάτη (ή η επιχείρηση αν το έχει ενεργοποιήσει). */
type Guard = { db: Awaited<ReturnType<typeof getDb>>; user: { id: string; name: string | null; email: string }; org: typeof organizations.$inferSelect; actorName: string } | { error: string };

async function guard(orgId: string): Promise<Guard> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (firm) {
    const client = await firmClient(db, firm, orgId);
    if (!client || (client.accessLevel !== "manager" && client.accessLevel !== "full")) return { error: "Δεν έχετε δικαίωμα διαχείρισης για αυτόν τον πελάτη." };
    return { db, user, org: client.org, actorName: `${user.name || user.email} (λογιστής)` };
  }
  if (!(await canManageBooks(db, orgId, user.id))) return { error: "Τα ευαίσθητα λογιστικά τα διαχειρίζεται ο λογιστής σας." };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) return { error: "Η επιχείρηση δεν βρέθηκε." };
  return { db, user, org, actorName: user.name || user.email };
}

const paths = (orgId: string) => {
  revalidatePath(`/office/clients/${orgId}/payroll`);
  revalidatePath(`/office/clients/${orgId}/ergani`);
  revalidatePath(`/office/clients/${orgId}/assets`);
  revalidatePath(`/office/clients/${orgId}/employees`, "layout");
  revalidatePath("/employees", "layout");
};

/** Έγκριση αδειών: λογιστής (manager/full) ή εργοδότης (owner/admin της επιχείρησης). */
async function leaveGuard(orgId: string): Promise<{ db: Awaited<ReturnType<typeof getDb>>; actorName: string } | { error: string }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { error: "Απαιτείται σύνδεση." } as const;
  const firm = await resolveFirm(db, user.id);
  if (firm) {
    const client = await firmClient(db, firm, orgId);
    if (!client || (client.accessLevel !== "manager" && client.accessLevel !== "full")) return { error: "Δεν έχετε δικαίωμα για αυτόν τον πελάτη." } as const;
    return { db, actorName: `${user.name || user.email} (λογιστής)` as string };
  }
  const membership = await db.query.memberships.findFirst({ where: and(eq(memberships.orgId, orgId), eq(memberships.userId, user.id)) });
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) return { error: "Μόνο ο ιδιοκτήτης/διαχειριστής ή ο λογιστής εγκρίνει άδειες." } as const;
  return { db, actorName: (user.name || user.email) as string };
}

export async function decideLeaveAction(orgId: string, id: string, decision: "approved" | "rejected", note = ""): Promise<{ ok: true; ergani: string } | Fail> {
  const g = await leaveGuard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    await decideLeaveRequest(g.db, orgId, id, decision, g.actorName, note);
    paths(orgId);
    return { ok: true, ergani: decision === "approved" ? "Δεν έγινε διαβίβαση στο ΕΡΓΑΝΗ. Χρησιμοποιήστε τη χωριστή ενέργεια υποβολής." : "" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveEmployeeAction(orgId: string, data: Partial<Employee> & { firstName: string; lastName: string; hireDate: string }, id?: string): Promise<{ ok: true; id: string } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const empId = await saveEmployee(g.db, orgId, data, id);
    await audit(g.db, orgId, "payroll", empId, id ? "employee_updated" : "employee_created", `${data.lastName} ${data.firstName}`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true, id: empId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function computeRunAction(orgId: string, month: string, overrides: Record<string, { days?: number; overtimeHours?: number; bonus?: number }> = {}): Promise<{ ok: true; gross: number; net: number } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const data = await computeRun(g.db, orgId, month, g.actorName, Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, { employeeId: k, ...v }])));
    await audit(g.db, orgId, "payroll", data.run.id, "payroll_computed", `Μισθοδοσία ${month}`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true, gross: data.run.grossTotal, net: data.run.netTotal };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function postRunAction(orgId: string, month: string): Promise<{ ok: true } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    await postRun(g.db, orgId, month, g.actorName);
    await audit(g.db, orgId, "payroll", month, "payroll_posted", `Λογιστική καταχώρηση μισθοδοσίας ${month}`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveShiftAction(orgId: string, data: { employeeId: string; workDate: string; startTime: string; endTime: string; breakMinutes?: number; overtimeMinutes?: number; kind?: string }): Promise<{ ok: true } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    await saveShift(g.db, orgId, data);
    paths(orgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteShiftAction(orgId: string, id: string): Promise<{ ok: true } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  await deleteShift(g.db, orgId, id);
  paths(orgId);
  return { ok: true };
}

export async function saveAssetAction(orgId: string, data: AssetInput, id?: string): Promise<{ ok: true } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    await saveAsset(g.db, orgId, data, id);
    paths(orgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteAssetAction(orgId: string, id: string): Promise<{ ok: true } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  await deleteAsset(g.db, orgId, id);
  paths(orgId);
  return { ok: true };
}

export async function postDepreciationAction(orgId: string, month: string): Promise<{ ok: true; message: string } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const res = await postMonthlyDepreciation(g.db, orgId, month, g.actorName);
    if (res.alreadyPosted) return { ok: true, message: `Οι αποσβέσεις ${month} έχουν ήδη καταχωρηθεί.` };
    if (!res.created) return { ok: true, message: "Δεν υπάρχουν πάγια με απόσβεση αυτόν τον μήνα." };
    await audit(g.db, orgId, "assets", month, "depreciation_posted", `Αποσβέσεις ${month}: ${res.amount.toFixed(2)} €`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true, message: `Καταχωρήθηκαν αποσβέσεις ${res.amount.toFixed(2)} € για ${res.created} πάγια.` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function computeBonusAction(orgId: string, kind: BonusKind, year: number): Promise<{ ok: true; gross: number; net: number; count: number } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const data = await computeBonusRun(g.db, orgId, kind, year, g.actorName);
    await audit(g.db, orgId, "payroll", data.run.id, "bonus_computed", `${BONUS_LABEL[kind]} ${year}`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true, gross: data.run.grossTotal, net: data.run.netTotal, count: data.items.length };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function previewSeveranceAction(orgId: string, employeeId: string, kind: TerminationKind, endDate: string, withNotice: boolean): Promise<{ ok: true; calc: ReturnType<typeof computeSeverance> } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  const emp = await g.db.query.employees.findFirst({ where: and(eq(employees.id, employeeId), eq(employees.orgId, orgId)) });
  if (!emp) return { ok: false, error: "Ο εργαζόμενος δεν βρέθηκε." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < emp.hireDate) return { ok: false, error: "Μη έγκυρη ημερομηνία αποχώρησης." };
  return { ok: true, calc: computeSeverance(emp, kind, endDate, withNotice) };
}

export async function saveTerminationAction(orgId: string, input: { employeeId: string; kind: TerminationKind; endDate: string; withNotice: boolean; note?: string }): Promise<{ ok: true; id: string; gross: number } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const res = await saveTermination(g.db, orgId, input);
    await audit(g.db, orgId, "payroll", res.id, "termination_saved", `Αποχώρηση ${input.kind} ${input.endDate} — αποζημίωση ${res.gross.toFixed(2)} €`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true, id: res.id, gross: res.gross };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveErganiCredentialsAction(orgId: string, data: { username: string; password?: string; mode: "trial" | "live" }): Promise<{ ok: true } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    await saveErganiCredentials(g.db, orgId, data);
    await audit(g.db, orgId, "payroll", orgId, "ergani_credentials_saved", `ΕΡΓΑΝΗ (${data.mode})`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function testErganiAction(orgId: string): Promise<{ ok: true; info: Awaited<ReturnType<typeof testErganiConnection>> } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const info = await testErganiConnection(g.db, g.org);
    paths(orgId);
    return { ok: true, info };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function submitErganiAction(orgId: string, form: ErganiForm, period: string, refId?: string): Promise<{ ok: true; protocol: string } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const res = await submitErgani(g.db, g.org, form, period, g.actorName, refId);
    await audit(g.db, orgId, "payroll", res.id, res.ok ? "ergani_submitted" : "ergani_failed", `ΕΡΓΑΝΗ ${form} ${period}`, { id: g.user.id, name: g.actorName });
    paths(orgId);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, protocol: res.protocol };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function staffPortalAccessAction(orgId: string, employeeId: string, rotate = false): Promise<{ ok: true; url: string; pin: string } | Fail> {
  const g = await guard(orgId);
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const { token, pin } = await ensurePortalAccess(g.db, orgId, employeeId, rotate);
    paths(orgId);
    return { ok: true, url: `/staff/${token}`, pin };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
