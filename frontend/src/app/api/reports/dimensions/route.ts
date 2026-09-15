import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { quarterPeriod } from "@/lib/services/reports";
import { dimensionCsv, isSalesDimension, salesByDimension } from "@/lib/services/sales-dimensions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const def = quarterPeriod();
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const period = { from: valid(url.searchParams.get("from")) ?? def.from, to: valid(url.searchParams.get("to")) ?? def.to };
  const dim = url.searchParams.get("dim");
  const dimension = isSalesDimension(dim) ? dim : "salesperson";
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const report = await salesByDimension(db, org.id, period, dimension);
  return new Response(dimensionCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="poliseis_${dimension}_${period.from}_${period.to}.csv"`,
    },
  });
}
