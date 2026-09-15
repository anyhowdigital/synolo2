import { getDb } from "@/db";
import { processWebhookQueue } from "@/lib/services/webhooks";
import { authorizeCron } from "@/lib/api/cron";

/** Επαναπροσπάθειες παράδοσης webhooks (εκθετικό backoff). Header: Authorization: Bearer $CRON_SECRET */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const db = await getDb();
  const result = await processWebhookQueue(db);
  return Response.json({ ok: true, ...result });
}

export const POST = GET;
