"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { audit } from "@/lib/services/audit";
import { canManageBooks, closeFiscalYear, deleteEntry, generateEntries, postEntry, seedChart, type Plan } from "@/lib/services/gl";
import { getCurrentUser } from "@/lib/auth/session";

type Res<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

export async function enableDoubleEntryAction(plan: Plan): Promise<Res<{ created: number }>> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const user = await getCurrentUser(db);
  if (!user || !(await canManageBooks(db, ctx.org.id, user.id))) {
    return { ok: false, error: "Τα διπλογραφικά τηρεί ο λογιστής. Ενεργοποιήστε τη δική σας διαχείριση από Ρυθμίσεις → Λογιστής." };
  }
  const created = await seedChart(db, ctx.org.id, plan);
  await db.update(organizations).set({ accountingPlan: plan, booksCategory: "double" }).where(eq(organizations.id, ctx.org.id));
  await audit(db, ctx.org.id, "accounting", plan, "double_entry_enabled", `Ενεργοποίηση διπλογραφικών (${plan}) · ${created} λογαριασμοί`, await resolveActor(db));
  revalidatePath("/accounting");
  return { ok: true, created };
}

export async function generateEntriesAction(from: string, to: string): Promise<Res<{ created: number }>> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const user = await getCurrentUser(db);
  if (!user || !(await canManageBooks(db, ctx.org.id, user.id))) {
    return { ok: false, error: "Τα διπλογραφικά τηρεί ο λογιστής. Ενεργοποιήστε τη δική σας διαχείριση από Ρυθμίσεις → Λογιστής." };
  }
  const actor = await resolveActor(db);
  try {
    const created = await generateEntries(db, ctx.org, { from, to }, actor?.name ?? "");
    await audit(db, ctx.org.id, "accounting", `${from}_${to}`, "gl_entries_generated", `${created} άρθρα από παραστατικά`, actor);
    revalidatePath("/accounting");
    return { ok: true, created };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createEntryAction(input: { date: string; description: string; lines: { accountCode: string; debit: number; credit: number; description?: string }[] }): Promise<Res> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const user = await getCurrentUser(db);
  if (!user || !(await canManageBooks(db, ctx.org.id, user.id))) {
    return { ok: false, error: "Τα διπλογραφικά τηρεί ο λογιστής. Ενεργοποιήστε τη δική σας διαχείριση από Ρυθμίσεις → Λογιστής." };
  }
  const actor = await resolveActor(db);
  try {
    await postEntry(db, ctx.org.id, { ...input, sourceType: "manual", createdBy: actor?.name ?? "" });
    revalidatePath("/accounting");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteEntryAction(entryId: string): Promise<Res> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const user = await getCurrentUser(db);
  if (!user || !(await canManageBooks(db, ctx.org.id, user.id))) {
    return { ok: false, error: "Τα διπλογραφικά τηρεί ο λογιστής. Ενεργοποιήστε τη δική σας διαχείριση από Ρυθμίσεις → Λογιστής." };
  }
  await deleteEntry(db, ctx.org.id, entryId);
  revalidatePath("/accounting");
  return { ok: true };
}

export async function closeYearAction(year: number): Promise<Res<{ profit: number }>> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const user = await getCurrentUser(db);
  if (!user || !(await canManageBooks(db, ctx.org.id, user.id))) {
    return { ok: false, error: "Τα διπλογραφικά τηρεί ο λογιστής. Ενεργοποιήστε τη δική σας διαχείριση από Ρυθμίσεις → Λογιστής." };
  }
  try {
    const profit = await closeFiscalYear(db, ctx.org.id, year, (await resolveActor(db))?.name ?? "");
    revalidatePath("/accounting");
    return { ok: true, profit };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
