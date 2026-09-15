"use client";

import { useMemo, useState, useTransition } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { importStatementAction } from "@/app/actions/banking";
import { parseStatement, type ColumnMapping } from "@/lib/banking/statement-parser";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: "date", label: "Ημερομηνία *" },
  { key: "amount", label: "Ποσό (με πρόσημο)" },
  { key: "debit", label: "Χρέωση" },
  { key: "credit", label: "Πίστωση" },
  { key: "description", label: "Περιγραφή" },
  { key: "counterparty", label: "Αντισυμβαλλόμενος" },
  { key: "reference", label: "Αναφορά" },
  { key: "balance", label: "Υπόλοιπο" },
];

/** Εισαγωγή extrait από CSV/TSV (αρχείο ή επικόλληση) με αυτόματη ανίχνευση στηλών και προεπισκόπηση. */
export function ImportStatementDialog({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [override, setOverride] = useState<Partial<ColumnMapping>>({});
  const [fileName, setFileName] = useState("");
  const [pending, start] = useTransition();

  const parsed = useMemo(() => (text.trim() ? parseStatement(text, override) : null), [text, override]);
  const rows = parsed?.rows ?? [];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    let decoded = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    // Αρχεία ελληνικών τραπεζών συχνά είναι σε windows-1253.
    if (decoded.includes("\uFFFD")) {
      try {
        decoded = new TextDecoder("windows-1253").decode(buf);
      } catch {
        /* κρατάμε την utf-8 έκδοση */
      }
    }
    setText(decoded);
    setOverride({});
  };

  const submit = () =>
    start(async () => {
      const res = await importStatementAction(accountId, rows);
      if (res.ok) {
        toast.success(`Η εισαγωγή ολοκληρώθηκε. ${res.warning ?? ""}`.trim());
        setOpen(false);
        setText("");
        setFileName("");
        setOverride({});
      } else toast.error(res.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload data-icon="inline-start" /> Εισαγωγή extrait
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Εισαγωγή extrait – {accountName}</DialogTitle>
          <DialogDescription>
            Ανεβάστε το CSV που εξάγει το e-banking σας (Eurobank, Alpha, Πειραιώς, Εθνική, Revolut, Viva κ.ά.) ή επικολλήστε τις γραμμές. Οι στήλες αναγνωρίζονται αυτόματα · οι ήδη εισηγμένες
            κινήσεις παραλείπονται.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="stmt-file" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
              <FileUp className="size-4" /> Επιλογή αρχείου CSV/TXT
            </Label>
            <input id="stmt-file" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stmt-text">Ή επικόλληση γραμμών</Label>
            <Textarea
              id="stmt-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setOverride({});
              }}
              rows={5}
              className="font-mono text-xs"
              placeholder={"Ημερομηνία;Περιγραφή;Χρέωση;Πίστωση;Υπόλοιπο\n05/09/2026;ΜΕΤΑΦΟΡΑ ΑΠΟ ΑΛΦΑ ΑΕ;;1.234,56;5.000,00"}
            />
          </div>

          {parsed && parsed.headers.length > 0 ? (
            <div className="grid gap-3 rounded-md border p-3">
              <p className="text-sm font-medium">Αντιστοίχιση στηλών</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {MAPPING_FIELDS.map((f) => (
                  <label key={f.key} className="grid gap-1 text-xs">
                    <span className="text-muted-foreground">{f.label}</span>
                    <select
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      value={parsed.mapping[f.key]}
                      aria-label={`Στήλη ${f.label}`}
                      onChange={(e) => setOverride((o) => ({ ...o, [f.key]: Number(e.target.value) }))}
                    >
                      <option value={-1}>—</option>
                      {parsed.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Στήλη ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {rows.length} έγκυρες γραμμές
                {parsed.invalid ? ` · ${parsed.invalid} παραλείπονται (χωρίς ημερομηνία ή ποσό)` : ""} · διαχωριστικό «{parsed.delimiter === "\t" ? "tab" : parsed.delimiter}»
              </p>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead>Περιγραφή</TableHead>
                    <TableHead>Αναφορά</TableHead>
                    <TableHead className="text-right">Ποσό</TableHead>
                    <TableHead className="text-right">Υπόλοιπο</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{formatDate(r.bookedAt)}</TableCell>
                      <TableCell className="max-w-xs truncate" title={r.description}>
                        {r.description}
                        {r.counterparty && r.counterparty !== r.description ? <span className="block text-xs text-muted-foreground">{r.counterparty}</span> : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.reference ?? ""}</TableCell>
                      <TableCell className={cn("text-right font-mono tabular-nums", r.amount > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{formatMoney(r.amount)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{r.balanceAfter != null ? formatMoney(r.balanceAfter) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 ? <p className="p-2 text-center text-xs text-muted-foreground">… και {rows.length - 50} ακόμη γραμμές</p> : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Άκυρο
          </Button>
          <Button type="button" onClick={submit} disabled={pending || rows.length === 0}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            Εισαγωγή {rows.length ? `${rows.length} κινήσεων` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
