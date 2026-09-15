"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { normalizeWideInvoiceCsv } from "@/lib/import/importers-docs";
import type { ImportResult } from "@/lib/import/importers";
import { applyMapping } from "@/lib/import/fields";
import { runImport, recentBatches, undoImport, decodeCsv, IMPORT_PATHS, type ImportKind, type ImportBatchInfo } from "@/lib/import/engine";

export type { ImportKind, ImportBatchInfo };
export type ImportActionResult = { ok: true; result: ImportResult; batchId: string | null } | { ok: false; error: string };

const MAX_BYTES = 4 * 1024 * 1024;

export async function importCsvAction(kind: ImportKind, formData: FormData): Promise<ImportActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Επιλέξτε ένα αρχείο CSV." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Το αρχείο υπερβαίνει τα 4 MB." };
  const updateExisting = formData.get("updateExisting") === "on" || formData.get("updateExisting") === "true";
  const issue = formData.get("issue") === "true";
  const defaultSeriesCode = String(formData.get("defaultSeriesCode") ?? "");
  const mappingRaw = String(formData.get("mapping") ?? "");

  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };

  let text = decodeCsv(Buffer.from(await file.arrayBuffer()));
  const isWideInvoices = kind === "invoices" && normalizeWideInvoiceCsv(text) !== null;
  if (mappingRaw && !isWideInvoices) {
    try {
      const mapping = JSON.parse(mappingRaw) as Record<string, string>;
      if (mapping && Object.keys(mapping).length) text = applyMapping(text, mapping);
    } catch {
      return { ok: false, error: "Η αντιστοίχιση στηλών δεν είναι έγκυρη." };
    }
  }

  try {
    const actor = await resolveActor(db);
    const { result, batchId } = await runImport(db, ctx.org, kind, text, file.name, { updateExisting, issue, defaultSeriesCode, source: "csv" }, actor);
    revalidatePath(IMPORT_PATHS[kind]);
    return { ok: true, result, batchId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Η εισαγωγή απέτυχε." };
  }
}

/** Οι τελευταίες εισαγωγές που μπορούν να αναιρεθούν. */
export async function recentImportBatches(kind: ImportKind): Promise<ImportBatchInfo[]> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return [];
  return recentBatches(db, ctx.org.id, kind);
}

export async function undoImportAction(batchId: string): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const res = await undoImport(db, ctx.org.id, batchId, await resolveActor(db));
  if (res.ok) revalidatePath(IMPORT_PATHS[res.kind]);
  return res;
}
