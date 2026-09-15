"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { clockIn, clockOut, getStaffByToken } from "@/lib/services/staff-portal";
import { submitWorkCardMove } from "@/lib/services/ergani-api";
import { createLeaveRequest } from "@/lib/services/leave";

type Fail = { ok: false; error: string };
const STAFF_COOKIE = "staff_portal";

export async function staffSession(token: string) {
  const jar = await cookies();
  const raw = jar.get(STAFF_COOKIE)?.value ?? "";
  const [t, pin] = raw.split(":");
  if (t !== token || !pin) return null;
  const db = await getDb();
  const found = await getStaffByToken(db, token);
  if (!found || found.emp.portalPin !== pin) return null;
  return found;
}

export async function staffLoginAction(token: string, pin: string): Promise<{ ok: true } | Fail> {
  const db = await getDb();
  const found = await getStaffByToken(db, token);
  if (!found) return { ok: false, error: "Ο σύνδεσμος δεν είναι έγκυρος." };
  if (!/^\d{4}$/.test(pin) || found.emp.portalPin !== pin) return { ok: false, error: "Λάθος PIN." };
  const jar = await cookies();
  jar.set(STAFF_COOKIE, `${token}:${pin}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath(`/staff/${token}`);
  return { ok: true };
}

export async function staffLogoutAction(token: string) {
  (await cookies()).delete(STAFF_COOKIE);
  revalidatePath(`/staff/${token}`);
}

export async function staffClockAction(token: string, dir: "in" | "out"): Promise<{ ok: true; message: string } | Fail> {
  const found = await staffSession(token);
  if (!found) return { ok: false, error: "Απαιτείται PIN." };
  try {
    const db = await getDb();
    if (dir === "in") {
      const shiftId = await clockIn(db, found.emp.id, found.emp.orgId);
      const er = await submitWorkCardMove(db, found.org, found.emp, "0", shiftId);
      revalidatePath(`/staff/${token}`);
      return { ok: true, message: `Η άφιξη καταχωρήθηκε στην ψηφιακή κάρτα.${er ? (er.ok ? ` ΕΡΓΑΝΗ ✓${er.protocol ? ` ${er.protocol}` : ""}` : " (ΕΡΓΑΝΗ: απέτυχε — θα υποβληθεί από τον λογιστή)") : ""}` };
    }
    const r = await clockOut(db, found.emp.id, found.emp.hoursPerWeek);
    const er = await submitWorkCardMove(db, found.org, found.emp, "1", r.shiftId);
    revalidatePath(`/staff/${token}`);
    return { ok: true, message: `Αναχώρηση ${r.end} · ${Math.floor(r.worked / 60)}ω ${r.worked % 60}′${r.overtime ? ` · υπερωρία ${r.overtime}′` : ""}${er ? (er.ok ? " · ΕΡΓΑΝΗ ✓" : " · ΕΡΓΑΝΗ: απέτυχε") : ""}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function staffLeaveRequestAction(token: string, input: { leaveType: string; fromDate: string; toDate: string; reason?: string }): Promise<{ ok: true; days: number } | Fail> {
  const found = await staffSession(token);
  if (!found) return { ok: false, error: "Απαιτείται PIN." };
  try {
    const db = await getDb();
    const r = await createLeaveRequest(db, found.emp.orgId, found.emp.id, input);
    revalidatePath(`/staff/${token}`);
    return { ok: true, days: r.days };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
