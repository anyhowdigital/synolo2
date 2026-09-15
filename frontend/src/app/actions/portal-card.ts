"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getPortalCustomer } from "@/lib/services/portal";
import { createSaveCardSession } from "@/lib/payments/subscriptions";

export type PortalCardResult = { ok: true; url: string } | { ok: false; error: string };

/** Δημόσια ενέργεια portal: ο πελάτης αποθηκεύει κάρτα για αυτόματες πληρωμές. */
export async function portalSaveCardAction(token: string): Promise<PortalCardResult> {
  const db = await getDb();
  const found = await getPortalCustomer(db, token);
  if (!found) return { ok: false, error: "Ο σύνδεσμος δεν είναι έγκυρος." };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, found.customer.orgId) });
  if (!org) return { ok: false, error: "Δεν βρέθηκε η επιχείρηση." };
  try {
    const url = await createSaveCardSession(db, org, found.customer, token);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία σύνδεσης με το Stripe." };
  }
}
