"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { importCsvAction, recentImportBatches, undoImportAction, type ImportBatchInfo, type ImportKind } from "@/app/actions/import";
import type { ImportResult } from "@/lib/import/importers";
import { parseCsv } from "@/lib/import/csv";
import { IMPORT_FIELDS, autoMap } from "@/lib/import/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const COPY: Record<ImportKind, { title: string; description: string; columns: string; template: string }> = {
  customers: {
    title: "Εισαγωγή πελατών από CSV",
    description: "Ανεβάστε εξαγωγή από Excel ή άλλο πρόγραμμα. Οι στήλες αναγνωρίζονται αυτόματα από τον τίτλο τους (ελληνικά ή αγγλικά).",
    columns: "Επωνυμία (υποχρεωτική), ΑΦΜ, ΔΟΥ, Δραστηριότητα, Διεύθυνση, Πόλη, ΤΚ, Χώρα, Email, Τηλέφωνο, Υπεύθυνος, Όροι πληρωμής, Τύπος (company/individual)",
    template: "/api/import/template?type=customers",
  },
  products: {
    title: "Εισαγωγή ειδών από CSV",
    description: "Ανεβάστε τον τιμοκατάλογο ή την αποθήκη σας. Ο ΦΠΑ δίνεται ως ποσοστό (24, 13, 6, 0) και μετατρέπεται σε κατηγορία myDATA.",
    columns: "Περιγραφή (υποχρεωτική), Κωδικός/SKU, Τιμή, Κόστος, ΦΠΑ %, Τύπος (product/service), Μονάδα, Απόθεμα, Όριο επαναπαραγγελίας",
    template: "/api/import/template?type=products",
  },
  invoices: {
    title: "Εισαγωγή παραστατικών από CSV",
    description: "Μία γραμμή ανά είδος. Οι γραμμές με το ίδιο «Παραστατικό» ενώνονται σε ένα τιμολόγιο. Η σειρά αναγνωρίζεται από τον κωδικό της (π.χ. ΤΠΥ).",
    columns: "Παραστατικό (ομαδοποίηση), Σειρά, Ημερομηνία, Λήξη, Πελάτης, ΑΦΜ, Τρόπος πληρωμής, Περιγραφή (υποχρεωτική), Ποσότητα, Τιμή (υποχρεωτική), Έκπτωση %, ΦΠΑ %, Κωδικός είδους, Σημειώσεις",
    template: "/api/import/template?type=invoices",
  },
  expenses: {
    title: "Εισαγωγή εξόδων/αγορών από CSV",
    description: "Μία γραμμή ανά τιμολόγιο αγοράς. Οι διπλοεγγραφές εντοπίζονται από το ΜΑΡΚ ή τον συνδυασμό ΑΦΜ + σειρά + αριθμός.",
    columns: "Προμηθευτής (υποχρεωτικός), ΑΦΜ, Ημερομηνία (υποχρεωτική), Σειρά, Αριθμός, Περιγραφή, Καθαρή αξία (υποχρεωτική), ΦΠΑ %, Ποσό ΦΠΑ, Παρακράτηση, Λήξη, ΜΑΡΚ, Χώρα, Τύπος",
    template: "/api/import/template?type=expenses",
  },
  suppliers: {
    title: "Εισαγωγή προμηθευτών από CSV",
    description: "Ανεβάστε το αρχείο προμηθευτών σας. Η ταύτιση γίνεται με ΑΦΜ ή επωνυμία.",
    columns: "Επωνυμία (υποχρεωτική), ΑΦΜ, ΔΟΥ, Χώρα, Διεύθυνση, Πόλη, ΤΚ, Email, Τηλέφωνο, Υπεύθυνος, IBAN, Τράπεζα, Ημέρες πίστωσης, Σημειώσεις",
    template: "/api/import/template?type=suppliers",
  },
  payments: {
    title: "Εισαγωγή πληρωμών από CSV",
    description: "Εισπράξεις πελατών και εξοφλήσεις προμηθευτών. Δένονται αυτόματα με το παραστατικό από σειρά+αριθμό, αλλιώς με ΑΦΜ/επωνυμία στο παλαιότερο ανοιχτό υπόλοιπο.",
    columns: "Τύπος (Είσπραξη/Εξόφληση), Ημερομηνία (υποχρεωτική), Παραστατικό, Σειρά, ΑΦΜ, Επωνυμία, Ποσό (υποχρεωτικό), Τρόπος πληρωμής, Λογαριασμός ταμείου/τράπεζας, Αιτιολογία",
    template: "/api/import/template?type=payments",
  },
};

