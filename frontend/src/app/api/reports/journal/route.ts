import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { quarterPeriod } from "@/lib/services/reports";
import { buildJournal, journalToCsv } from "@/lib/accounting/bridge";
import { buildJournalWorkbook, workbookResponse } from "@/lib/services/excel";
import { featureBlockedMessage } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const def = quarterPeriod();
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const period = { from: valid(url.searchParams.get("from")) ?? def.from, to: valid(url.searchParams.get("to")) ?? def.to };
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const blocked = featureBlockedMessage(org, "accountingBridge");
  if (blocked) return new Response(blocked, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (url.searchParams.get("format") === "xlsx") {
    const wb = await buildJournalWorkbook(db, org, period);
    return workbookResponse(wb, `imerologio_elp_${period.from}_${period.to}.xlsx`);
  }
  const journal = await buildJournal(db, org, period);
  return new Response(journalToCsv(journal.lines), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="imerologio_elp_${period.from}_${period.to}.csv"`,
    },
  });
}
