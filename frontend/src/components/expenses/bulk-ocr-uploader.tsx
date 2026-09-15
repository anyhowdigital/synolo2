"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileUp, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { extractExpense } from "@/app/actions/ocr";
import { checkOcrDuplicatesAction, commitOcrExpensesAction, type OcrDraftRow } from "@/app/actions/ocr-bulk";
import { officeCheckOcrDuplicatesAction, officeCommitOcrAction } from "@/app/actions/office-tools";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatMoney, round2 } from "@/lib/invoice/totals";

type Status = "queued" | "working" | "done" | "error";

type Row = OcrDraftRow & { status: Status; error?: string; duplicate?: string; selected: boolean; expenseKind?: string };

const MAX_FILES = 30;

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function BulkOcrUploader({ orgId }: { orgId?: string } = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [pending, start] = useTransition();

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FILES);
    if (!files.length) return;
    if ((e.target.files?.length ?? 0) > MAX_FILES) toast.warning(`Επιλέχθηκαν τα πρώτα ${MAX_FILES} αρχεία.`);
    const oversize = files.filter((f) => f.size > 8 * 1024 * 1024);
    if (oversize.length) toast.warning(`${oversize.length} αρχεία >8MB παραλείφθηκαν.`);
    const usable = files.filter((f) => f.size <= 8 * 1024 * 1024);

    const fresh: Row[] = [];
    for (const f of usable) {
      fresh.push({
        key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: f.name,
        mimeType: f.type || "image/jpeg",
        fileDataUrl: await readAsDataUrl(f),
        supplierName: "",
        supplierAfm: "",
        invoiceType: "1.1",
        series: "",
        number: "",
        issueDate: "",
        description: "",
        netValue: 0,
        vatAmount: 0,
        grossValue: 0,
        vatCategory: 1,
        classificationCategory: "",
        classificationType: "",
        confidence: 0,
        status: "queued",
        selected: false,
      });
    }
    setRows((rs) => [...rs, ...fresh]);
    if (inputRef.current) inputRef.current.value = "";
    void processQueue(fresh);
  }

  async function processQueue(queue: Row[]) {
    setRunning(true);
    const CONCURRENCY = 3;
    const extracted: Row[] = [];
    let index = 0;
    const worker = async () => {
      while (index < queue.length) {
        const row = queue[index++];
        update(row.key, { status: "working" });
        const res = await extractExpense({ fileDataUrl: row.fileDataUrl, fileName: row.fileName });
        if (!res.ok) {
          update(row.key, { status: "error", error: res.error });
          continue;
        }
        const x = res.extracted;
        const patch = {
          status: "done" as Status,
          selected: true,
          supplierName: x.supplier_name ?? "",
          supplierAfm: (x.supplier_afm ?? "").replace(/\D/g, ""),
          invoiceType: x.invoice_type || "1.1",
          series: x.series ?? "",
          number: x.number ?? "",
          issueDate: x.issue_date ?? "",
          description: x.description ?? "",
          netValue: round2(Number(x.net_value) || 0),
          vatAmount: round2(Number(x.vat_amount) || 0),
          grossValue: round2(Number(x.gross_value) || 0),
          vatCategory: Number(x.vat_category) || 1,
          classificationCategory: x.classification_category ?? "",
          classificationType: x.classification_type ?? "",
          expenseKind: x.expense_kind ?? "",
          confidence: Math.round((Number(x.confidence) || 0) * 100),
        };
        extracted.push({ ...row, ...patch });
        update(row.key, patch);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
    if (extracted.length) {
      const dupRows = extracted.map((r) => ({ key: r.key, supplierAfm: r.supplierAfm, number: r.number, grossValue: r.grossValue, issueDate: r.issueDate, supplierName: r.supplierName }));
      const res = orgId ? await officeCheckOcrDuplicatesAction(orgId, dupRows) : await checkOcrDuplicatesAction(dupRows);
      if (res.ok) setRows((cur) => cur.map((r) => (res.duplicates[r.key] ? { ...r, duplicate: res.duplicates[r.key], selected: false } : r)));
    }
    toast.success("Η ανάγνωση ολοκληρώθηκε. Ελέγξτε και καταχωρήστε.");
  }

  const doneRows = rows.filter((r) => r.status === "done");
  const selected = doneRows.filter((r) => r.selected);
  const totalGross = round2(selected.reduce((s, r) => s + r.grossValue, 0));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" /> Μαζικό OCR αποδείξεων
          </CardTitle>
          <CardDescription>
            Ανεβάστε έως {MAX_FILES} φωτογραφίες ή PDF μαζί. Το AI διαβάζει προμηθευτή, ΑΦΜ, αριθμό, ημερομηνία, ΦΠΑ και προτείνει χαρακτηρισμό myDATA. Καταχωρούνται ως <strong>προσχέδια</strong> για τον έλεγχό σας.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={onFiles} data-testid="bulk-ocr-input" />
          <Button onClick={() => inputRef.current?.click()} disabled={running} data-testid="bulk-ocr-pick">
            {running ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FileUp data-icon="inline-start" />}
            Επιλογή αρχείων
          </Button>
          {rows.length ? (
            <>
              <span className="text-sm text-muted-foreground" data-testid="bulk-ocr-progress">
                {doneRows.length}/{rows.length} αναγνώστηκαν · {rows.filter((r) => r.status === "error").length} σφάλματα
              </span>
              <Button variant="ghost" onClick={() => setRows([])} disabled={running} data-testid="bulk-ocr-clear">
                <Trash2 data-icon="inline-start" /> Καθαρισμός
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      {rows.length ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Έλεγχος & διόρθωση</CardTitle>
              <CardDescription>
                {selected.length} επιλεγμένες · σύνολο {formatMoney(totalGross)}
              </CardDescription>
            </div>
            <Button
              disabled={pending || running || selected.length === 0}
              data-testid="bulk-ocr-commit"
              onClick={() =>
                start(async () => {
                  const payload: OcrDraftRow[] = selected.map(({ status, error, duplicate, selected: _s, expenseKind, ...r }) => r);
                  let created = 0;
                  let suppliersCreated = 0;
                  let skipped = 0;
                  for (let i = 0; i < payload.length; i += 3) {
                    const chunk = payload.slice(i, i + 3);
                    const res = orgId ? await officeCommitOcrAction(orgId, chunk) : await commitOcrExpensesAction(chunk);
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    created += res.created;
                    suppliersCreated += res.suppliersCreated;
                    skipped += res.skipped;
                  }
                  toast.success(`${created} έξοδα καταχωρήθηκαν ως προσχέδια${suppliersCreated ? ` · ${suppliersCreated} νέοι προμηθευτές` : ""}${skipped ? ` · ${skipped} παραλείφθηκαν` : ""}.`);
                  setRows((rs) => rs.filter((r) => !r.selected));
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              Καταχώρηση επιλεγμένων ({selected.length})
            </Button>
          </CardHeader>
          <CardContent className="space-y-3" data-testid="bulk-ocr-rows">
            {rows.map((r) => (
              <div key={r.key} className="rounded-lg border p-3" data-testid={`ocr-row-${r.key}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "done" ? <Checkbox checked={r.selected} onCheckedChange={(v) => update(r.key, { selected: !!v })} data-testid={`ocr-select-${r.key}`} /> : null}
                  <span className="truncate text-sm font-medium">{r.fileName}</span>
                  {r.status === "queued" ? <Badge variant="outline">σε αναμονή</Badge> : null}
                  {r.status === "working" ? (
                    <Badge variant="secondary">
                      <Loader2 className="mr-1 size-3 animate-spin" /> ανάγνωση…
                    </Badge>
                  ) : null}
                  {r.status === "error" ? <Badge variant="destructive">σφάλμα</Badge> : null}
                  {r.status === "done" ? <Badge variant={r.confidence >= 70 ? "secondary" : "outline"}>βεβαιότητα {r.confidence}%</Badge> : null}
                  {r.expenseKind ? <Badge variant="outline">{r.expenseKind}</Badge> : null}
                </div>
                {r.error ? <p className="mt-2 text-xs text-destructive">{r.error}</p> : null}
                {r.duplicate ? (
                  <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="size-3" /> Πιθανή διπλοεγγραφή — {r.duplicate}
                  </p>
                ) : null}
                {r.status === "done" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Input value={r.supplierName} onChange={(e) => update(r.key, { supplierName: e.target.value })} placeholder="Προμηθευτής" data-testid={`ocr-supplier-${r.key}`} />
                    <Input value={r.supplierAfm} onChange={(e) => update(r.key, { supplierAfm: e.target.value })} placeholder="ΑΦΜ" data-testid={`ocr-afm-${r.key}`} />
                    <Input value={r.number} onChange={(e) => update(r.key, { number: e.target.value })} placeholder="Αριθμός" data-testid={`ocr-number-${r.key}`} />
                    <Input type="date" value={r.issueDate} onChange={(e) => update(r.key, { issueDate: e.target.value })} data-testid={`ocr-date-${r.key}`} />
                    <Input
                      type="number"
                      step="0.01"
                      value={r.netValue}
                      onChange={(e) => update(r.key, { netValue: Number(e.target.value), grossValue: round2(Number(e.target.value) + r.vatAmount) })}
                      placeholder="Καθαρή αξία"
                      data-testid={`ocr-net-${r.key}`}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={r.vatAmount}
                      onChange={(e) => update(r.key, { vatAmount: Number(e.target.value), grossValue: round2(r.netValue + Number(e.target.value)) })}
                      placeholder="ΦΠΑ"
                      data-testid={`ocr-vat-${r.key}`}
                    />
                    <Input type="number" step="0.01" value={r.grossValue} onChange={(e) => update(r.key, { grossValue: Number(e.target.value) })} placeholder="Σύνολο" data-testid={`ocr-gross-${r.key}`} />
                    <Input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="Περιγραφή" data-testid={`ocr-desc-${r.key}`} />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
