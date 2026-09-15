import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { orgWatch } from "@/lib/services/org-watch";
import { sendMail } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Εβδομαδιαίο digest για λογιστές: ποιες επιχειρήσεις χρειάζονται προσοχή. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const accountants = await db.select({ userId: memberships.userId, orgId: memberships.orgId }).from(memberships).where(eq(memberships.role, "accountant"));
  if (!accountants.length) return NextResponse.json({ ok: true, sent: 0 });

  const byUser = new Map<string, string[]>();
  for (const a of accountants) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a.orgId]);

  const userRows = await db.select().from(users).where(inArray(users.id, [...byUser.keys()]));
  let sent = 0;
  const results: { email: string; orgs: number; attention: number }[] = [];

  for (const u of userRows) {
    const orgIds = byUser.get(u.id) ?? [];
    if (!orgIds.length) continue;
    const orgRows = await db.select().from(organizations).where(inArray(organizations.id, orgIds));
    const watches = (await Promise.all(orgRows.map((o) => orgWatch(db, o)))).sort((a, b) => b.priority - a.priority);
    const attention = watches.filter((w) => w.level !== "green" || w.anomalies.some((a) => a.severity === "high"));
    if (!attention.length) {
      results.push({ email: u.email, orgs: watches.length, attention: 0 });
      continue;
    }

    const rows = attention
      .map(
        (w) => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${w.orgName}</strong></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${w.score}/100${w.trend ? ` (${w.trend > 0 ? "+" : ""}${w.trend})` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${w.criticalCount} κρίσιμα · ${w.anomalies.length} ανωμαλίες</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${w.topFindings[0]?.title ?? "—"}${w.anomalies[0] ? `<br><em>${w.anomalies[0].title}</em>` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${w.nextDeadline ? `${w.nextDeadline.label} σε ${w.nextDeadline.daysLeft} ημ.` : "—"}</td>
    </tr>`,
      )
      .join("");

    await sendMail(db, {
      orgId: attention[0].orgId,
      to: u.email,
      subject: `Εβδομαδιαία προειδοποίηση: ${attention.length} επιχειρήσεις χρειάζονται προσοχή`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#171717">
        <h2 style="margin:0 0 4px">Έγκαιρη προειδοποίηση πελατολογίου</h2>
        <p style="color:#525252;margin:0 0 16px">${attention.length} από ${watches.length} επιχειρήσεις εμφανίζουν κίνδυνο συμμόρφωσης ή στατιστική ανωμαλία. Ταξινομημένες κατά προτεραιότητα.</p>
        <table style="border-collapse:collapse;width:100%">
          <thead><tr style="text-align:left;background:#f5f5f5">
            <th style="padding:6px 8px">Επιχείρηση</th><th style="padding:6px 8px">Σκορ</th><th style="padding:6px 8px">Ευρήματα</th><th style="padding:6px 8px">Κυριότερο θέμα</th><th style="padding:6px 8px">Προθεσμία</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#737373;font-size:12px;margin-top:16px">Αυτόματο μήνυμα από το Cockpit Λογιστή · Σύνολο ERP</p>
      </div>`,
      relatedEntity: "accountant_digest",
      relatedId: u.id,
    });
    sent++;
    results.push({ email: u.email, orgs: watches.length, attention: attention.length });
  }

  return NextResponse.json({ ok: true, sent, results, ranAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  return POST(req);
}
