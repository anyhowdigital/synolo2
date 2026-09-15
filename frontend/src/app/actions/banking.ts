"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { formatMoney } from "@/lib/invoice/totals";
import {
  addEntry,
  applyMatch,
  autoReconcile,
  bookTransactionAsEntry,
  deleteAccount,
  deleteEntry,
  deleteImportBatch,
  importStatement,
  matchCandidates,
  saveAccount,
  setTransactionStatus,
  transferBetweenAccounts,
  type EntryKind,
  type MatchCandidate,
} from "@/lib/services/banking";
import { bankTransactions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ActionResult } from "./customers";

function revalidate() {
  revalidatePath("/banking", "layout");
  revalidatePath("/invoices", "layout");
  revalidatePath("/expenses");
  revalidatePath("/suppliers", "layout");
  revalidatePath("/dashboard");
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_KINDS = ["transfer", "fee", "interest", "other_in", "other_out", "owner_in", "owner_out", "tax"] as const;

const accountSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Το όνομα λογαριασμού είναι υποχρεωτικό."),
  kind: z.enum(["bank", "cash", "card", "other"]),
  iban: z.string().trim().max(40).default(""),
  bankName: z.string().trim().max(120).default(""),
  currency: z.string().trim().max(3).default("EUR"),
  openingBalance: z.coerce.number().default(0),
  openingDate: z.string().trim().default(""),
  isDefault: z.string().optional(),
  active: z.string().optional(),
});

