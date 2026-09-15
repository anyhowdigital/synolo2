import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { getCurrentOrg } from "@/lib/services/org";
import { getInvoiceWithLines, invoiceDisplayNumber } from "@/lib/services/invoices";
import { buildInvoicesDocXml } from "@/lib/mydata/xml";

export const dynamic = "force-dynamic";

/** Λήψη του XML InvoicesDoc (όπως διαβιβάστηκε ή όπως θα διαβιβαστεί) για έλεγχο/αρχείο. */
export async function GET(_req: Request, ctx: RouteContext<"/api/invoices/[id]/xml">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const invoice = await getInvoiceWithLines(db, org.id, id);
  if (!invoice) return new Response("Not found", { status: 404 });

  let xml = invoice.mydataRequestXml;
  if (!xml) {
    const original = invoice.correlatedInvoiceId ? await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.correlatedInvoiceId) }) : null;
    xml = buildInvoicesDocXml({ org, invoice, lines: invoice.lines, correlatedMark: original?.mydataMark ?? null });
  }
  const filename = `${invoiceDisplayNumber(invoice).replace(/[^\w\u0370-\u03FF-]+/g, "_")}.xml`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
