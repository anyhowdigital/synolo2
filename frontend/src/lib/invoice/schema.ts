import { z } from "zod";
import { isValidDate } from "./totals";

const lineSchema = z.object({
  productId: z.string().nullable().optional(),
  description: z.string().trim().min(1, "Κάθε γραμμή χρειάζεται περιγραφή."),
  quantity: z.coerce.number().positive("Η ποσότητα πρέπει να είναι θετική."),
  unitPrice: z.coerce.number().min(0, "Η τιμή δεν μπορεί να είναι αρνητική."),
  discountPercent: z.coerce.number().min(0, "Η έκπτωση πρέπει να είναι από 0 έως 100%.").max(100, "Η έκπτωση πρέπει να είναι από 0 έως 100%.").default(0),
  vatCategory: z.coerce.number().int().min(1).max(8),
  vatExemptionCategory: z.coerce.number().int().nullable().optional(),
  measurementUnit: z.coerce.number().int().min(1).max(7),
  classificationCategory: z.string().min(1),
  classificationType: z.string().min(1),
  withholdingCategory: z.coerce.number().int().min(0).default(0),
  stampDutyCategory: z.coerce.number().int().min(0).default(0),
});

export const invoicePayloadSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().nullable(),
  seriesId: z.string().min(1, "Επιλέξτε σειρά παραστατικού."),
  issueDate: z.string().refine(isValidDate, "Μη έγκυρη ημερομηνία έκδοσης."),
  dueDate: z.string().refine(isValidDate, "Μη έγκυρη ημερομηνία λήξης.").nullable(),
  currency: z.string().default("EUR"),
  exchangeRate: z.coerce.number().positive("Η ισοτιμία πρέπει να είναι μεγαλύτερη από μηδέν.").nullable().optional(),
  paymentMethod: z.coerce.number().int().min(1).max(8),
  notes: z.string().default(""),
  correlatedInvoiceId: z.string().nullable(),
  sourceQuoteId: z.string().nullable().optional(),
  // Δελτίο αποστολής
  dispatchDate: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  movePurpose: z.coerce.number().int().min(1).max(19).nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  loadingAddress: z.string().nullable().optional(),
  /** Αυτοτιμολόγηση – ο λήπτης εκδίδει για λογαριασμό του εκδότη (myDATA selfPricing). */
  selfPricing: z.boolean().optional().default(false),
  /** Ετικέτες, custom πεδία και διαστάσεις πωλήσεων (πωλητής, κανάλι). */
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  salespersonId: z.string().nullable().optional(),
  channel: z.string().trim().max(60).optional(),
  warehouseId: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1, "Προσθέστε τουλάχιστον μία γραμμή."),
  issueNow: z.boolean().default(false),
  }).refine((value) => !value.dueDate || value.dueDate >= value.issueDate, { message: "Η λήξη δεν μπορεί να προηγείται της έκδοσης.", path: ["dueDate"] });

export type InvoicePayload = z.infer<typeof invoicePayloadSchema>;
