import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import type { Db } from "@/db";
import { invoices, type Organization } from "@/db/schema";
import { renderInvoicePdf, invoicePdfFilename } from "@/lib/pdf/invoice-pdf";
import type { InvoiceWithLines } from "./invoices";
import { documentPresentation } from "./document-theme";

/** Δημιουργία PDF παραστατικού με QR myDATA, συσχετιζόμενο και αυτόματη επιλογή γλώσσας. */
export async function buildInvoicePdf(db: Db, org: Organization, inv: InvoiceWithLines, langOverride?: string | null) {
  const [correlated, qrDataUrl, presentation] = await Promise.all([
    inv.correlatedInvoiceId ? db.query.invoices.findFirst({ where: eq(invoices.id, inv.correlatedInvoiceId) }) : Promise.resolve(null),
    inv.mydataQrUrl ? QRCode.toDataURL(inv.mydataQrUrl, { margin: 0, width: 256 }) : Promise.resolve(null),
    documentPresentation(db, org, inv, langOverride),
  ]);
  const lang = presentation.lang;
  const buffer = await renderInvoicePdf({ org, invoice: inv, lines: inv.lines, qrDataUrl, correlated: correlated ?? null, lang, theme: presentation.theme, terms: presentation.terms });
  return { buffer, filename: invoicePdfFilename(inv, lang), lang };
}

export function pdfResponse(buffer: Buffer, filename: string, inline = false) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
