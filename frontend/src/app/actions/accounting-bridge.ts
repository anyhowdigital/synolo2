"use server";

import { getDb } from "@/db";
import type { Organization } from "@/db/schema";
import { runImport, recentBatches, undoImport, IMPORT_PATHS, type ImportKind } from "@/lib/import/engine";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClient, canWrite } from "@/lib/services/firm";
import { updateOrg } from "@/lib/services/org";
import {
  parsePartyImport,
  parseExpenseImport,
  parseProductImport,
  parseBridgeConfig,
  buildBridgeDataset,
  pushDataset,
  filterDataset,
  ALL_ENTITIES,
  type BridgeProviderId,
  type BridgeEntity,
} from "@/lib/accounting-bridge";
import { audit } from "@/lib/services/audit";
import { revalidatePath } from "next/cache";

type Entity = "customers" | "suppliers" | "expenses" | "products";
interface ImportInput { orgId?: string; provider: BridgeProviderId; entity: Entity; content: string; filename: string }

type Target = { org: Organization; actor: { id: string; name: string } };
async function resolveTarget(db: Awaited<ReturnType<typeof getDb>>, orgId?: string): Promise<Target | { error: string }> {
  const user = await getCurrentUser(db);
  if (!user) return { error: "Απαιτείται σύνδεση." };
  if (orgId) {
    const firm = await resolveFirm(db, user.id);
    if (!firm) return { error: "Μη εξουσιοδοτημένος." };
    const client = await firmClient(db, firm, orgId);
    if (!client) return { error: "Δεν έχετε πρόσβαση στον πελάτη." };
    if (!canWrite(client.accessLevel)) return { error: "Το επίπεδο πρόσβασης δεν επιτρέπει εγγραφή." };
    return { org: client.org, actor: { id: user.id, name: user.name } };
  }
  const ctx = await requireContext(db);
  if (!can(ctx.role, "write")) return { error: "Ο ρόλος σας δεν επιτρέπει εγγραφή (μόνο ανάγνωση)." };
  return { org: ctx.org, actor: { id: user.id, name: user.name } };
}

export async function previewImportAction(input: ImportInput) {
  if (input.entity === "expenses") {
    const { docs, warnings } = parseExpenseImport(input.provider, input.content);
    return { ok: true as const, count: docs.length, sample: docs.slice(0, 5), warnings };
  }
  if (input.entity === "products") {
    const { products: items, warnings } = parseProductImport(input.provider, input.content);
    return { ok: true as const, count: items.length, sample: items.slice(0, 5), warnings };
  }
  const { parties, warnings } = parsePartyImport(input.provider, input.entity, input.content);
  return { ok: true as const, count: parties.length, sample: parties.slice(0, 5), warnings };
}

const CODE_TO_RATE: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };
const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(";")).join("\n");
const el = (n: number) => n.toFixed(2).replace(".", ",");
const elDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Μετατρέπει το αρχείο του παρόχου σε κανονικό CSV και το περνά στην κοινή μηχανή εισαγωγής (batch + αναίρεση + audit). */
export async function commitImportAction(input: ImportInput & { updateExisting?: boolean }) {
  const db = await getDb();
  const t = await resolveTarget(db, input.orgId);
  if ("error" in t) return { ok: false as const, error: t.error };
  let kind: ImportKind;
  let text: string;
  let warnings: string[];
  if (input.entity === "expenses") {
    const parsed = parseExpenseImport(input.provider, input.content);
    warnings = parsed.warnings;
    kind = "expenses";
    text = csv(["Προμηθευτής", "ΑΦΜ", "Ημερομηνία", "Σειρά", "Αριθμός", "Περιγραφή", "Καθαρή αξία", "Ποσό ΦΠΑ"], parsed.docs.map((d) => [d.supplierName || "—", d.supplierAfm, elDate(d.date), d.series ?? "", d.number ?? "", d.description ?? "", el(d.net || d.gross - d.vat), el(d.vat)]));
  } else if (input.entity === "products") {
    const parsed = parseProductImport(input.provider, input.content);
    warnings = parsed.warnings;
    kind = "products";
    text = csv(["Περιγραφή", "Κωδικός", "Τιμή", "ΦΠΑ", "Τύπος", "Σημειώσεις"], parsed.products.map((p) => [p.name, p.barcode ?? "", el(p.unitPrice), p.vatCategory ? String(CODE_TO_RATE[p.vatCategory] ?? 24) : "24", p.kind, p.category ?? ""]));
  } else {
    const parsed = parsePartyImport(input.provider, input.entity, input.content);
    warnings = parsed.warnings;
    kind = input.entity;
    text = csv(["Επωνυμία", "ΑΦΜ", "ΔΟΥ", "Χώρα", "Διεύθυνση", "Πόλη", "Email", "Τηλέφωνο"], parsed.parties.map((p) => [p.name, p.afm, p.doy ?? "", p.country ?? "GR", p.address ?? "", p.city ?? "", p.email ?? "", p.phone ?? ""]));
  }
  if (text.split("\n").length < 2) return { ok: false as const, error: warnings[0] || "Δεν βρέθηκαν εγγραφές προς εισαγωγή." };
  try {
    const { result, batchId } = await runImport(db, t.org, kind, text, input.filename || `${input.provider}-${input.entity}`, { updateExisting: input.updateExisting !== false, source: `bridge:${input.provider}` }, t.actor);
    if (input.orgId) revalidatePath(`/office/clients/${input.orgId}/bridge`); else revalidatePath(IMPORT_PATHS[kind]);
    return { ok: true as const, inserted: result.created, updated: result.updated, skipped: result.skipped, failed: result.errors.length, batchId, warnings: [...warnings, ...result.errors.slice(0, 8).map((e) => `Γραμμή ${e.row}: ${e.message}`)] };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Η εισαγωγή απέτυχε." };
  }
}

