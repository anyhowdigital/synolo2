import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { memberships, users } from "@/db/schema";
import { getCurrentUser, setActiveOrgCookie } from "@/lib/auth/session";
import { resolveFirm, firmClient } from "@/lib/services/firm";

export const dynamic = "force-dynamic";

/** Deep link λογιστή: ανοίγει σελίδα της επιχείρησης-πελάτη με ενεργό τον σωστό οργανισμό. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const to = url.searchParams.get("to") ?? "/dashboard";
  const safeTo = to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard";
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/office/open${url.search}`)}`);
  const firm = await resolveFirm(db, user.id);
  const client = firm ? await firmClient(db, firm, orgId) : null;
  const m = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, user.id), eq(memberships.orgId, orgId)) });
  if (!client && !m) redirect("/office/clients?e=noaccess");
  if (!m) redirect(`/office/clients/${orgId}`);
  await db.update(users).set({ lastOrgId: orgId }).where(eq(users.id, user.id));
  await setActiveOrgCookie(orgId);
  redirect(safeTo);
}
