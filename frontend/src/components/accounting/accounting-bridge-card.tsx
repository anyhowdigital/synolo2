"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Download, Cable, ExternalLink, Upload, Undo2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BRIDGE_PROVIDERS, type BridgeProviderId, type MaskedBridgeConfig } from "@/lib/accounting-bridge";
import { previewImportAction, commitImportAction, saveBridgeConfigAction, pushBridgeAction, bridgeRecentBatchesAction, bridgeUndoImportAction } from "@/app/actions/accounting-bridge";
import type { ImportBatchInfo } from "@/lib/import/engine";

const LIVE = BRIDGE_PROVIDERS.filter((p) => p.kind === "live");
const IMPORT_PROVIDERS = BRIDGE_PROVIDERS.filter((p) => p.id !== "simulation");
const ENTITIES: { key: string; label: string }[] = [
  { key: "customers", label: "Πελάτες" },
  { key: "suppliers", label: "Προμηθευτές" },
  { key: "income", label: "Έσοδα (παραστατικά)" },
  { key: "expenses", label: "Έξοδα (παραστατικά)" },
  { key: "journal", label: "Λογιστικά άρθρα" },
];
const SAMPLE_LABELS: Record<string, string> = { name: "Επωνυμία", afm: "ΑΦΜ", doy: "ΔΟΥ", city: "Πόλη", email: "Email", phone: "Τηλέφωνο", address: "Διεύθυνση", country: "Χώρα", supplierName: "Προμηθευτής", supplierAfm: "ΑΦΜ", date: "Ημερομηνία", series: "Σειρά", number: "Αριθμός", description: "Περιγραφή", net: "Καθαρή", vat: "ΦΠΑ", gross: "Σύνολο", kind: "Είδος", unitPrice: "Τιμή", vatCategory: "Κατ. ΦΠΑ", barcode: "Κωδικός", category: "Κατηγορία" };
const fmtCell = (v: unknown) => (typeof v === "number" ? v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v == null || v === "" ? "—" : String(v));

