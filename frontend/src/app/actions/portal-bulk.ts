"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { invoices, organizations } from "@/db/schema";
import { getPortalCustomer } from "@/lib/services/portal";
import { startBulkCheckout } from "@/lib/payments/bulk";
import { chargeInvoiceOffSession } from "@/lib/payments/subscriptions";
import { remainingAmount } from "@/lib/payments/online";

export type BulkPayResult = { ok: true; url: string } | { ok: true; charged: number; failed: number; message: string } | { ok: false; error: string };

type Ctx =
  | { ok: false; error: string }
  | {
      ok: true;
      db: Awaited<ReturnType<typeof getDb>>;
      org: NonNullable<Awaited<ReturnType<typeof loadOrg>>>;
      customer: NonNullable<Awaited<ReturnType<typeof getPortalCustomer>>>["customer"];
      open: (typeof invoices.$inferSelect)[];
    };

async function loadOrg(db: Awaited<ReturnType<typeof getDb>>, orgId: string) {
  return db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
}

async function loadContext(token: string, invoiceIds: string[]): Promise<Ctx> {  const db = await getDb();
  const found = await getPortalCustomer(db, token);
  if (!found) return { ok: false, error: "Ο σύνδεσμος δεν είναι έγκυρος." };
  const org = await loadOrg(db, found.customer.orgId);
  if (!org) return { ok: false, error: "Δεν βρέθηκε η επιχείρηση." };
  if (invoiceIds.length === 0) return { ok: false, error: "Επιλέξτε τουλάχιστον ένα παραστατικό." };
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, org.id), eq(invoices.customerId, found.customer.id), inArray(invoices.id, invoiceIds)));
  const open = rows.filter((i) => i.status === "issued" && remainingAmount(i) > 0.005);
  if (open.length === 0) return { ok: false, error: "Τα επιλεγμένα παραστατικά είναι ήδη εξοφλημένα." };
  return { ok: true, db, org, customer: found.customer, open };
}

/** Μαζική online πληρωμή επιλεγμένων παραστατικών (μία συνεδρία Stripe). */
export async function portalBulkCheckoutAction(token: string, invoiceIds: string[]): Promise<BulkPayResult> {
  const ctx = await loadContext(token, invoiceIds);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  try {
    const url = await startBulkCheckout(ctx.db, ctx.org, ctx.open, token);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία σύνδεσης με το Stripe." };
  }
}

/** Άμεση εξόφληση όλων των επιλεγμένων με την αποθηκευμένη κάρτα (χωρίς ανακατεύθυνση). */
export async function portalPayWithSavedCardAction(token: string, invoiceIds: string[]): Promise<BulkPayResult> {
  const ctx = await loadContext(token, invoiceIds);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!ctx.customer.stripePaymentMethodId) return { ok: false, error: "Δεν υπάρχει αποθηκευμένη κάρτα. Αποθηκεύστε πρώτα μια κάρτα." };
  let charged = 0;
  let failed = 0;
  let lastError = "";
  for (const inv of ctx.open) {
    const res = await chargeInvoiceOffSession(ctx.db, ctx.org, inv, ctx.customer);
    if (res.ok) charged++;
    else {
      failed++;
      lastError = res.error;
    }
  }
  revalidatePath(`/portal/${token}`);
  return {
    ok: true,
    charged,
    failed,
    message: failed === 0 ? `Εξοφλήθηκαν ${charged} παραστατικά με την κάρτα σας.` : `Εξοφλήθηκαν ${charged}, απέτυχαν ${failed}. ${lastError}`,
  };
}
