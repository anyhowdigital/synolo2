"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { officeTasks, periodLocks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, firmClients, resolveFirm } from "@/lib/services/firm";
import { taxDeadlines } from "@/lib/services/compliance";
import { audit } from "@/lib/services/audit";
import { CLOSING_STEPS } from "@/lib/services/closing-steps";
import { findOcrDuplicates, insertOcrExpenses, type DupCheckRow, type OcrDraftRow } from "@/app/actions/ocr-bulk";

const now = () => new Date().toISOString();


async function firmCtx() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { error: "Απαιτείται σύνδεση." as const };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { error: "Δεν βρέθηκε λογιστικό γραφείο." as const };
  return { db, user, firm };
}

/** Toggle βήματος μηνιαίου κλεισίματος (αποθηκεύεται ως εκκρεμότητα γραφείου). */
export async function toggleClosingStepAction(orgId: string, month: string, step: string, done: boolean) {
  const ctx = await firmCtx();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };
  const { db, user, firm } = ctx;
  const client = await firmClient(db, firm, orgId);
  if (!client) return { ok: false as const, error: "Δεν έχετε πρόσβαση σε αυτόν τον πελάτη." };
  const code = `close:${month}:${step}`;
  const existing = await db.select().from(officeTasks).where(and(eq(officeTasks.orgId, orgId), eq(officeTasks.code, code)));
  const label = CLOSING_STEPS.find((s) => s.code === step)?.label ?? step;
  if (existing.length) {
    await db.update(officeTasks).set({ status: done ? "done" : "open", assigneeUserId: user.id, note: done ? `Ολοκληρώθηκε ${now().slice(0, 10)}` : "", updatedAt: now() }).where(eq(officeTasks.id, existing[0].id));
  } else {
    await db.insert(officeTasks).values({
      id: randomUUID(),
      orgId,
      code,
      title: `${label} · ${month}`,
      severity: "info",
      status: done ? "done" : "open",
      dueDate: `${month}-25`,
      assigneeUserId: user.id,
      note: "",
      createdAt: now(),
      updatedAt: now(),
    });
  }
  revalidatePath("/office/closing");
  return { ok: true as const };
}

/** Δημιουργία εκκρεμοτήτων από τις φορολογικές προθεσμίες των επιλεγμένων πελατών. */
export async function createDeadlineTasksAction(orgIds: string[], days = 30) {
  const ctx = await firmCtx();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };
  const { db, user, firm } = ctx;
  const clients = (await firmClients(db, firm)).filter((c) => orgIds.includes(c.org.id));
  if (!clients.length) return { ok: false as const, error: "Επιλέξτε τουλάχιστον έναν πελάτη." };
  let created = 0;
  for (const c of clients) {
    const items = taxDeadlines(c.org).items.filter((d) => d.days >= 0 && d.days <= days);
    for (const d of items) {
      const code = `deadline:${d.date}:${d.title.slice(0, 30)}`;
      const exists = await db.select().from(officeTasks).where(and(eq(officeTasks.orgId, c.org.id), eq(officeTasks.code, code)));
      if (exists.length) continue;
      await db.insert(officeTasks).values({
        id: randomUUID(),
        orgId: c.org.id,
        code,
        title: d.title,
        severity: d.days <= 5 ? "high" : "medium",
        status: "open",
        dueDate: d.date,
        assigneeUserId: c.link.assigneeUserId ?? user.id,
        note: "Δημιουργήθηκε αυτόματα από το φορολογικό ημερολόγιο.",
        createdAt: now(),
        updatedAt: now(),
      });
      created += 1;
    }
  }
  revalidatePath("/office/tasks");
  revalidatePath("/office/calendar");
  return { ok: true as const, created };
}

/** Μαζικό κλείδωμα περιόδου σε πολλούς πελάτες. */
export async function bulkPeriodLockAction(orgIds: string[], period: string) {
  const ctx = await firmCtx();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };
  const { db, user, firm } = ctx;
  if (!/^\d{4}-\d{2}$/.test(period)) return { ok: false as const, error: "Μη έγκυρη περίοδος (ΕΕΕΕ-ΜΜ)." };
  const clients = (await firmClients(db, firm)).filter((c) => orgIds.includes(c.org.id) && (c.accessLevel === "full" || c.accessLevel === "manager"));
  if (!clients.length) return { ok: false as const, error: "Επιλέξτε πελάτες με πλήρη πρόσβαση." };
  let locked = 0;
  for (const c of clients) {
    const exists = await db.select().from(periodLocks).where(and(eq(periodLocks.orgId, c.org.id), eq(periodLocks.month, period)));
    if (exists.length) continue;
    await db.insert(periodLocks).values({ id: randomUUID(), orgId: c.org.id, month: period, lockedBy: user.name || user.email, note: "Κλείδωμα από την πύλη λογιστή", createdAt: now() });
    await audit(db, c.org.id, "period", period, "period_locked", `Κλείδωμα περιόδου ${period} από το λογιστικό γραφείο`, { id: user.id, name: user.name || user.email });
    locked += 1;
  }
  revalidatePath("/office/bulk");
  return { ok: true as const, locked, skipped: clients.length - locked };
}

/** Έλεγχος διπλοεγγραφών OCR για πελάτη του γραφείου. */
export async function officeCheckOcrDuplicatesAction(orgId: string, rows: DupCheckRow[]) {
  const ctx = await firmCtx();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };
  const client = await firmClient(ctx.db, ctx.firm, orgId);
  if (!client) return { ok: false as const, error: "Δεν έχετε πρόσβαση σε αυτόν τον πελάτη." };
  return { ok: true as const, duplicates: await findOcrDuplicates(ctx.db, orgId, rows) };
}

/** Μαζική καταχώρηση αποδείξεων πελάτη από την πύλη λογιστή (πάντα προσχέδια). */
export async function officeCommitOcrAction(orgId: string, rows: OcrDraftRow[]) {
  const ctx = await firmCtx();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };
  const { db, user, firm } = ctx;
  const client = await firmClient(db, firm, orgId);
  if (!client || client.accessLevel === "read") return { ok: false as const, error: "Δεν έχετε δικαίωμα καταχώρησης για αυτόν τον πελάτη." };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false as const, error: "Δεν επιλέξατε αποδείξεις." };
  const res = await insertOcrExpenses(db, orgId, rows, { id: user.id, name: `${user.name || user.email} (λογιστής)` });
  revalidatePath(`/office/clients/${orgId}`);
  return { ok: true as const, ...res };
}

/** Κατάσταση βημάτων κλεισίματος για πολλούς πελάτες/μήνα. */
export async function closingStatus(orgIds: string[], month: string) {
  const db = await getDb();
  if (!orgIds.length) return {} as Record<string, Record<string, boolean>>;
  const rows = await db.select().from(officeTasks).where(inArray(officeTasks.orgId, orgIds));
  const out: Record<string, Record<string, boolean>> = {};
  for (const r of rows) {
    if (!r.code?.startsWith(`close:${month}:`)) continue;
    const step = r.code.split(":")[2];
    out[r.orgId] = out[r.orgId] ?? {};
    out[r.orgId][step] = r.status === "done";
  }
  return out;
}
