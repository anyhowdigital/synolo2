import { and, desc, eq, ne } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { invoices, type Invoice, type InvoiceLine } from "@/db/schema";
import { getCurrentOrg } from "@/lib/services/org";
import { getInvoiceWithLines } from "@/lib/services/invoices";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { decodeThemeParam, parsePdfTheme } from "@/lib/pdf/theme";

export const dynamic = "force-dynamic";
export const metadata = { title: "Προεπισκόπηση εμφάνισης", robots: { index: false, follow: false } };

/** Δείγμα παραστατικού όταν ο οργανισμός δεν έχει ακόμη εκδώσει τίποτα. */
function sampleInvoice(orgId: string): { invoice: Invoice; lines: InvoiceLine[] } {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const base: Partial<Invoice> = {
    id: "sample",
    orgId,
    customerId: "sample-customer",
    seriesId: "sample-series",
    seriesCode: "ΤΠ",
    number: 42,
    invoiceType: "1.1",
    issueDate: today,
    dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    currency: "EUR",
    exchangeRate: null,
    paymentMethod: 1,
    status: "issued",
    notes: "Παράδοση στα γραφεία του πελάτη.",
    customerName: "Δείγμα Πελάτη Α.Ε.",
    customerAfm: "099999999",
    customerDoy: "ΦΑΕ Αθηνών",
    customerAddress: "Λ. Κηφισίας 100, 11526, Αθήνα",
    customerCountry: "GR",
    totalNetValue: 1450,
    totalVatAmount: 348,
    totalWithheldAmount: 0,
    totalStampDutyAmount: 0,
    totalGrossValue: 1798,
    paidAmount: 0,
    mydataStatus: "sent",
    mydataMark: "400001234567890",
    mydataUid: "SAMPLE-UID",
    mydataAuthCode: "SAMPLE-AUTH",
    mydataQrUrl: "https://mydataapidev.aade.gr/timologio/qrcode?sample",
    branch: 0,
    tags: "[]",
    customFieldsJson: "{}",
    channel: "",
    viewCount: 0,
    reminderCount: 0,
    selfPricing: false,
    createdAt: now,
    updatedAt: now,
  };
  const line = (n: number, description: string, quantity: number, unitPrice: number, unit: number, discount = 0): InvoiceLine =>
    ({
      id: `l${n}`,
      invoiceId: "sample",
      lineNumber: n,
      productId: null,
      description,
      quantity,
      unitPrice,
      discountPercent: discount,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: unit,
      classificationCategory: "category1_1",
      classificationType: "E3_561_001",
      withholdingCategory: 0,
      stampDutyCategory: 0,
      netValue: Math.round(quantity * unitPrice * (1 - discount / 100) * 100) / 100,
      vatAmount: Math.round(quantity * unitPrice * (1 - discount / 100) * 0.24 * 100) / 100,
      withheldAmount: 0,
      stampDutyAmount: 0,
      grossValue: Math.round(quantity * unitPrice * (1 - discount / 100) * 1.24 * 100) / 100,
    }) as InvoiceLine;
  return {
    invoice: base as Invoice,
    lines: [line(1, "Σχεδιασμός & ανάπτυξη ιστοσελίδας", 1, 950, 1), line(2, "Συμβουλευτικές υπηρεσίες (ώρες)", 5, 80, 3), line(3, "Φιλοξενία ετήσια", 1, 100, 1)],
  };
}

export default async function ThemePreviewPage({ searchParams }: PageProps<"/print/preview">) {
  const sp = await searchParams;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const theme = decodeThemeParam(typeof sp.t === "string" ? sp.t : null) ?? parsePdfTheme(org.pdfThemeJson);

  const latest =
    (await db.query.invoices.findFirst({ where: and(eq(invoices.orgId, org.id), ne(invoices.status, "draft"), ne(invoices.invoiceType, "QUOTE")), orderBy: desc(invoices.issueDate) })) ??
    (await db.query.invoices.findFirst({ where: eq(invoices.orgId, org.id), orderBy: desc(invoices.createdAt) }));
  const real = latest ? await getInvoiceWithLines(db, org.id, latest.id) : null;
  const { invoice, lines } = real ? { invoice: real, lines: real.lines } : sampleInvoice(org.id);
  const qrDataUrl = invoice.mydataQrUrl ? await QRCode.toDataURL(invoice.mydataQrUrl, { margin: 0, width: 192 }) : null;

  return (
    <div className="min-h-screen bg-neutral-200 p-4">
      <InvoiceDocument org={org} invoice={invoice} lines={lines} qrDataUrl={qrDataUrl} theme={theme} terms={theme.terms} className="min-h-[297mm]" />
    </div>
  );
}
