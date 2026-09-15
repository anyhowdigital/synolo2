import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { exportCsv, quarterPeriod } from "@/lib/services/reports";
import { buildReportsWorkbook, workbookResponse } from "@/lib/services/excel";
import { featureBlockedMessage } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const def = quarterPeriod();
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const period = { from: valid(url.searchParams.get("from")) ?? def.from, to: valid(url.searchParams.get("to")) ?? def.to };
  const db = await getDb();
  const org = await getCurrentOrg(db);

  if (url.searchParams.get("format") === "xlsx") {
    const blocked = featureBlockedMessage(org, "excelExport");
    if (blocked) return new Response(blocked, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const wb = await buildReportsWorkbook(db, org, period);
    return workbookResponse(wb, `vivlia_${period.from}_${period.to}.xlsx`);
  }

  const csv = await exportCsv(db, org.id, period);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="esoda_${period.from}_${period.to}.csv"`,
    },
  });
}
