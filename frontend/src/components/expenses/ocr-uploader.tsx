"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { extractExpense, type OcrExtracted } from "@/app/actions/ocr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function OcrUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OcrExtracted | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const router = useRouter();

  function pickFile() {
    inputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Πολύ μεγάλο αρχείο. Ανώτατο όριο: 8 MB.");
      return;
    }
    setFileName(file.name);
    setResult(null);
    const dataUrl = await readAsDataUrl(file);
    startTransition(async () => {
      const res = await extractExpense({ fileDataUrl: dataUrl, fileName: file.name });
      if (!res.ok) toast.error(res.error);
      else {
        setResult(res.extracted);
        toast.success("Το AI εντόπισε τα στοιχεία!");
      }
    });
  }

  function goToPrefill() {
    if (!result) return;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("expense_ocr_prefill", JSON.stringify(result));
    }
    router.push("/expenses/new?prefill=ocr");
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">OCR παραστατικού με AI</div>
            <div className="text-xs text-muted-foreground">Ανεβάστε φωτογραφία ή PDF — η τεχνητή νοημοσύνη (Claude) συμπληρώνει αυτόματα ΑΦΜ, ποσά, ΦΠΑ και ημερομηνία.</div>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={onFileChange} className="hidden" data-testid="ocr-file-input" />
        <Button type="button" onClick={pickFile} disabled={pending} data-testid="ocr-upload-btn">
          {pending ? <><Loader2 className="size-4 animate-spin" /> Ανάλυση…</> : <><FileUp className="size-4" /> Ανεβάστε παραστατικό</>}
        </Button>
      </div>

      {result ? (
        <div className="mt-4 rounded-lg border bg-muted/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">{fileName}</Badge>
            <Badge className={result.confidence > 0.8 ? "bg-emerald-100 text-emerald-800" : result.confidence > 0.5 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}>
              Ακρίβεια {Math.round(result.confidence * 100)}%
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div><span className="text-muted-foreground">Προμηθευτής:</span> <strong>{result.supplier_name || "—"}</strong></div>
            <div><span className="text-muted-foreground">ΑΦΜ:</span> <strong className="tabular-nums">{result.supplier_afm || "—"}</strong></div>
            <div><span className="text-muted-foreground">Ημ/νία:</span> <strong>{result.issue_date || "—"}</strong></div>
            <div><span className="text-muted-foreground">Παραστατικό:</span> <strong>{result.series} {result.number}</strong></div>
            <div><span className="text-muted-foreground">Καθαρή αξία:</span> <strong className="tabular-nums">{result.net_value.toFixed(2)} €</strong></div>
            <div><span className="text-muted-foreground">ΦΠΑ:</span> <strong className="tabular-nums">{result.vat_amount.toFixed(2)} €</strong></div>
            <div><span className="text-muted-foreground">Σύνολο:</span> <strong className="tabular-nums">{result.gross_value.toFixed(2)} €</strong></div>
            <div><span className="text-muted-foreground">Τύπος:</span> <strong>{result.invoice_type}</strong></div>
          </div>
          {result.notes ? <p className="mt-2 text-xs text-muted-foreground">Σημειώσεις AI: {result.notes}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={goToPrefill} data-testid="ocr-create-btn">Δημιουργία εξόδου με προσυμπληρωμένα στοιχεία →</Button>
            <Button type="button" variant="ghost" onClick={() => { setResult(null); setFileName(""); }}>Ακύρωση</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
