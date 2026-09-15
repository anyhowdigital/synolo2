import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getInvoiceByPublicToken } from "@/lib/services/invoices";
import { buildInvoicePdf, pdfResponse } from "@/lib/services/invoice-pdf";

export const dynamic = "force-dynamic";

/** Δημόσια λήψη PDF από τον σύνδεσμο που λαμβάνει ο πελάτης. */
export async function GET(req: Request, ctx: RouteContext<"/p/[token]/pdf">) {
  const { token } = await ctx.params;
  const db = await getDb();
  const invoice = await getInvoiceByPublicToken(db, token);
  if (!invoice || invoice.status === "draft") return new Response("Not found", { status: 404 });
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, invoice.orgId) });
  if (!org) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const { buffer, filename } = await buildInvoicePdf(db, org, invoice, url.searchParams.get("lang"));
  return pdfResponse(buffer, filename, url.searchParams.get("inline") === "1");
}
