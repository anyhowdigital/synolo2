import { getDb } from "@/db";
import { runRemindersForAll } from "@/lib/services/reminders";
import { authorizeCron } from "@/lib/api/cron";

/** Αυτόματες υπενθυμίσεις πληρωμής. Header: Authorization: Bearer $CRON_SECRET */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const db = await getDb();
  const results = await runRemindersForAll(db);
  return Response.json({ ok: true, results });
}

export const POST = GET;