export async function bridgeRecentBatchesAction(orgId?: string) {
  const db = await getDb();
  const t = await resolveTarget(db, orgId);
  if ("error" in t) return [];
  return recentBatches(db, t.org.id, undefined, 8);
}

export async function bridgeUndoImportAction(input: { orgId?: string; batchId: string }) {
  const db = await getDb();
  const t = await resolveTarget(db, input.orgId);
  if ("error" in t) return { ok: false as const, error: t.error };
  const res = await undoImport(db, t.org.id, input.batchId, t.actor);
  if (res.ok) { if (input.orgId) revalidatePath(`/office/clients/${input.orgId}/bridge`); else revalidatePath(IMPORT_PATHS[res.kind]); }
  return res;
}

// ---------------- Αποθήκευση credentials & ζωντανή αποστολή ----------------
interface SaveConfigInput {
  orgId?: string;
  enabled: boolean;
  provider: BridgeProviderId;
  baseUrl: string;
  appId: string;
  username: string;
  password: string;
  apiKey: string;
  company: string;
  branch: string;
  module: string;
}

export async function saveBridgeConfigAction(input: SaveConfigInput) {
  const db = await getDb();
  const t = await resolveTarget(db, input.orgId);
  if ("error" in t) return { ok: false as const, error: t.error };
  const current = parseBridgeConfig(t.org.accountingBridgeJson);
  const next = {
    enabled: input.enabled,
    provider: input.provider,
    baseUrl: input.baseUrl.trim(),
    appId: input.appId.trim(),
    username: input.username.trim(),
    // κενό μυστικό = διατήρηση υπάρχοντος
    password: input.password ? input.password : current.password,
    apiKey: input.apiKey ? input.apiKey : current.apiKey,
    company: input.company.trim(),
    branch: input.branch.trim(),
    module: input.module.trim(),
  };
  await updateOrg(db, t.org.id, { accountingBridgeJson: JSON.stringify(next) });
  await audit(db, t.org.id, "accounting_bridge", input.provider, "config", `enabled=${input.enabled}`, t.actor);
  if (input.orgId) revalidatePath(`/office/clients/${input.orgId}/bridge`);
  return { ok: true as const };
}

export async function pushBridgeAction(input: { orgId?: string; from: string; to: string; entities?: string[] }) {
  const db = await getDb();
  const t = await resolveTarget(db, input.orgId);
  if ("error" in t) return { ok: false as const, error: t.error };
  const cfg = parseBridgeConfig(t.org.accountingBridgeJson);
  if (!cfg.enabled) return { ok: false as const, error: "Η ζωντανή σύνδεση δεν είναι ενεργοποιημένη. Αποθηκεύστε πρώτα credentials." };
  const wanted = (input.entities ?? []).filter((e): e is BridgeEntity => (ALL_ENTITIES as string[]).includes(e));
  if (input.entities && !wanted.length) return { ok: false as const, error: "Δεν επιλέξατε τι να αποσταλεί." };
  const ds = filterDataset(await buildBridgeDataset(db, t.org, input.from, input.to), input.entities ? new Set(wanted) : undefined);
  const res = await pushDataset(cfg.provider, { baseUrl: cfg.baseUrl, appId: cfg.appId, username: cfg.username, password: cfg.password, apiKey: cfg.apiKey, company: cfg.company, branch: cfg.branch, module: cfg.module }, ds);
  await audit(db, t.org.id, "accounting_bridge", cfg.provider, "push", res.ok ? `sent customers=${res.sent.customers} suppliers=${res.sent.suppliers}` : `error: ${res.error} (sent c=${res.sent.customers} s=${res.sent.suppliers})`, t.actor);
  return { ok: res.ok, error: res.error, messages: res.messages, sent: res.sent, failed: res.failed, provider: res.provider };
}
