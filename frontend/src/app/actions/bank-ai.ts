"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { aiSuggest, applyRules, applySplit, applySuggestions, deleteRule, listRules, type AiSuggestion, type AiSuggestResult } from "@/lib/services/bank-ai";

const revalidate = () => {
  revalidatePath("/banking");
  revalidatePath("/office/banking");
};

export async function aiSuggestAction(accountId: string): Promise<AiSuggestResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  return aiSuggest(db, ctx.org.id, ctx.org.name, accountId);
}

export async function applySuggestionsAction(list: AiSuggestion[]): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "Δεν επιλέξατε προτάσεις." };
  const res = await applySuggestions(db, ctx.org.id, list.slice(0, 50));
  await audit(db, ctx.org.id, "bank_transaction", "ai", "ai_reconcile_applied", `${res.done} προτάσεις εγκρίθηκαν`, await resolveActor(db));
  revalidate();
  return { ok: true, message: `${res.done} κινήσεις συμφωνήθηκαν${res.errors.length ? ` · ${res.errors.length} απέτυχαν (${res.errors[0]})` : ""}. Οι κανόνες ενημερώθηκαν.` };
}

export async function applyRulesAction(accountId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const r = await applyRules(db, ctx.org.id, accountId);
  const done = r.matched + r.entries + r.ignored;
  if (done) await audit(db, ctx.org.id, "cash_account", accountId, "rules_applied", `${done} κινήσεις από κανόνες`, await resolveActor(db));
  revalidate();
  const parts: string[] = [];
  if (r.matched) parts.push(`${r.matched} ταυτίστηκαν με παραστατικά`);
  if (r.entries) parts.push(`${r.entries} καταχωρήθηκαν ως λοιπές κινήσεις`);
  if (r.ignored) parts.push(`${r.ignored} παραβλέφθηκαν`);
  if (!done) return { ok: true, message: `Καμία κίνηση δεν ταίριαξε με τους κανόνες — ${r.remaining} εκκρεμούν.` };
  parts.push(`${r.remaining} εκκρεμούν`);
  return { ok: true, message: parts.join(" · ") };
}

export async function splitMatchAction(txId: string, allocations: { type: "invoice" | "expense"; id: string; amount: number }[]): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  try {
    const res = await applySplit(db, ctx.org.id, txId, allocations);
    await audit(db, ctx.org.id, "bank_transaction", txId, "split_matched", `${res.count} παραστατικά · ${res.total} €`, await resolveActor(db));
    revalidate();
    return { ok: true, message: `Η κίνηση επιμερίστηκε σε ${res.count} παραστατικά (${res.total} €).` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function listRulesAction() {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false as const, error };
  return { ok: true as const, rules: await listRules(db, ctx.org.id) };
}

export async function deleteRuleAction(id: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false as const, error };
  await deleteRule(db, ctx.org.id, id);
  revalidate();
  return { ok: true as const };
}

/** Μαζική αυτόματη συμφωνία για πολλούς πελάτες του λογιστικού γραφείου. */
export async function officeBulkReconcileAction(orgIds: string[]): Promise<{ ok: true; rows: { orgName: string; message: string }[] } | { ok: false; error: string }> {
  const { getCurrentUser } = await import("@/lib/auth/session");
  const { resolveFirm, firmClients, canWrite } = await import("@/lib/services/firm");
  const { listAccounts } = await import("@/lib/services/banking");
  const { autoReconcile } = await import("@/lib/services/banking");
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { ok: false, error: "Ο λογαριασμός δεν ανήκει σε λογιστικό γραφείο." };
  const clients = (await firmClients(db, firm)).filter((c) => orgIds.includes(c.org.id) && canWrite(c.accessLevel));
  if (!clients.length) return { ok: false, error: "Επιλέξτε πελάτες με πλήρη πρόσβαση." };

  const rows: { orgName: string; message: string }[] = [];
  for (const c of clients) {
    const accounts = await listAccounts(db, c.org.id);
    let matched = 0;
    let remaining = 0;
    let ruleHits = 0;
    for (const acc of accounts) {
      const rule = await applyRules(db, c.org.id, acc.id);
      ruleHits += rule.matched + rule.entries + rule.ignored;
      const r = await autoReconcile(db, c.org.id, acc.id);
      matched += r.linkedExisting + r.autoCreated + r.transfers;
      remaining += r.remaining;
    }
    rows.push({ orgName: c.org.name, message: accounts.length ? (matched + ruleHits ? `${matched + ruleHits} συμφωνήθηκαν · ${remaining} εκκρεμούν` : `Δεν υπήρχαν κινήσεις προς συμφωνία`) : "Δεν υπάρχουν λογαριασμοί" });
    await audit(db, c.org.id, "cash_account", "office", "office_bulk_reconcile", `${matched + ruleHits} από το πάνελ γραφείου`);
  }
  revalidatePath("/office/banking");
  return { ok: true, rows };
}
