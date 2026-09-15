import JSZip from "jszip";
import { and, eq, gte, lte, notInArray, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, suppliers, invoices, invoiceLines, expenses, glEntries, glLines, type Organization } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";

// ---------------- Πάροχοι γέφυρας λογιστικού ----------------
export type BridgeProviderId = "simulation" | "generic" | "softone" | "epsilon" | "elorus";

export interface BridgeProviderDescriptor {
  id: BridgeProviderId;
  label: string;
  kind: "export" | "live";
  docsUrl?: string;
  help: string;
  fields: string[];
}

export const BRIDGE_PROVIDERS: BridgeProviderDescriptor[] = [
  {
    id: "simulation",
    label: "Προσομοίωση / Εξαγωγή αρχείου",
    kind: "export",
    help: "Παράγει το πλήρες σύνολο δεδομένων (πελάτες, προμηθευτές, έσοδα, έξοδα, λογιστικά άρθρα) σε JSON ή CSV για χειροκίνητη εισαγωγή. Δεν απαιτεί διαπιστευτήρια.",
    fields: [],
  },
  {
    id: "softone",
    label: "SoftOne (Soft1) — S1 Services",
    kind: "live",
    docsUrl: "https://www.softone.gr/ws/",
    help: "Ζωντανό REST API στο https://<εγκατάσταση>.oncloud.gr/s1services. Ροή: login (username/password/appId) → authenticate (company/branch/module) → setData με δομή data:{OBJECT:[{...}]} (OBJECT=CUSTOMER/SUPPLIER/ITEM). Πεδία πελάτη: CODE, NAME, AFM, IRSDATA (ΔΟΥ), ADDRESS, CITY, ZIP, PHONE01, EMAIL. Χρειάζεστε appId & Web Account από τη SoftOne.",
    fields: ["baseUrl", "appId", "username", "password", "company", "branch", "module"],
  },
  {
    id: "epsilon",
    label: "Epsilon Net — PYLON Connectivity / Online Accounting",
    kind: "live",
    docsUrl: "https://pylon.gr/en/integrations/",
    help: "Epsilon Pylon: εισαγωγή μητρώου μέσω «Επιπλέον εργασίες → Εισαγωγή δεδομένων από τρίτα συστήματα» (κατεβάστε «Εξαγωγή Πρότυπου Αρχείου» .xlsx και αντιστοιχίστε στήλες), και λογιστικών άρθρων μέσω module «Online Accounting» (εργαλείο FastImport). Το ZIP εδώ περιέχει ουδέτερα CSV προς χαρτογράφηση.",
    fields: ["baseUrl", "apiKey"],
  },
  {
    id: "generic",
    label: "Γενικός πάροχος (REST JSON)",
    kind: "live",
    help: "Για οποιοδήποτε πρόγραμμα που δέχεται POST JSON με API key σε header (X-API-Key). Βάλτε το base URL και το κλειδί από τον πάροχο.",
    fields: ["baseUrl", "apiKey"],
  },
  {
    id: "elorus",
    label: "Elorus (μόνο εισαγωγή)",
    kind: "export",
    docsUrl: "https://help.elorus.com/",
    help: "Μόνο εισαγωγή (όχι API): εξάγετε από το Elorus τις επαφές/έξοδα/είδη σε CSV (Ρυθμίσεις → Εξαγωγή) και ανεβάστε το εδώ. Οι στήλες αναγνωρίζονται αυτόματα (Επωνυμία/ΑΦΜ/Email/Τηλέφωνο κ.λπ.).",
    fields: [],
  },
];

// ---------------- Σύνολο δεδομένων ----------------
export interface BridgeParty {
  code: string;
  name: string;
  afm: string;
  doy?: string | null;
  country?: string | null;
  address?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
}
export interface BridgeDocument {
  id: string;
  series?: string | null;
  number?: string | number | null;
  date: string;
  party: string;
  afm?: string | null;
  invoiceType?: string | null;
  status?: string | null;
  net: number;
  vat: number;
  gross: number;
}
export interface BridgeJournalLine {
  entryNo: number | string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}
export interface BridgeDataset {
  org: { name: string; afm: string };
  period: { from: string; to: string };
  customers: BridgeParty[];
  suppliers: BridgeParty[];
  income: BridgeDocument[];
  expenses: BridgeDocument[];
  journal: BridgeJournalLine[];
  counts: { customers: number; suppliers: number; income: number; expenses: number; journalEntries: number; journalLines: number };
}

