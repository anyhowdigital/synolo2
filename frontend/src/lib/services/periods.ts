import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { periodLocks } from "@/db/schema";

/** Επιστρέφει τους κλειδωμένους μήνες της επιχείρησης. */
export async function lockedMonths(db: Db, orgId: string) {
  const rows = await db.select().from(periodLocks).where(eq(periodLocks.orgId, orgId));
  return rows;
}

export async function isMonthLocked(db: Db, orgId: string, isoDate: string) {
  const month = isoDate.slice(0, 7);
  const row = await db
    .select()
    .from(periodLocks)
    .where(and(eq(periodLocks.orgId, orgId), eq(periodLocks.month, month)))
    .limit(1);
  return row.length > 0;
}

/** Απαγορεύει αλλαγές σε κλειδωμένη περίοδο (χρήση σε καταχωρήσεις/εκδόσεις). */
export async function assertPeriodOpen(db: Db, orgId: string, isoDate: string) {
  if (await isMonthLocked(db, orgId, isoDate)) {
    throw new Error(`Η περίοδος ${isoDate.slice(0, 7)} είναι κλειδωμένη μετά την υποβολή. Ξεκλειδώστε τη από Αναφορές → Μηνιαίο κλείσιμο για να κάνετε αλλαγές.`);
  }
}