interface Preview {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function ImportDialog({ kind, variant = "outline", seriesOptions = [] }: { kind: ImportKind; variant?: "outline" | "ghost" | "default"; seriesOptions?: { code: string; label: string }[] }) {
  const copy = COPY[kind];
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [issue, setIssue] = useState(false);
  const [defaultSeriesCode, setDefaultSeriesCode] = useState(seriesOptions[0]?.code ?? "");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batches, setBatches] = useState<ImportBatchInfo[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [wideFormat, setWideFormat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fields = IMPORT_FIELDS[kind] ?? [];

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setBatchId(null);
    setMapping({});
    setShowMapping(false);
    setError(null);
  };

  const onFile = async (f: File | null) => {
    reset();
    if (!f) return;
    setFile(f);
    try {
      const text = await f.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("Το αρχείο δεν περιέχει γραμμές δεδομένων. Χρειάζεται μία γραμμή τίτλων και τουλάχιστον μία εγγραφή.");
        return;
      }
      setPreview(parsed);
      const wide = kind === "invoices" && parsed.headers.some((h) => /^Γραμμή\s*1\s*-\s*Τίτλος$/i.test(h.trim()));
      setWideFormat(wide);
      const auto = autoMap(parsed.headers, fields);
      setMapping(auto);
      const missingRequired = fields.filter((f) => f.required && !auto[f.key]);
      setShowMapping(!wide && missingRequired.length > 0);
    } catch {
      setError("Δεν ήταν δυνατή η ανάγνωση του αρχείου.");
    }
  };