export async function buildBridgeDataset(db: Db, org: Organization, from: string, to: string): Promise<BridgeDataset> {
  const [cust, sup, inv, exp, entries] = await Promise.all([
    db.select().from(customers).where(eq(customers.orgId, org.id)),
    db.select().from(suppliers).where(eq(suppliers.orgId, org.id)),
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), notInArray(invoices.status, ["draft", "cancelled"]), gte(invoices.issueDate, from), lte(invoices.issueDate, to))),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, from), lte(expenses.issueDate, to))),
    db.select().from(glEntries).where(and(eq(glEntries.orgId, org.id), gte(glEntries.entryDate, from), lte(glEntries.entryDate, to))),
  ]);

  const invIds = inv.map((i) => i.id);
  const lines = invIds.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invIds)) : [];
  const totalsByInv = new Map<string, { net: number; vat: number; gross: number }>();
  for (const l of lines) {
    const t = totalsByInv.get(l.invoiceId) ?? { net: 0, vat: 0, gross: 0 };
    t.net += l.netValue ?? 0;
    t.vat += l.vatAmount ?? 0;
    t.gross += l.grossValue ?? 0;
    totalsByInv.set(l.invoiceId, t);
  }
  const custName = new Map(cust.map((c) => [c.id, c.name] as const));
  const custAfm = new Map(cust.map((c) => [c.id, c.afm] as const));

  const entIds = entries.map((e) => e.id);
  const gll = entIds.length ? await db.select().from(glLines).where(inArray(glLines.entryId, entIds)) : [];
  const entryById = new Map(entries.map((e) => [e.id, e] as const));

  const dataset: BridgeDataset = {
    org: { name: org.name, afm: org.afm },
    period: { from, to },
    customers: cust.map((c) => ({ code: c.id.slice(0, 8), name: c.name, afm: c.afm ?? "", doy: c.doy, country: c.country, address: c.address, city: c.city, email: c.email, phone: c.phone })),
    suppliers: sup.map((s) => ({ code: s.id.slice(0, 8), name: s.name, afm: s.afm ?? "", doy: s.doy, country: s.country, address: s.address, city: s.city, email: s.email, phone: s.phone })),
    income: inv.filter((i) => getDocumentType(i.invoiceType).kind !== "quote").map((i) => {
      const t = totalsByInv.get(i.id) ?? { net: 0, vat: 0, gross: 0 };
      const sign = getDocumentType(i.invoiceType).credit ? -1 : 1;
      return { id: i.id, series: i.seriesCode, number: i.number, date: i.issueDate, party: custName.get(i.customerId ?? "") ?? "—", afm: custAfm.get(i.customerId ?? "") ?? null, invoiceType: i.invoiceType, status: i.status, net: round2(sign * t.net), vat: round2(sign * t.vat), gross: round2(sign * t.gross) };
    }),
    expenses: exp.map((e) => ({ id: e.id, series: e.series, number: e.number, date: e.issueDate, party: e.supplierName, afm: e.supplierAfm, net: round2(e.netValue ?? 0), vat: round2(e.vatAmount ?? 0), gross: round2(e.grossValue ?? 0) })),
    journal: gll.map((l) => {
      const ent = entryById.get(l.entryId);
      return { entryNo: ent?.entryNo ?? "", date: ent?.entryDate ?? "", description: l.description || ent?.description || "", accountCode: l.accountCode, accountName: l.accountName, debit: round2(l.debit ?? 0), credit: round2(l.credit ?? 0) };
    }),
    counts: { customers: cust.length, suppliers: sup.length, income: inv.length, expenses: exp.length, journalEntries: entries.length, journalLines: gll.length },
  };
  dataset.counts.income = dataset.income.length;
  return dataset;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV του ημερολογίου (λογιστικά άρθρα) — η πιο κοινή μορφή εισαγωγής. */
