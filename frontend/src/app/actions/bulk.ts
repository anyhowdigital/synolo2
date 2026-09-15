"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { customers, invoices } from "@/db/schema";
import { requireOrg } from "@/lib/services/org";
import { deleteDraft, invoiceDisplayNumber } from "@/lib/services/invoices";
import { emailInvoice } from "@/lib/services/invoice-email";
import { transmitAllPending } from "@/lib/services/mydata-sync";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { getDocumentType } from "@/lib/greek/document-types";

export type BulkOp = "transmit" | "email" | "delete_drafts" | "issue" | "mark_paid";

export interface BulkResult {
  ok: boolean;
  done: number;
  skipped: number;
  failed: { label: string; error: string }[];
  warning?: string;
  error?: string;
}

const MAX_BULK = 100;

/** Μαζικές ενέργειες σε επιλεγμένα παραστατικά. Κάθε εγγραφή επεξεργάζεται ανεξάρτητα ώστε μια αποτυχία να μη μπλοκάρει τις υπόλοιπες. */
export async function bulkInvoiceAction(op: BulkOp, ids: string[]): Promise<BulkResult> {
  const result: BulkResult = { ok: true, done: 0, skipped: 0, failed: [] };
  const unique = Array.from(new Set(ids)).filter(Boolean).slice(0, MAX_BULK);
  if (unique.length === 0) return { ...result, ok: false, error: "Δεν επιλέξατε παραστατικά." };
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const rows = await db.select().from(invoices).where(inArray(invoices.id, unique));
    const mine = rows.filter((r) => r.orgId === org.id);

    if (op === "issue") {
      const { issueInvoice } = await import("@/lib/services/invoices");
      for (const inv of mine) {
        if (inv.status !== "draft") {
          result.skipped++;
          continue;
        }
        try {
          await issueInvoice(db, org, inv.id);
          result.done++;
        } catch (err) {
          result.failed.push({ label: invoiceDisplayNumber(inv), error: (err as Error).message });
        }
      }
      if (result.done) await audit(db, org.id, "organization", org.id, "bulk_issued", `${result.done} παραστατικά`, await resolveActor(db));
    } else if (op === "mark_paid") {
      const { recordPayment } = await import("@/lib/services/invoices");
      for (const inv of mine) {
        const remaining = Math.round((inv.totalGrossValue - inv.paidAmount) * 100) / 100;
        if (inv.status === "draft" || inv.status === "cancelled" || remaining <= 0.005) {
          result.skipped++;
          continue;
        }
        try {
          await recordPayment(db, org, { invoiceId: inv.id, amount: remaining, paidAt: new Date().toISOString().slice(0, 10), method: inv.paymentMethod, reference: "Μαζική εξόφληση" });
          result.done++;
        } catch (err) {
          result.failed.push({ label: invoiceDisplayNumber(inv), error: (err as Error).message });
        }
      }
      if (result.done) await audit(db, org.id, "organization", org.id, "bulk_paid", `${result.done} εξοφλήσεις`, await resolveActor(db));
    } else if (op === "transmit") {
      const eligible = mine.filter((r) => r.status !== "draft" && r.status !== "cancelled" && !r.mydataMark && getDocumentType(r.invoiceType).kind !== "quote");
      result.skipped = mine.length - eligible.length;
      if (eligible.length) {
        const r = await transmitAllPending(
          db,
          org,
          eligible.map((e) => e.id),
        );
        result.done = r.sent;
        result.failed = r.errors.map((f) => ({ label: f.number, error: f.error }));
      }
    } else if (op === "email") {
      let logged = 0;
      for (const inv of mine) {
        if (inv.status === "draft") {
          result.skipped++;
          continue;
        }
        const customer = inv.customerId ? await db.query.customers.findFirst({ where: eq(customers.id, inv.customerId) }) : null;
        if (!customer?.email) {
          result.failed.push({ label: invoiceDisplayNumber(inv), error: "Ο πελάτης δεν έχει email." });
          continue;
        }
        try {
          const r = await emailInvoice(db, org, inv.id, { to: customer.email });
          if (r.ok) {
            result.done++;
            if (!r.delivered) logged++;
          } else result.failed.push({ label: invoiceDisplayNumber(inv), error: r.error ?? "Αποτυχία αποστολής." });
        } catch (err) {
          result.failed.push({ label: invoiceDisplayNumber(inv), error: (err as Error).message });
        }
      }
      if (logged) result.warning = "Δεν έχει ρυθμιστεί SMTP – τα email καταγράφηκαν στο Outbox (Ρυθμίσεις → Email).";
    } else if (op === "delete_drafts") {
      for (const inv of mine) {
        if (inv.status !== "draft") {
          result.skipped++;
          continue;
        }
        try {
          await deleteDraft(db, org, inv.id);
          result.done++;
        } catch (err) {
          result.failed.push({ label: invoiceDisplayNumber(inv), error: (err as Error).message });
        }
      }
      if (result.done) await audit(db, org.id, "organization", org.id, "bulk_deleted", `${result.done} πρόχειρα`, await resolveActor(db));
    }

    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/mydata");
    return result;
  } catch (err) {
    return { ...result, ok: false, error: (err as Error).message };
  }
}