  const submit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("updateExisting", updateExisting ? "true" : "false");
    fd.set("issue", issue ? "true" : "false");
    fd.set("defaultSeriesCode", defaultSeriesCode);
    if (showMapping) fd.set("mapping", JSON.stringify(mapping));
    start(async () => {
      const res = await importCsvAction(kind, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.result);
      setBatchId(res.batchId);
      if (res.result.created + res.result.updated > 0) toast.success(`Εισαγωγή: ${res.result.created} νέα, ${res.result.updated} ενημερώσεις.`);
      else toast.warning("Δεν εισήχθη καμία εγγραφή.");
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
        else recentImportBatches(kind).then(setBatches);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} data-testid={`import-open-${kind}`}>
          <Upload data-icon="inline-start" /> Εισαγωγή CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {result ? (
          <ImportSummary result={result} batchId={batchId} onClose={() => setOpen(false)} onAgain={reset} />
        ) : (
          <div className="min-w-0 space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Αναγνωριζόμενες στήλες</div>
              {copy.columns}
              <div className="mt-2">
                <a href={copy.template} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline" download>
                  <Download className="size-3.5" /> Κατεβάστε το πρότυπο CSV
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`import-file-${kind}`}>Αρχείο CSV (UTF-8 ή Windows-1253, έως 2 MB)</Label>
              <Input id={`import-file-${kind}`} type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0] ?? null)} data-testid={`import-file-${kind}`} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor={`import-update-${kind}`} className="text-sm">
                  {kind === "invoices" ? "Δημιουργία πελατών που δεν υπάρχουν" : kind === "payments" ? "Αυτόματη αντιστοίχιση με παραστατικά" : "Ενημέρωση υπαρχόντων"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {kind === "customers"
                    ? "Ταύτιση με ΑΦΜ ή επωνυμία. Απενεργοποιήστε για να παραλείπονται."
                    : kind === "products"
                      ? "Ταύτιση με κωδικό (SKU) ή περιγραφή. Απενεργοποιήστε για να παραλείπονται."
                      : kind === "invoices"
                        ? "Οι πελάτες αναγνωρίζονται από ΑΦΜ ή επωνυμία. Αν απενεργοποιηθεί, οι γραμμές με άγνωστο πελάτη απορρίπτονται."
                        : kind === "expenses"
                          ? "Ταύτιση με ΜΑΡΚ ή ΑΦΜ + σειρά + αριθμό. Απενεργοποιήστε για να παραλείπονται."
                          : kind === "payments"
                            ? "Κάθε πληρωμή δένεται με σειρά+αριθμό παραστατικού, αλλιώς με ΑΦΜ/επωνυμία στο παλαιότερο ανοιχτό υπόλοιπο."
                            : "Ταύτιση με ΑΦΜ ή επωνυμία. Απενεργοποιήστε για να παραλείπονται."}
                </p>
              </div>
              <Switch id={`import-update-${kind}`} checked={updateExisting} onCheckedChange={setUpdateExisting} data-testid={`import-update-${kind}`} />
            </div>

            {kind === "invoices" ? (
              <>
                {seriesOptions.length > 0 ? (
                  <div className="space-y-2">
                    <Label htmlFor="import-series">Προεπιλεγμένη σειρά (όταν λείπει η στήλη «Σειρά»)</Label>
                    <select
                      id="import-series"
                      value={defaultSeriesCode}
                      onChange={(e) => setDefaultSeriesCode(e.target.value)}
                      className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                      data-testid="import-series-select"
                    >
                      {seriesOptions.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label htmlFor="import-issue" className="text-sm">
                      Οριστική έκδοση
                    </Label>
                    <p className="text-xs text-muted-foreground">Απόδοση αριθμού από τη σειρά. Απενεργοποιημένο, τα παραστατικά μένουν πρόχειρα για έλεγχο πριν τη διαβίβαση.</p>
                  </div>
                  <Switch id="import-issue" checked={issue} onCheckedChange={setIssue} data-testid="import-issue-switch" />
                </div>
              </>
            ) : null}

            {preview && wideFormat ? (
              <Alert>
                <FileSpreadsheet />
                <AlertDescription>
                  Αναγνωρίστηκε εξαγωγή τύπου Elorus (μία γραμμή ανά παραστατικό με στήλες «Γραμμή N»). Οι γραμμές των ειδών, ο ΦΠΑ και η σειρά υπολογίζονται αυτόματα – δεν χρειάζεται αντιστοίχιση στηλών.
                </AlertDescription>
              </Alert>
            ) : null}

            {preview && !wideFormat ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm">Αντιστοίχιση στηλών</Label>
                    <p className="text-xs text-muted-foreground">
                      {showMapping ? "Διαλέξτε ποια στήλη του αρχείου αντιστοιχεί σε κάθε πεδίο." : "Οι στήλες αναγνωρίστηκαν αυτόματα. Ανοίξτε αν θέλετε να τις αλλάξετε."}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowMapping((v) => !v)} data-testid={`import-mapping-toggle-${kind}`}>
                    {showMapping ? "Κλείσιμο" : "Αλλαγή"}
                  </Button>
                </div>
                {showMapping ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fields.map((f) => (
                      <div key={f.key} className="min-w-0 space-y-1">
                        <Label htmlFor={`map-${kind}-${f.key}`} className="text-xs">
                          {f.label}
                          {f.required ? <span className="text-destructive"> *</span> : null}
                        </Label>
                        <select
                          id={`map-${kind}-${f.key}`}
                          value={mapping[f.key] ?? ""}
                          onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-xs"
                          data-testid={`import-map-${f.key}`}
                        >
                          <option value="">— Χωρίς αντιστοίχιση —</option>
                          {preview.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {preview ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="size-4 text-muted-foreground" />
                  <span className="font-medium">{file?.name}</span>
                  <span className="text-muted-foreground">
                    · {preview.rows.length} γραμμές · διαχωριστικό «{preview.delimiter === "\t" ? "tab" : preview.delimiter}»
                  </span>
                </div>
                <div className="max-w-full overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        {preview.headers.map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t">
                          {preview.headers.map((h) => (
                            <td key={h} className="max-w-48 truncate px-2 py-1.5 whitespace-nowrap">
                              {r[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 5 ? <p className="text-xs text-muted-foreground">Προεπισκόπηση των 5 πρώτων γραμμών.</p> : null}
              </div>
            ) : null}

            {!preview && batches.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-sm">Πρόσφατες εισαγωγές</Label>
                {batches.map((b) => (
                  <UndoRow key={b.id} batch={b} onUndone={() => setBatches((prev) => prev.filter((x) => x.id !== b.id))} />
                ))}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Άκυρο
              </Button>
              <Button onClick={submit} disabled={!preview || pending} data-testid={`import-submit-${kind}`}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                Εισαγωγή {preview ? `${preview.rows.length} γραμμών` : ""}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UndoRow({ batch, onUndone }: { batch: ImportBatchInfo; onUndone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="truncate font-medium">{batch.fileName || "εισαγωγή"}</div>
        <div className="text-muted-foreground">
          {batch.created} εγγραφές · {new Date(batch.createdAt).toLocaleString("el-GR")}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        data-testid={`import-undo-${batch.id}`}
        onClick={() =>
          start(async () => {
            const res = await undoImportAction(batch.id);
            if (res.ok) {
              toast.success(`Αναιρέθηκαν ${res.removed} εγγραφές.`);
              onUndone();
            } else toast.error(res.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Undo2 data-icon="inline-start" />}
        Αναίρεση
      </Button>
    </div>
  );
}

function ImportSummary({ result, batchId, onClose, onAgain }: { result: ImportResult; batchId: string | null; onClose: () => void; onAgain: () => void }) {
  const ok = result.errors.length === 0;
  const [undone, setUndone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 rounded-lg border p-3", ok ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40")}>
        {ok ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-5 text-amber-600" />}
        <div className="text-sm">
          <div className="font-medium">{ok ? "Η εισαγωγή ολοκληρώθηκε" : "Η εισαγωγή ολοκληρώθηκε με σφάλματα"}</div>
          <div className="text-muted-foreground">
            {result.total} γραμμές · {result.created} νέες · {result.updated} ενημερώσεις · {result.skipped} παραλείψεις · {result.errors.length} σφάλματα
          </div>
        </div>
      </div>
      {result.errors.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border text-xs">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                <th className="w-16 px-2 py-1.5 text-left font-medium">Γραμμή</th>
                <th className="px-2 py-1.5 text-left font-medium">Σφάλμα</th>
              </tr>
            </thead>
            <tbody>
              {result.errors.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1.5 tabular-nums">{e.row}</td>
                  <td className="px-2 py-1.5">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {batchId && !undone ? (
          <Button
            variant="outline"
            disabled={pending}
            data-testid="import-undo-last"
            onClick={() =>
              start(async () => {
                const res = await undoImportAction(batchId);
                if (res.ok) {
                  toast.success(`Η εισαγωγή αναιρέθηκε – αφαιρέθηκαν ${res.removed} εγγραφές.`);
                  setUndone(true);
                } else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Undo2 data-icon="inline-start" />}
            Αναίρεση εισαγωγής
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onAgain}>
          Νέα εισαγωγή
        </Button>
        <Button onClick={onClose}>Κλείσιμο</Button>
      </div>
    </div>
  );
}
