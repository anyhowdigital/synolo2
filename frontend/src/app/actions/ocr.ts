"use server";

import { z } from "zod";

export type OcrExtracted = {
  supplier_name: string;
  supplier_afm: string;
  supplier_country: string;
  invoice_type: string;
  series: string;
  number: string;
  issue_date: string;
  description: string;
  net_value: number;
  vat_amount: number;
  gross_value: number;
  vat_category: number;
  classification_category?: string;
  classification_type?: string;
  expense_kind?: string;
  confidence: number;
  notes: string;
};

const ocrSchema = z.object({
  file_data_url: z.string().min(20).startsWith("data:", "Απαιτείται data URL."),
  file_name: z.string().default("receipt"),
});

export async function extractExpense(input: { fileDataUrl: string; fileName: string }): Promise<
  { ok: true; extracted: OcrExtracted } | { ok: false; error: string }
> {
  const parsed = ocrSchema.safeParse({ file_data_url: input.fileDataUrl, file_name: input.fileName });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα δεδομένα." };
  try {
    const resp = await fetch("http://127.0.0.1:8001/api/ocr/expense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, error: `OCR αποτυχία (${resp.status}): ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { ok: true, extracted: data.extracted as OcrExtracted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