export function datasetToCsv(ds: BridgeDataset): string {
  const rows = [["entry_no", "date", "account_code", "account_name", "debit", "credit", "description"]];
  for (const l of ds.journal) rows.push([String(l.entryNo), l.date, l.accountCode, l.accountName, l.debit.toFixed(2), l.credit.toFixed(2), l.description]);
  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

// ---------------- Ζωντανή αποστολή ----------------
export interface BridgeCredentials {
  baseUrl?: string;
  appId?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  company?: string;
  branch?: string;
  module?: string;
}
export interface BridgePushResult {
  ok: boolean;
  provider: BridgeProviderId;
  sent: { customers: number; suppliers: number };
  failed: { customers: number; suppliers: number };
  messages: string[];
  error?: string;
}

const ZERO = { customers: 0, suppliers: 0 };
const fail = (provider: BridgeProviderId, error: string, extra?: Partial<BridgePushResult>): BridgePushResult => ({ ok: false, provider, sent: ZERO, failed: ZERO, messages: [], ...extra, error });

/** Κρατά στο dataset μόνο τις επιλεγμένες οντότητες (οι υπόλοιπες αδειάζουν). */
export function filterDataset(ds: BridgeDataset, entities?: Set<BridgeEntity>): BridgeDataset {
  if (!entities) return ds;
  const keep = (e: BridgeEntity) => entities.has(e);
  const out: BridgeDataset = {
    ...ds,
    customers: keep("customers") ? ds.customers : [],
    suppliers: keep("suppliers") ? ds.suppliers : [],
    income: keep("income") ? ds.income : [],
    expenses: keep("expenses") ? ds.expenses : [],
    journal: keep("journal") ? ds.journal : [],
  };
  out.counts = { customers: out.customers.length, suppliers: out.suppliers.length, income: out.income.length, expenses: out.expenses.length, journalEntries: new Set(out.journal.map((l) => l.entryNo)).size, journalLines: out.journal.length };
  return out;
}

async function readJson(r: Response): Promise<Record<string, unknown> | null> {
  try { return (await r.json()) as Record<string, unknown>; } catch { return null; }
}

async function softonePush(creds: BridgeCredentials, ds: BridgeDataset): Promise<BridgePushResult> {
  const url = creds.baseUrl;
  if (!url || !creds.username || !creds.password || !creds.appId) return fail("softone", "Λείπουν διαπιστευτήρια SoftOne (baseUrl/appId/username/password).");
  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await readJson(r);
    if (!j) throw new Error(`SoftOne: μη έγκυρη απάντηση (HTTP ${r.status}).`);
    return j as { success?: boolean; clientID?: string; error?: string; message?: string };
  };
  const login = await post({ service: "login", username: creds.username, password: creds.password, appId: creds.appId });
  if (!login.success || !login.clientID) return fail("softone", `SoftOne login απέτυχε: ${login.error || login.message || "άγνωστο"}`);
  const auth = await post({ service: "authenticate", clientID: login.clientID, appId: creds.appId, COMPANY: creds.company, BRANCH: creds.branch, MODULE: creds.module });
  if (!auth.success || !auth.clientID) return fail("softone", `SoftOne authenticate απέτυχε (εταιρεία/υποκατάστημα/module): ${auth.error || auth.message || "άγνωστο"}`);
  const clientID = auth.clientID;
  const sent = { customers: 0, suppliers: 0 };
  const failed = { customers: 0, suppliers: 0 };
  const errors: string[] = [];
  const party = (p: BridgeParty) => ({ CODE: p.code, NAME: p.name, AFM: p.afm, IRSDATA: p.doy ?? "", ADDRESS: p.address ?? "", CITY: p.city ?? "", PHONE01: p.phone ?? "", EMAIL: p.email ?? "" });
  for (const cust of ds.customers) {
    const res = await post({ service: "setData", clientID, appId: creds.appId, OBJECT: "CUSTOMER", KEY: "", data: { CUSTOMER: [party(cust)] } });
    if (res.success) sent.customers++; else { failed.customers++; if (errors.length < 5) errors.push(`Πελάτης ${cust.name}: ${res.error || res.message || "απόρριψη"}`); }
  }
  for (const sup of ds.suppliers) {
    const res = await post({ service: "setData", clientID, appId: creds.appId, OBJECT: "SUPPLIER", KEY: "", data: { SUPPLIER: [party(sup)] } });
    if (res.success) sent.suppliers++; else { failed.suppliers++; if (errors.length < 5) errors.push(`Προμηθευτής ${sup.name}: ${res.error || res.message || "απόρριψη"}`); }
  }
  const total = ds.customers.length + ds.suppliers.length;
  const okCount = sent.customers + sent.suppliers;
  const messages = [`SoftOne: ${sent.customers}/${ds.customers.length} πελάτες, ${sent.suppliers}/${ds.suppliers.length} προμηθευτές.`, ...errors];
  if (ds.income.length || ds.expenses.length || ds.journal.length) messages.push("Έσοδα/έξοδα/άρθρα ΔΕΝ στάλθηκαν: το SoftOne API δέχεται προς το παρόν μόνο μητρώο (πελάτες/προμηθευτές). Χρησιμοποιήστε το αρχείο εξαγωγής.");
  if (total === 0) return fail("softone", "Δεν επιλέχθηκε καμία υποστηριζόμενη οντότητα (πελάτες/προμηθευτές).", { messages });
  if (okCount === 0) return fail("softone", "Όλες οι εγγραφές απορρίφθηκαν από το SoftOne.", { failed, messages });
  if (okCount < total) return { ok: false, provider: "softone", sent, failed, messages, error: `Μερική αποστολή: ${okCount}/${total} εγγραφές έγιναν δεκτές.` };
  return { ok: true, provider: "softone", sent, failed, messages };
}

