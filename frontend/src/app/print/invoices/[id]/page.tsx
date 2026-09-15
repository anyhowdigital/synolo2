import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { getCurrentOrg } from "@/lib/services/org";
import { getInvoiceWithLines, invoiceDisplayNumber } from "@/lib/services/invoices";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { documentPresentation } from "@/lib/services/document-theme";
import { PrintToolbar } from "@/components/invoices/print-toolbar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/print/invoices/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const invoice = await getInvoiceWithLines(db, org.id, id);
  return { title: invoice ? `${invoiceDisplayNumber(invoice)} – ${org.name}` : "Παραστατικό" };
}

export default async function PrintInvoicePage({ params, searchParams }: PageProps<"/print/invoices/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const invoice = await getInvoiceWithLines(db, org.id, id);
  if (!invoice) notFound();
  const correlated = invoice.correlatedInvoiceId ? await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.correlatedInvoiceId) }) : null;
  const qrDataUrl = invoice.mydataQrUrl ? await QRCode.toDataURL(invoice.mydataQrUrl, { margin: 0, width: 192 }) : null;
  const presentation = await documentPresentation(db, org, invoice, typeof sp.lang === "string" ? sp.lang : null);

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <PrintToolbar backHref={`/invoices/${invoice.id}`} pdfHref={`/api/invoices/${invoice.id}/pdf?lang=${presentation.lang}`} />
      <div className="mx-auto max-w-[210mm] py-6 print:py-0">
        <InvoiceDocument org={org} invoice={invoice} lines={invoice.lines} qrDataUrl={qrDataUrl} correlated={correlated ?? null} theme={presentation.theme} terms={presentation.terms} lang={presentation.lang} className="min-h-[297mm]" />
      </div>
    </div>
  );
}
