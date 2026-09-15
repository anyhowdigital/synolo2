import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { loginAttempts } from "@/db/schema";

/**
 * Προστασία από brute force στη σύνδεση: μετά από MAX_FAILURES αποτυχίες για το ίδιο email
 * ο λογαριασμός κλειδώνει για LOCK_MINUTES. Ο μετρητής μηδενίζεται αν περάσει RESET_MINUTES
 * από την τελευταία αποτυχία ή μετά από επιτυχή σύνδεση. Αποθηκεύεται στη βάση ώστε να ισχύει
 * σε όλα τα serverless instances.
 */
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;
const RESET_MINUTES = 30;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/** Επιστρέφει τα λεπτά που απομένουν αν ο λογαριασμός είναι κλειδωμένος, αλλιώς 0. */
export async function loginLockedMinutes(db: Db, email: string): Promise<number> {
  const row = await db.query.loginAttempts.findFirst({ where: eq(loginAttempts.key, normalize(email)) });
  if (!row?.lockedUntil) return 0;
  const remainingMs = new Date(row.lockedUntil).getTime() - Date.now();
  return remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 60_000)) : 0;
}

/** Καταγράφει αποτυχία και επιστρέφει true αν με αυτή ο λογαριασμός κλείδωσε. */
export async function recordLoginFailure(db: Db, email: string): Promise<{ locked: boolean; remaining: number }> {
  const key = normalize(email);
  const now = new Date();
  const row = await db.query.loginAttempts.findFirst({ where: eq(loginAttempts.key, key) });
  const stale = row && now.getTime() - new Date(row.lastFailedAt).getTime() > RESET_MINUTES * 60_000;
  const failures = row && !stale ? row.failures + 1 : 1;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null;
  await db
    .insert(loginAttempts)
    .values({ key, failures, lastFailedAt: now.toISOString(), lockedUntil })
    .onConflictDoUpdate({ target: loginAttempts.key, set: { failures, lastFailedAt: now.toISOString(), lockedUntil } });
  return { locked: !!lockedUntil, remaining: Math.max(0, MAX_FAILURES - failures) };
}

export async function clearLoginFailures(db: Db, email: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, normalize(email)));
}

export const LOGIN_LOCK_MINUTES = LOCK_MINUTES;
