"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { attachments, expenses, suppliers } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { normalizeAfm } from "@/lib/greek/afm";
import { round2 } from "@/lib/invoice/totals";

export interface OcrDraftRow {
  key: string;
  fileName: string;
  mimeType: string;
  fileDataUrl: string;
  supplierName: string;
  supplierAfm: string;
  invoiceType: string;
  series: string;
  number: string;
  issueDate: string;
  description: string;
  netValue: number;
  vatAmount: number;
  grossValue: number;
  vatCategory: number;
  classificationCategory: string;
  classificationType: string;
  confidence: number;
}

const now = () => new Date().toISOString();

export type DupCheckRow = { key: string; supplierAfm: string; number: string; grossValue: number; issueDate: string; supplierName: string };

/** Εντοπισμός διπλών: ίδιος ΑΦΜ + αριθμός ή ίδιο ποσό + ημερομηνία + προμηθευτής. */
export async function checkOcrDuplicatesAction(rows: DupCheckRow[]) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false as const, error };
  const existing = await db.select().from(expenses).where(eq(expenses.orgId, ctx.org.id));
  const dups: Record<string, string> = {};
  for (const r of rows) {
    const afm = normalizeAfm(r.supplierAfm || "");
    const hit = existing.find(
      (e) =>
        (afm && r.number && normalizeAfm(e.supplierAfm) === afm && (e.number ?? "") === r.number) ||
        (e.issueDate === r.issueDate && Math.abs(e.grossValue - r.grossValue) < 0.01 && e.supplierName.trim().toLowerCase() === r.supplierName.trim().toLowerCase()),
    );
    if (hit) dups[r.key] = `Υπάρχει ήδη καταχώρηση ${hit.series ? `${hit.series}-` : ""}${hit.number || "—"} · ${hit.supplierName} · ${round2(hit.grossValue)} €`;
  }
  return { ok: true as const, duplicates: dups };
}

/** Μαζική καταχώρηση εξόδων ως προσχέδια (status pending) με συνημμένο το αρχείο. */
export async function insertOcrExpenses(db: Awaited<ReturnType<typeof getDb>>, orgId: string, rows: OcrDraftRow[], actor: Awaited<ReturnType<typeof resolveActor>>) {
  const existingSuppliers = await db.select().from(suppliers).where(eq(suppliers.orgId, orgId));
  let created = 0;
  let suppliersCreated = 0;
  let skipped = 0;

  for (const r of rows) {
    if (!r.supplierName?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.issueDate)) {
      skipped += 1;
      continue;
    }
    const afm = normalizeAfm(r.supplierAfm || "");
    let supplier = existingSuppliers.find((s) => (afm && normalizeAfm(s.afm) === afm) || s.name.trim().toLowerCase() === r.supplierName.trim().toLowerCase());
    if (!supplier) {
      const sid = randomUUID();
      await db.insert(suppliers).values({ id: sid, orgId, name: r.supplierName.trim().slice(0, 200), afm, createdAt: now() });
      supplier = (await db.query.suppliers.findFirst({ where: eq(suppliers.id, sid) }))!;
      existingSuppliers.push(supplier);
      suppliersCreated += 1;
    }

    const net = round2(r.netValue || 0);
    const vat = round2(r.vatAmount || 0);
    const gross = round2(r.grossValue || net + vat);
    const expenseId = randomUUID();
    await db.insert(expenses).values({
      id: expenseId,
      orgId,
      supplierName: r.supplierName.trim().slice(0, 200),
      supplierAfm: afm,
      supplierCountry: "GR",
      invoiceType: r.invoiceType || "1.1",
      series: r.series ?? "",
      number: r.number ?? "",
      issueDate: r.issueDate,
      description: (r.description ?? "").slice(0, 300),
      netValue: net,
      vatAmount: vat,
      vatCategory: r.vatCategory || 1,
      grossValue: gross,
      classificationCategory: r.classificationCategory || supplier.defaultClassificationCategory || "",
      classificationType: r.classificationType || supplier.defaultClassificationType || "",
      status: "pending",
      source: "manual",
      supplierId: supplier.id,
      createdAt: now(),
    });
    created += 1;

    if (r.fileDataUrl?.startsWith("data:")) {
      const b64 = r.fileDataUrl.split(",", 2)[1] ?? "";
      if (b64) {
        await db.insert(attachments).values({
          id: randomUUID(),
          orgId,
          entityType: "expense",
          entityId: expenseId,
          fileName: r.fileName || "receipt",
          mimeType: r.mimeType || "image/jpeg",
          size: Math.round((b64.length * 3) / 4),
          data: b64,
          uploadedBy: actor?.id ?? null,
          uploadedByName: actor?.name ?? "",
          createdAt: now(),
        });
      }
    }
  }

  await audit(db, orgId, "expense", "ocr_bulk", "ocr_bulk_created", `${created} έξοδα από μαζικό OCR`, actor);
  return { created, suppliersCreated, skipped };
}

/** Έλεγχος διπλοεγγραφών για συγκεκριμένη επιχείρηση (χρησιμοποιείται και από την πύλη λογιστή). */
export async function findOcrDuplicates(db: Awaited<ReturnType<typeof getDb>>, orgId: string, rows: DupCheckRow[]) {
  const existing = await db.select().from(expenses).where(eq(expenses.orgId, orgId));
  const dups: Record<string, string> = {};
  for (const r of rows) {
    const afm = normalizeAfm(r.supplierAfm || "");
    const hit = existing.find(
      (e) =>
        (afm && r.number && normalizeAfm(e.supplierAfm) === afm && (e.number ?? "") === r.number) ||
        (e.issueDate === r.issueDate && Math.abs(e.grossValue - r.grossValue) < 0.01 && e.supplierName.trim().toLowerCase() === r.supplierName.trim().toLowerCase()),
    );
    if (hit) dups[r.key] = `Υπάρχει ήδη καταχώρηση ${hit.series ? `${hit.series}-` : ""}${hit.number || "—"} · ${hit.supplierName} · ${round2(hit.grossValue)} €`;
  }
  return dups;
}

export async function commitOcrExpensesAction(rows: OcrDraftRow[]): Promise<{ ok: true; created: number; suppliersCreated: number; skipped: number } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Δεν επιλέξατε αποδείξεις." };
  if (rows.length > 40) return { ok: false, error: "Μέγιστο 40 αποδείξεις ανά καταχώρηση." };
  const res = await insertOcrExpenses(db, ctx.org.id, rows, await resolveActor(db));
  revalidatePath("/expenses");
  return { ok: true, ...res };
}

/** Στοιχεία προμηθευτή από το ΑΦΜ (για εμφάνιση «γνωστός προμηθευτής»). */
export async function knownSuppliersAction(afms: string[]) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false as const, error };
  const norm = afms.map((a) => normalizeAfm(a)).filter(Boolean);
  if (!norm.length) return { ok: true as const, known: {} as Record<string, string> };
  const rows = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.orgId, ctx.org.id), inArray(suppliers.afm, norm)));
  const known: Record<string, string> = {};
  for (const s of rows) known[s.afm] = s.name;
  return { ok: true as const, known };
}
