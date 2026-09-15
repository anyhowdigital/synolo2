import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { bankRules, bankTransactions, type BankTransaction } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { applyMatch, bookTransactionAsEntry, listTransactions, matchCandidates, setTransactionStatus, type EntryKind, type MatchCandidate } from "@/lib/services/banking";

const now = () => new Date().toISOString();

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .trim();

export type RuleAction = "entry" | "invoice_customer" | "expense_supplier" | "ignore";

export const RULE_ACTION_LABELS: Record<RuleAction, string> = {
  entry: "Λοιπή κίνηση",
  invoice_customer: "Είσπραξη πελάτη",
  expense_supplier: "Πληρωμή προμηθευτή",
  ignore: "Παράβλεψη",
};

/** Λέξη-κλειδί κανόνα: ο αντισυμβαλλόμενος ή η πιο χαρακτηριστική λέξη της περιγραφής. */
export function ruleKeyword(tx: Pick<BankTransaction, "counterparty" | "description">) {
  const cp = norm(tx.counterparty);
  if (cp.length >= 4) return cp.split(" ").slice(0, 3).join(" ");
  const tokens = norm(tx.description)
    .split(" ")
    .filter((t) => t.length >= 4 && !/^\d+$/.test(t));
  return tokens.slice(0, 2).join(" ") || norm(tx.description).slice(0, 24);
}

export async function listRules(db: Db, orgId: string) {
  return db.select().from(bankRules).where(eq(bankRules.orgId, orgId));
}