export async function saveAccountAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const d = parsed.data;
  if (d.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(d.iban.replace(/\s+/g, ""))) return { ok: false, error: "Μη έγκυρο IBAN." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await saveAccount(
      db,
      ctx.org.id,
      { name: d.name, kind: d.kind, iban: d.iban, bankName: d.bankName, currency: d.currency, openingBalance: d.openingBalance, openingDate: dateRe.test(d.openingDate) ? d.openingDate : null, isDefault: d.isDefault === "on", active: d.active !== "off" },
      d.id || undefined,
    );
    await audit(db, ctx.org.id, "cash_account", id, d.id ? "updated" : "created", d.name, await resolveActor(db));
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteAccountAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteAccount(db, ctx.org.id, id);
    await audit(db, ctx.org.id, "cash_account", id, "deleted", "", await resolveActor(db));
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const entrySchema = z.object({
  accountId: z.string().min(1, "Επιλέξτε λογαριασμό."),
  kind: z.enum(ENTRY_KINDS),
  amount: z.coerce.number().refine((v) => v !== 0 && Number.isFinite(v), "Το ποσό δεν μπορεί να είναι 0."),
  note: z.string().trim().max(300).default(""),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
});

export async function addEntryAction(input: z.input<typeof entrySchema>): Promise<ActionResult> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const en = await addEntry(db, ctx.org.id, parsed.data);
    await audit(db, ctx.org.id, "cash_account", parsed.data.accountId, "created", `Κίνηση ${formatMoney(en.amount)}`, await resolveActor(db));
    revalidate();
    return { ok: true, id: en.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const transferSchema = z.object({
  fromAccountId: z.string().min(1, "Επιλέξτε λογαριασμό προέλευσης."),
  toAccountId: z.string().min(1, "Επιλέξτε λογαριασμό προορισμού."),
  amount: z.coerce.number().positive("Το ποσό πρέπει να είναι θετικό."),
  movedAt: z.string().regex(dateRe, "Μη έγκυρη ημερομηνία."),
  note: z.string().trim().max(300).default(""),
});

export async function transferAction(input: z.input<typeof transferSchema>): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await transferBetweenAccounts(db, ctx.org.id, parsed.data);
    await audit(db, ctx.org.id, "cash_account", parsed.data.fromAccountId, "transfer", formatMoney(parsed.data.amount), await resolveActor(db));
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteEntryAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await deleteEntry(db, ctx.org.id, id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const statementRowSchema = z.object({
  bookedAt: z.string().regex(dateRe),
  amount: z.number(),
  description: z.string().max(500).default(""),
  counterparty: z.string().max(200).optional(),
  reference: z.string().max(100).optional(),
  balanceAfter: z.number().nullable().optional(),
});

export async function importStatementAction(accountId: string, rows: unknown): Promise<ActionResult> {
  const parsed = z.array(statementRowSchema).min(1, "Δεν υπάρχουν γραμμές προς εισαγωγή.").max(5000, "Μέγιστο 5.000 γραμμές ανά εισαγωγή.").safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρες γραμμές." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const res = await importStatement(db, ctx.org.id, accountId, parsed.data);
    await audit(db, ctx.org.id, "cash_account", accountId, "statement_imported", `${res.imported} νέες, ${res.skipped} διπλές`, await resolveActor(db));
    revalidate();
    const parts = [`${res.imported} νέες κινήσεις`];
    if (res.skipped) parts.push(`${res.skipped} ήδη καταχωρημένες παραλείφθηκαν`);
    if (res.invalid) parts.push(`${res.invalid} μη έγκυρες`);
    return { ok: true, id: res.batchId, warning: parts.join(" · ") };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function autoReconcileAction(accountId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const r = await autoReconcile(db, ctx.org.id, accountId);
    const done = r.linkedExisting + r.autoCreated + r.transfers;
    await audit(db, ctx.org.id, "cash_account", accountId, "reconciled", `${done} συμφωνήθηκαν, ${r.remaining} εκκρεμούν`, await resolveActor(db));
    revalidate();
    const parts: string[] = [];
    if (r.linkedExisting) parts.push(`${r.linkedExisting} συνδέθηκαν με καταχωρημένες εισπράξεις/πληρωμές`);
    if (r.autoCreated) parts.push(`${r.autoCreated} νέες εισπράξεις/πληρωμές δημιουργήθηκαν`);
    if (r.transfers) parts.push(`${r.transfers} μεταφορές/κινήσεις`);
    if (r.remaining) parts.push(`${r.remaining} εκκρεμούν${r.suggestions ? ` (${r.suggestions} με προτάσεις)` : ""}`);
    return { ok: true, warning: parts.length ? parts.join(" · ") : "Δεν υπήρχαν ασυμφώνητες κινήσεις." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function matchCandidatesAction(txId: string): Promise<{ ok: true; candidates: MatchCandidate[] } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  const tx = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.id, txId), eq(bankTransactions.orgId, ctx.org.id)) });
  if (!tx) return { ok: false, error: "Η κίνηση δεν βρέθηκε." };
  return { ok: true, candidates: await matchCandidates(db, ctx.org.id, tx, 10) };
}

export async function applyMatchAction(txId: string, type: "invoice" | "expense", targetId: string, amount: number): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const res = await applyMatch(db, ctx.org.id, txId, type, targetId, amount);
    await audit(db, ctx.org.id, "bank_transaction", txId, "matched", `${res.target} · ${formatMoney(res.amount)}`, await resolveActor(db));
    revalidate();
    return { ok: true, id: res.paymentId, warning: `${type === "invoice" ? "Είσπραξη" : "Πληρωμή"} ${formatMoney(res.amount)} – ${res.target}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function bookAsEntryAction(txId: string, kind: EntryKind, note?: string): Promise<ActionResult> {
  if (!ENTRY_KINDS.includes(kind)) return { ok: false, error: "Μη έγκυρος τύπος κίνησης." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const id = await bookTransactionAsEntry(db, ctx.org.id, txId, kind, note?.trim().slice(0, 300));
    revalidate();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setTxStatusAction(txId: string, status: "unmatched" | "ignored"): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    await setTransactionStatus(db, ctx.org.id, txId, status);
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteBatchAction(batchId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const n = await deleteImportBatch(db, ctx.org.id, batchId);
    revalidate();
    return { ok: true, warning: `${n} κινήσεις διαγράφηκαν.` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
