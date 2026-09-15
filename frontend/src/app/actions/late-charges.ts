"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireOrg } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { getInvoiceWithLines, invoiceDisplayNumber, saveDraft } from "@/lib/services/invoices";
import { lateCharges } from "@/lib/services/credit-profile";
import { audit } from "@/lib/services/audit";

type Result = { ok: true; id: string; message: string } | { ok: false; error: string };

/** Μετατρέπει τους υπολογισμένους τόκους υπερημερίας και τη χρέωση καθυστέρησης σε πρόχειρο παραστατικό. */
export async function invoiceLateChargesAction(invoiceId: string): Promise<Result> {
  try {
    const db = await getDb();
    const org = await requireOrg(db, "write");
    const inv = await getInvoiceWithLines(db, org.id, invoiceId);
    if (!inv) return { ok: false, error: "Το παραστατικό δεν βρέθηκε." };
    const charges = lateCharges(org, inv);
    if (charges.total <= 0.005) return { ok: false, error: "Δεν υπάρχουν επιβαρύνσεις προς χρέωση." };

    const parts = [charges.interest > 0 ? `τόκοι υπερημερίας ${charges.interest.toFixed(2)}€` : "", charges.flat > 0 ? `χρέωση καθυστέρησης ${charges.flat.toFixed(2)}€` : ""].filter(Boolean);
    const id = await saveDraft(db, org, {
      customerId: inv.customerId,
      seriesId: inv.seriesId,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: null,
      currency: inv.currency,
      paymentMethod: inv.paymentMethod,
      notes: `Επιβαρύνσεις λόγω καθυστέρησης ${charges.daysLate} ημερών για το ${invoiceDisplayNumber(inv)} (${parts.join(" · ")}).`,
      correlatedInvoiceId: null,
      tags: "[]",
      lines: [
        {
          description: `Τόκοι υπερημερίας & χρέωση καθυστέρησης – ${invoiceDisplayNumber(inv)}`,
          quantity: 1,
          unitPrice: charges.total,
          discountPercent: 0,
          vatCategory: 7,
          vatExemptionCategory: 14,
          classificationCategory: "category1_95",
          classificationType: "E3_596",
          measurementUnit: 1,
          withholdingCategory: 0,
          stampDutyCategory: 0,
          productId: null,
        },
      ],
    });

    await audit(db, org.id, "invoice", id, "late_charges_invoiced", `Επιβαρύνσεις ${charges.total.toFixed(2)}€ από ${invoiceDisplayNumber(inv)}`, await resolveActor(db));
    revalidatePath("/invoices");
    return { ok: true, id, message: `Δημιουργήθηκε πρόχειρο παραστατικό επιβαρύνσεων ${charges.total.toFixed(2)}€.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Σφάλμα." };
  }
}
