import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { notify } from "@/lib/services/notifications";
import { riskHistory, riskReport, saveRiskSnapshot } from "@/lib/services/risks";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.WEBHOOK_CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Ημερήσιο radar συμμόρφωσης: ειδοποιεί μόνο για ΝΕΑ ευρήματα υψηλής/κρίσιμης σοβαρότητας. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const orgs = await db.select().from(organizations);
  const results: { orgId: string; score: number; notified: number }[] = [];

  for (const org of orgs) {
    const report = await riskReport(db, org);
    const previous = await riskHistory(db, org.id, 7);
    const lastBefore = previous.filter((p) => p.day < report.checkedAt.slice(0, 10)).at(-1);
    let known: string[] = [];
    try {
      known = lastBefore ? (JSON.parse(lastBefore.codesJson) as string[]) : [];
    } catch {
      known = [];
    }
    await saveRiskSnapshot(db, org.id, report);

    const fresh = report.findings.filter((f) => (f.severity === "critical" || f.severity === "high") && !known.includes(f.code));
    for (const f of fresh) {
      await notify(db, {
        orgId: org.id,
        type: "compliance_risk",
        title: `Κίνδυνος συμμόρφωσης: ${f.title}`,
        body: `${f.count} εγγραφές. ${f.why} (${f.legal}). Σκορ συμμόρφωσης: ${report.score}/100.`,
        link: "/risks",
      });
    }
    results.push({ orgId: org.id, score: report.score, notified: fresh.length });
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), orgs: results });
}

export async function GET(req: Request) {
  return POST(req);
}