/** Αποθηκεύει (ή ενισχύει) κανόνα μετά από έγκριση του χρήστη. */
export async function learnRule(db: Db, orgId: string, tx: BankTransaction, action: RuleAction, opts: { entryKind?: string; targetName?: string } = {}) {
  const keyword = ruleKeyword(tx);
  if (keyword.length < 3) return null;
  const existing = await db.query.bankRules.findFirst({ where: and(eq(bankRules.orgId, orgId), eq(bankRules.keyword, keyword), eq(bankRules.action, action)) });
  if (existing) {
    await db.update(bankRules).set({ hits: existing.hits + 1, lastUsedAt: now() }).where(eq(bankRules.id, existing.id));
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(bankRules).values({
    id,
    orgId,
    keyword,
    action,
    entryKind: opts.entryKind ?? "",
    targetName: (opts.targetName ?? "").slice(0, 120),
    hits: 1,
    lastUsedAt: now(),
    createdAt: now(),
  });
  return id;
}

export async function deleteRule(db: Db, orgId: string, id: string) {
  await db.delete(bankRules).where(and(eq(bankRules.id, id), eq(bankRules.orgId, orgId)));
}

export interface RuleRunResult {
  matched: number;
  entries: number;
  ignored: number;
  remaining: number;
}

/** Εφαρμογή αποθηκευμένων κανόνων στις ασυμφώνητες κινήσεις (χωρίς AI, χωρίς κόστος). */
export async function applyRules(db: Db, orgId: string, accountId: string): Promise<RuleRunResult> {
  const [txs, rules] = await Promise.all([listTransactions(db, orgId, accountId, { status: "unmatched", limit: 1000 }), listRules(db, orgId)]);
  const res: RuleRunResult = { matched: 0, entries: 0, ignored: 0, remaining: 0 };
  if (!rules.length) {
    res.remaining = txs.length;
    return res;
  }
  for (const tx of txs) {
    const text = norm(`${tx.description} ${tx.counterparty} ${tx.reference}`);
    const rule = rules
      .filter((r) => r.keyword && text.includes(r.keyword))
      .sort((a, b) => b.keyword.length - a.keyword.length || b.hits - a.hits)[0];
    if (!rule) {
      res.remaining += 1;
      continue;
    }
    try {
      if (rule.action === "ignore") {
        await setTransactionStatus(db, orgId, tx.id, "ignored");
        res.ignored += 1;
      } else if (rule.action === "entry") {
        await bookTransactionAsEntry(db, orgId, tx.id, (rule.entryKind || "other_out") as EntryKind, `Κανόνας: ${rule.keyword}`);
        res.entries += 1;
      } else {
        const cands = await matchCandidates(db, orgId, tx, 5);
        const wanted = rule.action === "invoice_customer" ? "invoice" : "expense";
        const hit = cands.find((c) => c.type === wanted && Math.abs(c.remaining - Math.abs(tx.amount)) < 0.005 && (!rule.targetName || norm(c.counterparty).includes(norm(rule.targetName).split(" ")[0] ?? "")));
        if (!hit) {
          res.remaining += 1;
          continue;
        }
        await applyMatch(db, orgId, tx.id, hit.type, hit.id, Math.abs(tx.amount), `Κανόνας «${rule.keyword}»`);
        res.matched += 1;
      }
      await db.update(bankRules).set({ hits: rule.hits + 1, lastUsedAt: now() }).where(eq(bankRules.id, rule.id));
    } catch {
      res.remaining += 1;
    }
  }
  return res;
}

export interface AiSuggestion {
  txId: string;
  txLabel: string;
  txAmount: number;
  txDate: string;
  kind: "match" | "entry" | "ignore";
  candidateId: string | null;
  candidateType: "invoice" | "expense" | null;
  candidateLabel: string;
  entryKind: EntryKind | null;
  confidence: number;
  reason: string;
}

export type AiSuggestResult = { ok: true; suggestions: AiSuggestion[]; scanned: number } | { ok: false; error: string };

/** Ζητά από το AI προτάσεις για τις κινήσεις που δεν λύθηκαν με κανόνες. Δεν εκτελείται τίποτα. */
export async function aiSuggest(db: Db, orgId: string, orgName: string, accountId: string, limit = 20): Promise<AiSuggestResult> {
  const txs = (await listTransactions(db, orgId, accountId, { status: "unmatched", limit: 200 })).slice(0, limit);
  if (!txs.length) return { ok: false, error: "Δεν υπάρχουν ασυμφώνητες κινήσεις." };

  const candMap = new Map<string, MatchCandidate[]>();
  const payload = [];
  for (const tx of txs) {
    const cands = await matchCandidates(db, orgId, tx, 5);
    candMap.set(tx.id, cands);
    payload.push({
      tx_id: tx.id,
      booked_at: tx.bookedAt,
      amount: tx.amount,
      description: tx.description,
      counterparty: tx.counterparty,
      reference: tx.reference,
      candidates: cands.map((c) => ({ id: c.id, type: c.type, label: c.label, counterparty: c.counterparty, remaining: c.remaining, date: c.date, rule_score: c.score })),
    });
  }

  try {
    const resp = await fetch("http://127.0.0.1:8001/api/copilot/bank-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_name: orgName, current_date: new Date().toISOString().slice(0, 10), transactions: payload }),
    });
    if (!resp.ok) return { ok: false, error: `Το AI δεν απάντησε (${resp.status}).` };
    const data = await resp.json();
    const raw = (data.suggestions ?? []) as Record<string, unknown>[];
    const suggestions: AiSuggestion[] = [];
    for (const s of raw) {
      const tx = txs.find((t) => t.id === s.tx_id);
      if (!tx) continue;
      const kind = (s.kind as AiSuggestion["kind"]) ?? "ignore";
      const cand = kind === "match" ? candMap.get(tx.id)?.find((c) => c.id === s.candidate_id) : undefined;
      if (kind === "match" && !cand) continue;
      suggestions.push({
        txId: tx.id,
        txLabel: `${tx.description || "—"}${tx.counterparty ? ` · ${tx.counterparty}` : ""}`,
        txAmount: tx.amount,
        txDate: tx.bookedAt,
        kind,
        candidateId: cand?.id ?? null,
        candidateType: cand?.type ?? null,
        candidateLabel: cand ? `${cand.label} · ${cand.counterparty} · υπόλοιπο ${round2(cand.remaining)} €` : "",
        entryKind: kind === "entry" ? ((s.entry_kind as EntryKind) ?? "other_out") : null,
        confidence: typeof s.confidence === "number" ? Math.round(s.confidence) : 60,
        reason: String(s.reason ?? ""),
      });
    }
    return { ok: true, suggestions, scanned: txs.length };
  } catch (err) {
    return { ok: false, error: `Αποτυχία επικοινωνίας με το AI: ${(err as Error).message}` };
  }
}

