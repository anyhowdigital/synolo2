"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { series, products, cashAccounts } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { saveDraft, issueInvoice, recordPayment } from "@/lib/services/invoices";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const posLineSchema = z.object({
  productId: z.string().nullable(),
  description: z.string(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  vatCategory: z.coerce.number().int().min(1).max(8).default(1),
  classificationCategory: z.string().default("category1_3"),
  classificationType: z.string().default("E3_561_001"),
  measurementUnit: z.coerce.number().int().default(1),
});

const posSchema = z.object({
  seriesId: z.string().min(1, "Επιλέξτε σειρά."),
  customerId: z.string().nullable().optional(),
  paymentMethod: z.coerce.number().int().min(1).max(7).default(3),
  amountReceived: z.coerce.number().min(0).default(0),
  accountId: z.string().nullable().optional(),
  notes: z.string().default(""),
  lines: z.array(posLineSchema).min(1, "Προσθέστε τουλάχιστον ένα είδος."),
});

export type PosInput = z.infer<typeof posSchema>;

export async function posCheckout(input: PosInput): Promise<ActionResult> {
  const parsed = posSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;

  const ser = await db.query.series.findFirst({ where: and(eq(series.id, parsed.data.seriesId), eq(series.orgId, org.id)) });
  if (!ser) return { ok: false, error: "Η σειρά δεν βρέθηκε." };

  let invoiceId: string;
  try {
    invoiceId = await saveDraft(db, org, {
      customerId: parsed.data.customerId ?? null,
      seriesId: ser.id,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: null,
      currency: "EUR",
      paymentMethod: parsed.data.paymentMethod,
      notes: parsed.data.notes,
      correlatedInvoiceId: null,
      channel: "pos",
      lines: parsed.data.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        vatCategory: l.vatCategory,
        vatExemptionCategory: null,
        measurementUnit: l.measurementUnit,
        classificationCategory: l.classificationCategory,
        classificationType: l.classificationType,
        withholdingCategory: 0,
        stampDutyCategory: 0,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Αποτυχία δημιουργίας: ${msg}` };
  }

  try {
    await issueInvoice(db, org, invoiceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Αποτυχία έκδοσης: ${msg}` };
  }

  // Άμεση είσπραξη — για μετρητά/κάρτα/POS
  if (parsed.data.amountReceived > 0) {
    try {
      const totalGross = parsed.data.lines.reduce((s, l) => {
        const net = l.quantity * l.unitPrice * (1 - l.discountPercent / 100);
        const vatRate = l.vatCategory === 1 ? 0.24 : l.vatCategory === 2 ? 0.13 : l.vatCategory === 3 ? 0.06 : 0;
        return s + net * (1 + vatRate);
      }, 0);
      const toPay = Math.min(parsed.data.amountReceived, +totalGross.toFixed(2));
      if (toPay > 0.005) {
        await recordPayment(db, org, {
          invoiceId,
          amount: toPay,
          paidAt: new Date().toISOString().slice(0, 10),
          method: parsed.data.paymentMethod,
          reference: "POS quick sale",
          accountId: parsed.data.accountId ?? null,
        });
      }
    } catch (err) {
      // Το παραστατικό έχει εκδοθεί – log και συνέχεια στην προβολή
      console.error("[pos.checkout] recordPayment failed:", err);
    }
  }

  revalidatePath("/pos");
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}
