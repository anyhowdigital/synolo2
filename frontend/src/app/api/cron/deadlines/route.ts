import { NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, organizations } from "@/db/schema";
import { taxDeadlines } from "@/lib/services/compliance";
import { notify } from "@/lib/services/notifications";
import { formatDate } from "@/lib/invoice/totals";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.WEBHOOK_CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const orgs = await db.select().from(organizations);
  const results: { orgId: string; notified: number }[] = [];

  for (const org of orgs) {
    const { items } = taxDeadlines(org);
    let notified = 0;
    const todayStart = new Date().toISOString().slice(0, 10);
    const existing = await db
      .select({ title: notifications.title })
      .from(notifications)
      .where(and(eq(notifications.orgId, org.id), eq(notifications.type, "tax_deadline"), gte(notifications.createdAt, todayStart)));
    const alreadySent = new Set(existing.map((e) => e.title));
    for (const d of items.filter((i) => i.days === 7 || i.days === 1 || i.days === 0)) {
      const title = `${d.code}: ${d.days === 0 ? "λήγει σήμερα" : d.days === 1 ? "λήγει αύριο" : "σε 7 ημέρες"}`;
      if (alreadySent.has(title)) continue;
      await notify(db, {
        orgId: org.id,
        type: "tax_deadline",
        title,
        body: `${d.title} – προθεσμία ${formatDate(d.date)}. ${d.note}`,
        link: "/deadlines",
      });
      alreadySent.add(title);
      notified++;
    }
    results.push({ orgId: org.id, notified });
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), orgs: results });
}

export async function GET(req: Request) {
  return POST(req);
}
