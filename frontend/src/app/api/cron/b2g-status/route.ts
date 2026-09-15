import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, organizations } from "@/db/schema";
import { refreshB2GStatus } from "@/lib/services/b2g";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { notify } from "@/lib/services/notifications";
import { SYSTEM_ACTOR } from "@/lib/services/actor";

// Cron endpoints must ack 2xx immediately; enqueue/background the actual work.

function authorized(req: Request): boolean {
  const expected = process.env.WEBHOOK_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!expected) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`;
}

/** Ωριαίος έλεγχος κατάστασης των παραστατικών που έχουν σταλεί στο Δημόσιο. */
async function run() {
  const db = await getDb();
  const orgs = await db.select().from(organizations).where(eq(organizations.b2gEnabled, true));
  const results: Array<{ orgId: string; checked: number; accepted: number; rejected: number }> = [];
  for (const org of orgs) {
    const pending = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), inArray(invoices.b2gStatus, ["pending", "sent"])))
      .limit(50);
    let accepted = 0;
    let rejected = 0;
    for (const inv of pending) {
      try {
        const res = await refreshB2GStatus(db, org, inv, SYSTEM_ACTOR);
        if (res.status === "accepted") accepted++;
        if (res.status === "rejected") {
          rejected++;
          await notify(db, {
            orgId: org.id,
            type: "b2g_rejected",
            title: `Απόρριψη από φορέα: ${invoiceDisplayNumber(inv)}`,
            body: res.message ?? "Ο φορέας ή ο πάροχος PEPPOL απέρριψε το παραστατικό. Δείτε την κάρτα «Τιμολόγηση Δημοσίου».",
            link: `/invoices/${inv.id}`,
          });
        }
      } catch (err) {
        await notify(db, {
          orgId: org.id,
          type: "b2g_rejected",
          title: `Σφάλμα ελέγχου κατάστασης B2G: ${invoiceDisplayNumber(inv)}`,
          body: (err instanceof Error ? err.message : String(err)).slice(0, 600),
          link: `/invoices/${inv.id}`,
        });
      }
    }
    results.push({ orgId: org.id, checked: pending.length, accepted, rejected });
  }
  return results;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const results = await run();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), orgs: results });
}

export async function GET(req: Request) {
  return POST(req);
}
