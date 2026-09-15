import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { syncExpensesFromMyData } from "@/lib/services/expenses";

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // dev / no secret configured
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  // Όλες οι επιχειρήσεις με ενεργό myDATA (dev ή prod, όχι mock αν δεν έχουν credentials)
  const orgs = await db.select().from(organizations).where(ne(organizations.mydataEnvironment, "mock"));
  const results: Array<{ orgId: string; imported: number; error?: string }> = [];
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  const period = { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  for (const org of orgs) {
    try {
      const r = await syncExpensesFromMyData(db, org, period);
      results.push({ orgId: org.id, imported: r?.imported ?? 0 });
    } catch (err) {
      results.push({ orgId: org.id, imported: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), orgs: results });
}

export async function GET(req: Request) {
  // Convenience for manual triggering by admins
  return POST(req);
}