/** Εκτέλεση εγκεκριμένων προτάσεων + εκμάθηση κανόνα για κάθε μία. */
export async function applySuggestions(db: Db, orgId: string, list: AiSuggestion[]) {
  let done = 0;
  const errors: string[] = [];
  for (const s of list) {
    const tx = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.id, s.txId), eq(bankTransactions.orgId, orgId)) });
    if (!tx || tx.status !== "unmatched") continue;
    try {
      if (s.kind === "ignore") {
        await setTransactionStatus(db, orgId, tx.id, "ignored");
        await learnRule(db, orgId, tx, "ignore");
      } else if (s.kind === "entry") {
        const kind = (s.entryKind ?? "other_out") as EntryKind;
        await bookTransactionAsEntry(db, orgId, tx.id, kind, `AI: ${s.reason}`.slice(0, 200));
        await learnRule(db, orgId, tx, "entry", { entryKind: kind });
      } else if (s.candidateId && s.candidateType) {
        const cands = await matchCandidates(db, orgId, tx, 8);
        const cand = cands.find((c) => c.id === s.candidateId);
        if (!cand) {
          errors.push("Το παραστατικό δεν είναι πλέον διαθέσιμο.");
          continue;
        }
        await applyMatch(db, orgId, tx.id, cand.type, cand.id, Math.min(Math.abs(tx.amount), cand.remaining), `AI συμφωνία: ${s.reason}`.slice(0, 200));
        await learnRule(db, orgId, tx, cand.type === "invoice" ? "invoice_customer" : "expense_supplier", { targetName: cand.counterparty });
      }
      done += 1;
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  return { done, errors };
}

/** Επιμερισμός μιας τραπεζικής κίνησης σε πολλά παραστατικά (μερικές/πολλαπλές πληρωμές). */
export async function applySplit(db: Db, orgId: string, txId: string, allocations: { type: "invoice" | "expense"; id: string; amount: number }[]) {
  const tx = await db.query.bankTransactions.findFirst({ where: and(eq(bankTransactions.id, txId), eq(bankTransactions.orgId, orgId)) });
  if (!tx) throw new Error("Η κίνηση δεν βρέθηκε.");
  if (tx.status === "matched") throw new Error("Η κίνηση έχει ήδη συμφωνηθεί.");
  const valid = allocations.filter((a) => a.amount > 0.004);
  if (!valid.length) throw new Error("Συμπληρώστε τουλάχιστον ένα ποσό.");
  const total = round2(valid.reduce((s, a) => s + a.amount, 0));
  if (total > Math.abs(tx.amount) + 0.005) throw new Error(`Το σύνολο (${total} €) υπερβαίνει το ποσό της κίνησης (${Math.abs(tx.amount)} €).`);

  const notes: string[] = [];
  for (let i = 0; i < valid.length; i++) {
    if (i > 0) await db.update(bankTransactions).set({ status: "unmatched", matchedType: null, matchedId: null }).where(eq(bankTransactions.id, txId));
    const res = await applyMatch(db, orgId, txId, valid[i].type, valid[i].id, valid[i].amount, "Επιμερισμός τραπεζικής κίνησης");
    notes.push(`${res.target}: ${res.amount} €`);
  }
  const partial = total < Math.abs(tx.amount) - 0.005 ? ` · υπόλοιπο κίνησης ${round2(Math.abs(tx.amount) - total)} €` : "";
  await db.update(bankTransactions).set({ matchNote: `Επιμερισμός σε ${valid.length}: ${notes.join(" · ")}${partial}`.slice(0, 400) }).where(eq(bankTransactions.id, txId));
  return { count: valid.length, total };
}