async function restPush(provider: BridgeProviderId, creds: BridgeCredentials, ds: BridgeDataset): Promise<BridgePushResult> {
  if (!creds.baseUrl) return fail(provider, "Λείπει το base URL του παρόχου.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds.apiKey) headers["X-API-Key"] = creds.apiKey;
  const r = await fetch(creds.baseUrl, { method: "POST", headers, body: JSON.stringify(ds) });
  const j = await readJson(r);
  if (!r.ok) return fail(provider, `Ο πάροχος επέστρεψε HTTP ${r.status}${j && (j.error || j.message) ? `: ${j.error || j.message}` : ""}.`);
  if (j && (j.success === false || j.ok === false || (typeof j.status === "string" && /error|fail|reject/i.test(j.status)))) return fail(provider, `Ο πάροχος απέρριψε τα δεδομένα: ${j.error || j.message || j.status || "χωρίς λεπτομέρεια"}.`);
  return { ok: true, provider, sent: { customers: ds.customers.length, suppliers: ds.suppliers.length }, failed: ZERO, messages: [`Το σύνολο δεδομένων παραδόθηκε (HTTP ${r.status}). Η τελική αποδοχή εξαρτάται από τον πάροχο.`] };
}

export async function pushDataset(provider: BridgeProviderId, creds: BridgeCredentials, ds: BridgeDataset): Promise<BridgePushResult> {
  try {
    if (provider === "simulation") return { ok: true, provider, sent: { customers: ds.customers.length, suppliers: ds.suppliers.length }, failed: ZERO, messages: [`Προσομοίωση: ${ds.counts.customers} πελάτες, ${ds.counts.suppliers} προμηθευτές, ${ds.counts.income} έσοδα, ${ds.counts.expenses} έξοδα, ${ds.counts.journalEntries} άρθρα (χωρίς αποστολή).`] };
    if (provider === "elorus") return fail(provider, "Το Elorus υποστηρίζεται μόνο για εισαγωγή αρχείων, όχι ζωντανή αποστολή.");
    if (provider === "softone") return await softonePush(creds, ds);
    return await restPush(provider, creds, ds);
  } catch (err) {
    return fail(provider, (err as Error).message);
  }
}

// ---------------- Εξαγωγή ανά πρόγραμμα ----------------
function partiesCsv(parties: BridgeParty[], greek: boolean): string {
  const head = greek
    ? ["ΚΩΔΙΚΟΣ", "ΕΠΩΝΥΜΙΑ", "ΑΦΜ", "ΔΟΥ", "ΧΩΡΑ", "ΔΙΕΥΘΥΝΣΗ", "ΠΟΛΗ", "EMAIL", "ΤΗΛΕΦΩΝΟ"]
    : ["code", "name", "afm", "doy", "country", "address", "city", "email", "phone"];
  const rows = [head];
  for (const p of parties) rows.push([p.code, p.name, p.afm, p.doy ?? "", p.country ?? "", p.address ?? "", p.city ?? "", p.email ?? "", p.phone ?? ""].map((v) => v ?? ""));
  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

function docsCsv(docs: BridgeDocument[], greek: boolean): string {
  const head = greek ? ["ΣΕΙΡΑ", "ΑΡΙΘΜΟΣ", "ΗΜΕΡΟΜΗΝΙΑ", "ΣΥΝΑΛΛΑΣΣΟΜΕΝΟΣ", "ΑΦΜ", "ΤΥΠΟΣ", "ΚΑΘΑΡΗ", "ΦΠΑ", "ΣΥΝΟΛΟ"] : ["series", "number", "date", "party", "afm", "type", "net", "vat", "gross"];
  const rows = [head];
  for (const d of docs) rows.push([String(d.series ?? ""), String(d.number ?? ""), d.date, d.party, d.afm ?? "", d.invoiceType ?? "", d.net.toFixed(2), d.vat.toFixed(2), d.gross.toFixed(2)]);
  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

export interface ProgramExport {
  filename: string;
  mime: string;
  body: string | Uint8Array;
}

/** Παράγει αρχείο εξαγωγής στη μορφή του συγκεκριμένου προγράμματος. */
export type BridgeEntity = "customers" | "suppliers" | "income" | "expenses" | "journal";
export const ALL_ENTITIES: BridgeEntity[] = ["customers", "suppliers", "income", "expenses", "journal"];

/** Παράγει αρχείο εξαγωγής στη μορφή του συγκεκριμένου προγράμματος, μόνο για τις επιλεγμένες οντότητες. */
export async function buildProgramExport(provider: BridgeProviderId, ds: BridgeDataset, entities?: Set<BridgeEntity>): Promise<ProgramExport> {
  const stamp = `${ds.org.afm || "org"}_${ds.period.from}_${ds.period.to}`;
  const want = (e: BridgeEntity) => !entities || entities.has(e);
  if (provider === "softone") {
    const payload: Record<string, unknown> = { meta: { org: ds.org, period: ds.period, note: "SoftOne S1 Services setData payloads. Στείλτε το κάθε στοιχείο ως POST στο /s1services." } };
    if (want("customers")) payload.customers = ds.customers.map((c) => ({ service: "setData", OBJECT: "CUSTOMER", KEY: "", data: { CUSTOMER: [{ CODE: c.code, NAME: c.name, AFM: c.afm, IRSDATA: c.doy ?? "", ADDRESS: c.address ?? "", CITY: c.city ?? "", PHONE01: c.phone ?? "", EMAIL: c.email ?? "" }] } }));
    if (want("suppliers")) payload.suppliers = ds.suppliers.map((s) => ({ service: "setData", OBJECT: "SUPPLIER", KEY: "", data: { SUPPLIER: [{ CODE: s.code, NAME: s.name, AFM: s.afm, IRSDATA: s.doy ?? "", ADDRESS: s.address ?? "", CITY: s.city ?? "", PHONE01: s.phone ?? "", EMAIL: s.email ?? "" }] } }));
    if (want("income")) payload.income = ds.income;
    if (want("expenses")) payload.expenses = ds.expenses;
    if (want("journal")) payload.journal = ds.journal;
    return { filename: `softone_${stamp}.json`, mime: "application/json; charset=utf-8", body: JSON.stringify(payload, null, 2) };
  }
  const greek = provider === "epsilon";
  const zip = new JSZip();
  if (want("customers")) zip.file("customers.csv", partiesCsv(ds.customers, greek));
  if (want("suppliers")) zip.file("suppliers.csv", partiesCsv(ds.suppliers, greek));
  if (want("income")) zip.file("income.csv", docsCsv(ds.income, greek));
  if (want("expenses")) zip.file("expenses.csv", docsCsv(ds.expenses, greek));
  if (want("journal")) zip.file("journal.csv", datasetToCsv(ds));
  const buf = await zip.generateAsync({ type: "uint8array" });
  return { filename: `${provider}_${stamp}.zip`, mime: "application/zip", body: buf };
}

// ---------------- Εισαγωγή ανά πρόγραμμα ----------------
export interface ImportParty {
  name: string;
  afm: string;
  doy?: string;
  country?: string;
  address?: string;
  city?: string;
  email?: string;
  phone?: string;
}
export interface PartyImportResult {
  parties: ImportParty[];
  warnings: string[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function parseCsvText(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function headerIndex(headers: string[], candidates: string[]): number {
  const h = headers.map(norm);
  for (const c of candidates) {
    const idx = h.findIndex((x) => x === norm(c) || x.includes(norm(c)));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Διαβάζει αρχείο (CSV ή JSON) και επιστρέφει εγγραφές πελατών/προμηθευτών προς εισαγωγή. */
export function parsePartyImport(provider: BridgeProviderId, entity: "customers" | "suppliers", text: string): PartyImportResult {
  const warnings: string[] = [];
  const trimmed = text.trim();
  const toParty = (o: Record<string, unknown>): ImportParty => ({
    name: String(o.name ?? o.NAME ?? o.ΕΠΩΝΥΜΙΑ ?? ""),
    afm: String(o.afm ?? o.AFM ?? o.ΑΦΜ ?? ""),
    doy: (o.doy ?? o.IRSDATA) ? String(o.doy ?? o.IRSDATA) : undefined,
    country: o.country ? String(o.country) : undefined,
    address: (o.address ?? o.ADDRESS) ? String(o.address ?? o.ADDRESS) : undefined,
    city: (o.city ?? o.CITY) ? String(o.city ?? o.CITY) : undefined,
    email: (o.email ?? o.EMAIL) ? String(o.email ?? o.EMAIL) : undefined,
    phone: (o.phone ?? o.PHONE01) ? String(o.phone ?? o.PHONE01) : undefined,
  });

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      let arr: Record<string, unknown>[] = [];
      const raw = Array.isArray(j) ? j : (j[entity] as unknown[]) ?? [];
      arr = (raw as Record<string, unknown>[]).map((row) => {
        // SoftOne setData shape: { data: { CUSTOMER: [{...}] } } ή { CUSTOMER: {...} }
        const data = (row.data as Record<string, unknown> | undefined) ?? row;
        const inner = data.CUSTOMER ?? data.SUPPLIER;
        const obj = Array.isArray(inner) ? (inner[0] as Record<string, unknown> | undefined) : (inner as Record<string, unknown> | undefined);
        return obj ?? row;
      });
      const parties = arr.map(toParty).filter((p) => p.name);
      if (!parties.length) warnings.push("Δεν βρέθηκαν εγγραφές στο JSON για την επιλεγμένη οντότητα.");
      return { parties, warnings };
    } catch {
      warnings.push("Μη έγκυρο JSON.");
      return { parties: [], warnings };
    }
  }

  const rows = parseCsvText(text);
  if (rows.length < 2) { warnings.push("Το CSV δεν περιέχει γραμμές δεδομένων."); return { parties: [], warnings }; }
  const headers = rows[0];
  const iName = headerIndex(headers, ["name", "επωνυμια", "ονομα", "εταιρεια", "επων"]);
  const iAfm = headerIndex(headers, ["afm", "αφμ", "vat", "α.φ.μ"]);
  if (iName < 0) { warnings.push("Δεν εντοπίστηκε στήλη επωνυμίας/name στο CSV."); return { parties: [], warnings }; }
  const iDoy = headerIndex(headers, ["doy", "δου", "δ.ο.υ"]);
  const iCountry = headerIndex(headers, ["country", "χωρα"]);
  const iAddress = headerIndex(headers, ["address", "διευθυνση"]);
  const iCity = headerIndex(headers, ["city", "πολη"]);
  const iEmail = headerIndex(headers, ["email", "e-mail", "ηλ"]);
  const iPhone = headerIndex(headers, ["phone", "τηλεφωνο", "τηλ"]);
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const parties = rows.slice(1).map((r) => ({
    name: at(r, iName),
    afm: at(r, iAfm),
    doy: at(r, iDoy) || undefined,
    country: at(r, iCountry) || undefined,
    address: at(r, iAddress) || undefined,
    city: at(r, iCity) || undefined,
    email: at(r, iEmail) || undefined,
    phone: at(r, iPhone) || undefined,
  })).filter((p) => p.name);
  if (!parties.length) warnings.push("Δεν βρέθηκαν έγκυρες γραμμές (χρειάζεται τουλάχιστον επωνυμία).");
  return { parties, warnings };
}

// ---------------- Εισαγωγή παραστατικών (έξοδα) ----------------
export interface ImportExpense {
  supplierName: string;
  supplierAfm: string;
  date: string;
  series?: string;
  number?: string;
  description?: string;
  net: number;
  vat: number;
  gross: number;
}
export interface ExpenseImportResult {
  docs: ImportExpense[];
  warnings: string[];
}

/** Ποσό από ελληνική (1.234,56) ή διεθνή (1234.56 / 1,234.56) μορφή. */
export function toNum(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/\s/g, "").replace(/[€%]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    s = parts.length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const VAT_CODE_BY_RATE: Record<number, number> = { 24: 1, 13: 2, 6: 3, 17: 4, 9: 5, 4: 6, 0: 7 };
/** Μετατρέπει συντελεστή (24, «24%», «13,00») ή ήδη κωδικό myDATA (1–8) σε κωδικό κατηγορίας ΦΠΑ. */
export function toVatCategory(v: unknown): number | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  const n = toNum(s);
  const r = Math.round(n);
  if (r in VAT_CODE_BY_RATE) return VAT_CODE_BY_RATE[r];
  if (r >= 1 && r <= 8 && !s.includes("%")) return r;
  return undefined;
}

/** Διαβάζει αρχείο (CSV ή JSON) και επιστρέφει έξοδα/παραστατικά προς εισαγωγή. */
export function parseExpenseImport(_provider: BridgeProviderId, text: string): ExpenseImportResult {
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      const raw = (Array.isArray(j) ? j : ((j.expenses as unknown[]) ?? (j.income as unknown[]) ?? [])) as Record<string, unknown>[];
      const docs = raw.map((o) => ({
        supplierName: String(o.party ?? o.supplierName ?? o.NAME ?? ""),
        supplierAfm: String(o.afm ?? o.supplierAfm ?? ""),
        date: String(o.date ?? o.issueDate ?? ""),
        series: o.series ? String(o.series) : undefined,
        number: o.number != null ? String(o.number) : undefined,
        description: o.description ? String(o.description) : undefined,
        net: toNum(o.net ?? o.netValue),
        vat: toNum(o.vat ?? o.vatAmount),
        gross: toNum(o.gross ?? o.grossValue),
      })).filter((d) => d.supplierName || d.gross);
      if (!docs.length) warnings.push("Δεν βρέθηκαν παραστατικά στο JSON.");
      return { docs, warnings };
    } catch {
      warnings.push("Μη έγκυρο JSON.");
      return { docs: [], warnings };
    }
  }
  const rows = parseCsvText(text);
  if (rows.length < 2) { warnings.push("Το CSV δεν περιέχει γραμμές δεδομένων."); return { docs: [], warnings }; }
  const h = rows[0];
  const iName = headerIndex(h, ["party", "supplier", "προμηθευτης", "επωνυμια", "name"]);
  const iAfm = headerIndex(h, ["afm", "αφμ", "vat"]);
  const iDate = headerIndex(h, ["date", "ημερομηνια", "issuedate"]);
  const iSeries = headerIndex(h, ["series", "σειρα"]);
  const iNumber = headerIndex(h, ["number", "αριθμος", "no"]);
  const iDesc = headerIndex(h, ["description", "περιγραφη", "αιτιολογια"]);
  const iNet = headerIndex(h, ["net", "καθαρη", "καθαρο", "netvalue"]);
  const iVat = headerIndex(h, ["vat", "φπα", "vatamount"]);
  const iGross = headerIndex(h, ["gross", "συνολο", "grossvalue", "total"]);
  if (iDate < 0 || iGross < 0) { warnings.push("Χρειάζονται τουλάχιστον στήλες ημερομηνίας και συνόλου."); return { docs: [], warnings }; }
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const docs = rows.slice(1).map((r) => ({
    supplierName: at(r, iName),
    supplierAfm: at(r, iAfm),
    date: at(r, iDate),
    series: at(r, iSeries) || undefined,
    number: at(r, iNumber) || undefined,
    description: at(r, iDesc) || undefined,
    net: toNum(at(r, iNet)),
    vat: toNum(at(r, iVat)),
    gross: toNum(at(r, iGross)),
  })).filter((d) => d.date && (d.supplierName || d.gross));
  if (!docs.length) warnings.push("Δεν βρέθηκαν έγκυρα παραστατικά.");
  return { docs, warnings };
}

// ---------------- Εισαγωγή ειδών/υπηρεσιών ----------------
export interface ImportProduct {
  name: string;
  kind: "product" | "service";
  unitPrice: number;
  vatCategory?: number;
  barcode?: string;
  category?: string;
}
export interface ProductImportResult {
  products: ImportProduct[];
  warnings: string[];
}
function normKind(v: unknown): "product" | "service" {
  const s = norm(String(v ?? ""));
  return /product|εμπορευμα|προιον|ειδος/.test(s) ? "product" : "service";
}
export function parseProductImport(_provider: BridgeProviderId, text: string): ProductImportResult {
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      const raw = (Array.isArray(j) ? j : ((j.products as unknown[]) ?? (j.items as unknown[]) ?? [])) as Record<string, unknown>[];
      const products = raw.map((o) => ({
        name: String(o.name ?? o.NAME ?? o.description ?? ""),
        kind: normKind(o.kind ?? o.type),
        unitPrice: toNum(o.unitPrice ?? o.price ?? o.PRICE),
        vatCategory: toVatCategory(o.vatCategory ?? o.vat ?? o.vatRate),
        barcode: o.barcode ? String(o.barcode) : undefined,
        category: o.category ? String(o.category) : undefined,
      })).filter((p) => p.name);
      if (!products.length) warnings.push("Δεν βρέθηκαν είδη στο JSON.");
      return { products, warnings };
    } catch {
      warnings.push("Μη έγκυρο JSON.");
      return { products: [], warnings };
    }
  }
  const rows = parseCsvText(text);
  if (rows.length < 2) { warnings.push("Το CSV δεν περιέχει γραμμές δεδομένων."); return { products: [], warnings }; }
  const h = rows[0];
  let iName = headerIndex(h, ["title", "τιτλος", "name", "ονομα", "ειδος"]);
  if (iName < 0) iName = headerIndex(h, ["description", "περιγραφη"]);
  const iPrice = headerIndex(h, ["τιμη πωλησης", "price", "τιμη", "unitprice", "τιμημοναδας"]);
  const iKind = headerIndex(h, ["kind", "type", "μοναδα μετρησης - τιτλος", "μοναδα μετρησης - συμβολο"]);
  const iVat = headerIndex(h, ["vat", "φπα", "vatcategory"]);
  const iBarcode = headerIndex(h, ["κωδικος προιοντος", "barcode", "κωδικος", "sku", "code"]);
  const iCat = headerIndex(h, ["κατηγορια εσοδων", "category", "κατηγορια"]);
  if (iName < 0) { warnings.push("Δεν εντοπίστηκε στήλη ονόματος/περιγραφής."); return { products: [], warnings }; }
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const products = rows.slice(1).map((r) => ({
    name: at(r, iName),
    kind: normKind(at(r, iKind)),
    unitPrice: toNum(at(r, iPrice)),
    vatCategory: toVatCategory(at(r, iVat)),
    barcode: at(r, iBarcode) || undefined,
    category: at(r, iCat) || undefined,
  })).filter((p) => p.name);
  if (!products.length) warnings.push("Δεν βρέθηκαν έγκυρα είδη.");
  return { products, warnings };
}

// ---------------- Ρύθμιση ζωντανής σύνδεσης (αποθηκευμένα credentials) ----------------
export interface BridgeConfig {
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
export interface MaskedBridgeConfig {
  enabled: boolean;
  provider: BridgeProviderId;
  baseUrl: string;
  appId: string;
  username: string;
  company: string;
  branch: string;
  module: string;
  hasPassword: boolean;
  hasApiKey: boolean;
}
export function parseBridgeConfig(json?: string | null): BridgeConfig {
  let d: Record<string, unknown> = {};
  try { d = json ? JSON.parse(json) : {}; } catch { d = {}; }
  const prov = (["simulation", "generic", "softone", "epsilon", "elorus"] as const).includes(d.provider as BridgeProviderId) ? (d.provider as BridgeProviderId) : "generic";
  return {
    enabled: !!d.enabled,
    provider: prov,
    baseUrl: String(d.baseUrl ?? ""),
    appId: String(d.appId ?? ""),
    username: String(d.username ?? ""),
    password: String(d.password ?? ""),
    apiKey: String(d.apiKey ?? ""),
    company: String(d.company ?? ""),
    branch: String(d.branch ?? ""),
    module: String(d.module ?? ""),
  };
}
export function maskBridgeConfig(c: BridgeConfig): MaskedBridgeConfig {
  return { enabled: c.enabled, provider: c.provider, baseUrl: c.baseUrl, appId: c.appId, username: c.username, company: c.company, branch: c.branch, module: c.module, hasPassword: !!c.password, hasApiKey: !!c.apiKey };
}
