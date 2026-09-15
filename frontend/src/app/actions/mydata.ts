"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireOrg } from "@/lib/services/org";
import { assertFeature } from "@/lib/billing/limits";
import { compareMyIncome, reconcileTransmitted, transmitAllPending, type IncomeComparison, type ReconciliationResult } from "@/lib/services/mydata-sync";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ReconcileActionResult = { ok: true; data: ReconciliationResult } | { ok: false; error: string };
export type CompareIncomeActionResult = { ok: true; data: IncomeComparison } | { ok: false; error: string };
export type BulkTransmitResult = { ok: true; total: number; sent: number; errors: { id: string; number: string; error: string }[] } | { ok: false; error: string };

export async function reconcileAction(from: string, to: string): Promise<ReconcileActionResult> {
  if (!DATE.test(from) || !DATE.test(to)) return { ok: false, error: "Μη έγκυρη περίοδος." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    assertFeature(org, "mydataSync");
    const data = await reconcileTransmitted(db, org, { from, to });
    if (data.cancelledRemote.length) {
      revalidatePath("/invoices");
      revalidatePath("/dashboard");
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function compareIncomeAction(from: string, to: string): Promise<CompareIncomeActionResult> {
  if (!DATE.test(from) || !DATE.test(to)) return { ok: false, error: "Μη έγκυρη περίοδος." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "read");
    assertFeature(org, "mydataSync");
    return { ok: true, data: await compareMyIncome(db, org, { from, to }) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function transmitAllPendingAction(ids?: string[]): Promise<BulkTransmitResult> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const r = await transmitAllPending(db, org, ids);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/mydata");
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}