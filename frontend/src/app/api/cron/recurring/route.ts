import { getDb } from "@/db";
import { runDueTemplatesForAll } from "@/lib/services/recurring";
import { authorizeCron } from "@/lib/api/cron";

/** Καλείται από scheduler (π.χ. Vercel Cron, crontab) μία φορά την ημέρα. Header: Authorization: Bearer $CRON_SECRET */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const db = await getDb();
  const results = await runDueTemplatesForAll(db);
  return Response.json({ ok: true, results });
}

export const POST = GET;
