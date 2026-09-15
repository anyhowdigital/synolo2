import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { buildStatementWorkbook, workbookResponse } from "@/lib/services/excel";
import { featureBlockedMessage } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/customers/[id]/statement">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const period = { from: valid(url.searchParams.get("from")), to: valid(url.searchParams.get("to")) };
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const blocked = featureBlockedMessage(org, "excelExport");
  if (blocked) return new Response(blocked, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const result = await buildStatementWorkbook(db, org, id, period);
  if (!result) return new Response("Not found", { status: 404 });
  const safe = result.statement.customer.name.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  return workbookResponse(result.wb, `kartela_${safe}${period.from ? `_${period.from}` : ""}${period.to ? `_${period.to}` : ""}.xlsx`);
}
