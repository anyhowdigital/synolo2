import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { notify } from "@/lib/services/notifications";
import { TAX_RULES } from "@/lib/tax/knowledge-base";
import { listRuleReviews, decideRuleReview } from "@/lib/services/tax-advisor";

/**
 * Ετήσιος έλεγχος βάσης γνώσης Συμβούλου: υπενθύμιση στους χρήστες να επανεξετάσουν τους
 * φορολογικούς κανόνες (συντελεστές/όρια) μόλις ισχύσουν οι αλλαγές της νέας χρονιάς.
 * Human sign-off: οι κανόνες ενημερώνονται από φοροτεχνικό — το cron απλώς δημιουργεί το task.
 */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.WEBHOOK_CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const orgs = await db.select().from(organizations);
  const year = new Date().getFullYear();
  let notified = 0;
  for (const org of orgs) {
    await notify(db, {
      orgId: org.id,
      type: "tax_kb_review",
      title: `Ετήσιος έλεγχος φορολογικών κανόνων ${year}`,
      body: "Ελέγξτε με τον λογιστή σας τις νέες κλίμακες/όρια και επιβεβαιώστε τις ευκαιρίες του Συμβούλου για τη νέα χρονιά.",
      link: "/advisor",
    });
    notified++;
  }
  // Αυτόματη δημιουργία εκκρεμών review για κανόνες παλαιότερου έτους (human sign-off απαιτείται).
  const reviews = await listRuleReviews(db, year);
  let flagged = 0;
  for (const r of TAX_RULES) {
    if (!reviews.has(r.code) && r.taxYear < year) {
      await decideRuleReview(
        db,
        { ruleCode: r.code, status: "needs_change", note: `Αυτόματη σήμανση: ο κανόνας αφορά έτος ${r.taxYear} — επιβεβαιώστε ισχύ για ${year}.`, taxYear: year },
        { id: "system", name: "Αυτόματος έλεγχος" },
      );
      flagged++;
    }
  }
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), notified, flagged });
}

export async function GET(req: Request) {
  return POST(req);
}
