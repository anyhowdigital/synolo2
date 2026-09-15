import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { getInvoiceWithLines } from "@/lib/services/invoices";
import { buildInvoicePdf, pdfResponse } from "@/lib/services/invoice-pdf";

export const dynamic = "force-dynamic";

/** PDF παραστατικού (server-side). `?lang=en|el|bilingual` για επιλογή γλώσσας, `?inline=1` για προβολή στο browser. */
export async function GET(req: Request, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const invoice = await getInvoiceWithLines(db, org.id, id);
  if (!invoice) return new Response("Not found", { status: 404 });
  const { buffer, filename } = await buildInvoicePdf(db, org, invoice, url.searchParams.get("lang"));
  return pdfResponse(buffer, filename, url.searchParams.get("inline") === "1");
}
