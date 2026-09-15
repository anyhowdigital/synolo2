import { databaseConfigured, getDb } from "@/db";

export const dynamic = "force-dynamic";

/** Έλεγχος υγείας για monitoring/uptime: επιβεβαιώνει σύνδεση με τη βάση χωρίς να αποκαλύπτει δεδομένα. */
export async function GET() {
  const startedAt = Date.now();
  if (!databaseConfigured()) {
    return Response.json({ status: "error", database: "not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const db = await getDb();
    await db.query.organizations.findFirst({ columns: { id: true } });
    return Response.json(
      { status: "ok", database: "ok", latencyMs: Date.now() - startedAt, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.VERCEL_DEPLOYMENT_ID || "local" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json({ status: "error", database: "unreachable", message: (err as Error).message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