export function AccountingBridgeCard({ exportBase, orgId, config }: { exportBase: string; orgId?: string; config: MaskedBridgeConfig }) {
  const y = new Date().getFullYear();
  const router = useRouter();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(`${y}-12-31`);
  const [provider, setProvider] = useState<BridgeProviderId>("generic");
  const [selected, setSelected] = useState<string[]>(ENTITIES.map((e) => e.key));
  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const sep = exportBase.includes("?") ? "&" : "?";
  const q = `from=${from}&to=${to}`;
  const entParam = `&entities=${selected.join(",")}`;
  const noneSelected = selected.length === 0;

  // import state
  const [impProvider, setImpProvider] = useState<BridgeProviderId>("generic");
  const [entity, setEntity] = useState<"customers" | "suppliers" | "expenses">("customers");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<{ count: number; warnings: string[]; sample?: Record<string, unknown>[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<ImportBatchInfo[]>([]);
  const loadBatches = async () => setBatches(await bridgeRecentBatchesAction(orgId));
  useEffect(() => {
    bridgeRecentBatchesAction(orgId).then((b) => setBatches(b));
  }, [orgId]);
  const undo = async (id: string) => {
    const res = await bridgeUndoImportAction({ orgId, batchId: id });
    if (res.ok) { toast.success(`Αναιρέθηκαν ${res.removed} εγγραφές.`); await loadBatches(); router.refresh(); } else toast.error(res.error);
  };

  // live connection config
  const [cfg, setCfg] = useState({ enabled: config.enabled, provider: config.provider, baseUrl: config.baseUrl, appId: config.appId, username: config.username, company: config.company, branch: config.branch, module: config.module, password: "", apiKey: "" });
  const setC = (k: keyof typeof cfg, v: string | boolean) => setCfg((s) => ({ ...s, [k]: v }));
  const [savingCfg, setSavingCfg] = useState(false);
  const [pushing, setPushing] = useState(false);
  const saveCfg = async () => {
    setSavingCfg(true);
    const res = await saveBridgeConfigAction({ orgId, ...cfg });
    setSavingCfg(false);
    if (res.ok) { toast.success("Η ζωντανή σύνδεση αποθηκεύτηκε."); setCfg((s) => ({ ...s, password: "", apiKey: "" })); router.refresh(); } else toast.error(res.error || "Σφάλμα.");
  };
  const doPush = async () => {
    setPushing(true);
    const res = await pushBridgeAction({ orgId, from, to, entities: selected });
    setPushing(false);
    if (res.ok) toast.success((res.messages ?? []).join(" ") || `Στάλθηκαν ${res.sent?.customers ?? 0} πελάτες / ${res.sent?.suppliers ?? 0} προμηθευτές.`);
    else toast.error([res.error || "Αποτυχία αποστολής.", ...(res.messages ?? [])].join(" "));
  };
  const isSoftone = cfg.provider === "softone";

  const readFile = async (f: File) => {
    setFilename(f.name);
    setContent(await f.text());
    setPreview(null);
  };

  const runPreview = async () => {
    if (!content) return toast.error("Επιλέξτε αρχείο πρώτα.");
    setBusy(true);
    const res = await previewImportAction({ orgId, provider: impProvider, entity, content, filename });
    setBusy(false);
    if (res.ok) {
      setPreview({ count: res.count, warnings: res.warnings, sample: (res.sample ?? []) as unknown as Record<string, unknown>[] });
      if (!res.count) toast.error("Δεν βρέθηκαν εγγραφές. Ελέγξτε τη μορφή/οντότητα.");
    }
  };

  const runImport = async () => {
    setBusy(true);
    const res = await commitImportAction({ orgId, provider: impProvider, entity, content, filename });
    setBusy(false);
    if (res.ok) {
      toast.success(`Εισαγωγή: ${res.inserted} νέες, ${res.updated} ενημερώσεις${res.skipped ? `, ${res.skipped} παραλείψεις` : ""}${res.failed ? `, ${res.failed} σφάλματα` : ""}.`);
      if (res.warnings?.length) toast.warning(res.warnings.slice(0, 3).join(" · "));
      setContent("");
      setFilename("");
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadBatches();
      router.refresh();
    } else {
      toast.error(res.error || "Αποτυχία εισαγωγής.");
    }
  };

  return (
    <div className="space-y-6">
      <Card data-testid="bridge-export-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Download className="size-4 text-primary" /> Εξαγωγή ανά πρόγραμμα</CardTitle>
          <CardDescription>Πελάτες, προμηθευτές, έσοδα, έξοδα και λογιστικά άρθρα για την περίοδο, στη μορφή του προγράμματος που θα επιλέξετε.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="bridge-from">Από</Label>
              <Input id="bridge-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="bridge-from" />
            </div>
            <div>
              <Label htmlFor="bridge-to">Έως</Label>
              <Input id="bridge-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="bridge-to" />
            </div>
            <div>
              <Label htmlFor="bridge-provider">Πρόγραμμα</Label>
              <select id="bridge-provider" value={provider} onChange={(e) => setProvider(e.target.value as BridgeProviderId)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" data-testid="bridge-provider">
                {LIVE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Τι να εξαχθεί</Label>
            <div className="flex flex-wrap gap-3">
              {ENTITIES.map((e) => (
                <label key={e.key} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" data-testid={`export-entity-${e.key}`}>
                  <input type="checkbox" checked={selected.includes(e.key)} onChange={() => toggle(e.key)} className="size-4" />
                  {e.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {noneSelected ? (
              <Button disabled data-testid="bridge-download-program"><Download data-icon="inline-start" /> Επιλέξτε τουλάχιστον μία οντότητα</Button>
            ) : (
              <Button asChild data-testid="bridge-download-program">
                <a href={`${exportBase}${sep}${q}${entParam}&provider=${provider}`} target="_blank" rel="noreferrer"><Download data-icon="inline-start" /> Λήψη αρχείου {provider === "softone" ? "SoftOne (JSON)" : provider === "epsilon" ? "Epsilon (ZIP)" : "(ZIP)"}</a>
              </Button>
            )}
            <Button asChild variant="secondary" data-testid="bridge-download-csv">
              <a href={`${exportBase}${sep}${q}&format=csv`} target="_blank" rel="noreferrer"><Download data-icon="inline-start" /> Ημερολόγιο (CSV)</a>
            </Button>
            <Button asChild variant="secondary" data-testid="bridge-download-json">
              <a href={`${exportBase}${sep}${q}&format=json`} target="_blank" rel="noreferrer"><Download data-icon="inline-start" /> Πλήρες (JSON)</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="bridge-import-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Upload className="size-4 text-primary" /> Εισαγωγή δεδομένων</CardTitle>
          <CardDescription>Ανεβάστε αρχείο (CSV ή JSON) από το λογιστικό σας πρόγραμμα για να εισαγάγετε πελάτες, προμηθευτές ή έξοδα/παραστατικά. Πελάτες/προμηθευτές αντιστοιχίζονται με ΑΦΜ· τα έξοδα προστίθενται ως νέα (κατάσταση «σε εκκρεμότητα»).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="imp-provider">Πρόγραμμα προέλευσης</Label>
              <select id="imp-provider" value={impProvider} onChange={(e) => setImpProvider(e.target.value as BridgeProviderId)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" data-testid="import-provider">
                {IMPORT_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="imp-entity">Οντότητα</Label>
              <select id="imp-entity" value={entity} onChange={(e) => { setEntity(e.target.value as "customers" | "suppliers" | "expenses"); setPreview(null); }} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" data-testid="import-entity">
                <option value="customers">Πελάτες</option>
                <option value="suppliers">Προμηθευτές</option>
                <option value="expenses">Έξοδα / Παραστατικά</option>
                <option value="products">Είδη / Υπηρεσίες</option>
              </select>
            </div>
            <div>
              <Label htmlFor="imp-file">Αρχείο (.csv / .json)</Label>
              <Input id="imp-file" ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} data-testid="import-file" />
            </div>
          </div>
          {preview ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="import-preview">
              Βρέθηκαν <strong>{preview.count}</strong> εγγραφές έτοιμες προς εισαγωγή.
              {preview.warnings.length ? <ul className="mt-1 list-disc pl-5 text-xs text-amber-600">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
              {preview.sample?.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs" data-testid="import-preview-sample">
                    <thead><tr className="text-left text-muted-foreground">{Object.keys(preview.sample[0]).map((k) => <th key={k} className="pr-3 font-medium">{SAMPLE_LABELS[k] ?? k}</th>)}</tr></thead>
                    <tbody>{preview.sample.map((row, i) => <tr key={i} className="border-t">{Object.keys(preview.sample![0]).map((k) => <td key={k} className="pr-3 py-1">{fmtCell(row[k])}</td>)}</tr>)}</tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-muted-foreground">Δείγμα έως 5 γραμμών — ελέγξτε ποσά και αντιστοίχιση πριν την εισαγωγή.</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={runPreview} disabled={busy || !content} data-testid="import-preview-btn">Προεπισκόπηση</Button>
            <Button onClick={runImport} disabled={busy || !preview || !preview.count} data-testid="import-commit-btn"><Upload data-icon="inline-start" /> Εισαγωγή</Button>
          </div>
          {batches.length ? (
            <div className="rounded-lg border p-3" data-testid="bridge-recent-imports">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Πρόσφατες εισαγωγές (κοινή μηχανή με την «Εισαγωγή CSV» — μπορούν να αναιρεθούν)</div>
              <ul className="space-y-1">
                {batches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid={`bridge-batch-${b.id}`}>
                    <span className="min-w-0 truncate">{b.fileName} · {b.kind} · {b.created} νέες · {new Date(b.createdAt).toLocaleString("el-GR")}</span>
                    <Button size="sm" variant="ghost" onClick={() => undo(b.id)} data-testid={`bridge-undo-${b.id}`}><Undo2 data-icon="inline-start" /> Αναίρεση</Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card data-testid="bridge-credentials-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Cable className="size-4 text-primary" /> Ζωντανή σύνδεση (credentials)</CardTitle>
          <CardDescription>Αποθηκεύστε τα διαπιστευτήρια του παρόχου για αποστολή με ένα κλικ. Τα μυστικά δεν εμφανίζονται ποτέ ξανά στην οθόνη· αφήστε κενό για διατήρηση του υπάρχοντος.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cfg-provider">Πάροχος</Label>
              <select id="cfg-provider" value={cfg.provider} onChange={(e) => setC("provider", e.target.value as BridgeProviderId)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" data-testid="cfg-provider">
                {LIVE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cfg-baseurl">Base URL</Label>
              <Input id="cfg-baseurl" value={cfg.baseUrl} onChange={(e) => setC("baseUrl", e.target.value)} placeholder={isSoftone ? "https://<name>.oncloud.gr/s1services" : "https://…"} data-testid="cfg-baseurl" />
            </div>
            {isSoftone ? (
              <>
                <div><Label htmlFor="cfg-appid">AppId</Label><Input id="cfg-appid" value={cfg.appId} onChange={(e) => setC("appId", e.target.value)} data-testid="cfg-appid" /></div>
                <div><Label htmlFor="cfg-username">Username</Label><Input id="cfg-username" value={cfg.username} onChange={(e) => setC("username", e.target.value)} data-testid="cfg-username" /></div>
                <div><Label htmlFor="cfg-password">Password</Label><Input id="cfg-password" type="password" value={cfg.password} onChange={(e) => setC("password", e.target.value)} placeholder={config.hasPassword ? "•••••••• (κενό = διατήρηση)" : ""} data-testid="cfg-password" /></div>
                <div><Label htmlFor="cfg-company">Company</Label><Input id="cfg-company" value={cfg.company} onChange={(e) => setC("company", e.target.value)} data-testid="cfg-company" /></div>
                <div><Label htmlFor="cfg-branch">Branch</Label><Input id="cfg-branch" value={cfg.branch} onChange={(e) => setC("branch", e.target.value)} data-testid="cfg-branch" /></div>
                <div><Label htmlFor="cfg-module">Module</Label><Input id="cfg-module" value={cfg.module} onChange={(e) => setC("module", e.target.value)} data-testid="cfg-module" /></div>
              </>
            ) : (
              <div><Label htmlFor="cfg-apikey">API key</Label><Input id="cfg-apikey" type="password" value={cfg.apiKey} onChange={(e) => setC("apiKey", e.target.value)} placeholder={config.hasApiKey ? "•••••••• (κενό = διατήρηση)" : "X-API-Key"} data-testid="cfg-apikey" /></div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm" data-testid="cfg-enabled">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setC("enabled", e.target.checked)} className="size-4" />
            Ενεργοποίηση ζωντανής αποστολής
          </label>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={saveCfg} disabled={savingCfg} data-testid="cfg-save-btn">{savingCfg ? "Αποθήκευση…" : "Αποθήκευση σύνδεσης"}</Button>
            <Button onClick={doPush} disabled={pushing || !cfg.enabled} data-testid="cfg-push-btn"><Cable data-icon="inline-start" /> {pushing ? "Αποστολή…" : "Αποστολή ζωντανά"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="bridge-providers-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Cable className="size-4 text-primary" /> Υποστηριζόμενα προγράμματα</CardTitle>
          <CardDescription>Κατάσταση ανά πρόγραμμα: «Αρχείο» = έτοιμη μορφή εξαγωγής/εισαγωγής· «API (χρειάζεται credentials)» = ζωντανή αποστολή μόνο μετά την αποθήκευση διαπιστευτηρίων παραπάνω· «Μόνο εισαγωγή» = χωρίς API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {IMPORT_PROVIDERS.map((p) => (
            <div key={p.id} className="rounded-lg border p-3" data-testid={`bridge-provider-${p.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{p.label}</div>
                <Badge variant={p.kind === "live" ? (config.enabled && config.provider === p.id ? "default" : "outline") : "secondary"} data-testid={`bridge-provider-status-${p.id}`}>
                  {p.id === "elorus" ? "Μόνο εισαγωγή" : p.kind === "live" ? (config.enabled && config.provider === p.id ? "API ρυθμισμένο" : "Αρχείο · API χρειάζεται credentials") : "Αρχείο"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.help}</p>
              {p.docsUrl ? <a href={p.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"><ExternalLink className="size-3" /> Τεκμηρίωση παρόχου</a> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
