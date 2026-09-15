import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { getInvoiceWithLines, invoiceDisplayNumber } from "@/lib/services/invoices";
import { buildXmlFor, loadB2GCustomer } from "@/lib/services/b2g";

export const dynamic = "force-dynamic";

/** Λήψη του PEPPOL BIS Billing 3.0 (UBL) XML για αρχειοθέτηση ή χειροκίνητη υποβολή. */
export async function GET(_req: Request, ctx: RouteContext<"/api/invoices/[id]/ubl">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const invoice = await getInvoiceWithLines(db, org.id, id);
  if (!invoice) return new Response("Not found", { status: 404 });
  const customer = await loadB2GCustomer(db, invoice);
  let xml: string;
  try {
    xml = invoice.b2gXml || await buildXmlFor(db, org, invoice, invoice.lines, customer);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Δεν ήταν δυνατή η παραγωγή του UBL XML." }, { status: 422 });
  }
  const filename = `UBL-${invoiceDisplayNumber(invoice).replace(/[^\w\u0370-\u03FF-]+/g, "_")}.xml`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
