import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, organizations, users } from "@/db/schema";
import { currentSuperAdmin } from "@/lib/admin/auth";
import { adminLogoutAction } from "@/app/actions/admin";
import { getPlan, planLabel } from "@/lib/billing/plans";
import { AdminOrgRow } from "@/components/admin/admin-org-row";

export const dynamic = "force-dynamic";

const PLAN_FILTER = [
  { id: "", label: "Όλα τα πλάνα" },
  { id: "trial", label: "Δοκιμαστική" },
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];
const STATUS_FILTER = [
  { id: "", label: "Όλες οι καταστάσεις" },
  { id: "trialing", label: "Δοκιμαστική" },
  { id: "active", label: "Ενεργή" },
  { id: "past_due", label: "Εκκρεμεί πληρωμή" },
  { id: "cancelled", label: "Ακυρωμένη" },
  { id: "frozen", label: "Παγωμένη" },
];

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-xl border p-4" data-testid={testid}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function AdminTenantsPage({ searchParams }: PageProps<"/admin">) {
  const admin = await currentSuperAdmin();
  if (!admin) redirect("/admin/login");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const planF = typeof sp.plan === "string" ? sp.plan : "";
  const statusF = typeof sp.status === "string" ? sp.status : "";
  const db = await getDb();

  const conds: SQL[] = [];
  if (q) conds.push(or(like(organizations.name, `%${q}%`), like(organizations.afm, `%${q}%`)) as SQL);
  if (planF) conds.push(eq(organizations.plan, planF));
  if (statusF) conds.push(eq(organizations.planStatus, statusF));
  const where = conds.length ? and(...conds) : undefined;

  const orgs = await db.select().from(organizations).where(where).orderBy(organizations.name);
  const allOrgs = where ? await db.select().from(organizations) : orgs;

  const [{ n: userCount }] = await db.select({ n: sql<number>`count(*)` }).from(users);
  const [{ n: invCount }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(and(ne(invoices.status, "draft"), ne(invoices.invoiceType, "QUOTE")));

  let mrr = 0;
  const byStatus: Record<string, number> = {};
  for (const o of allOrgs) {
    byStatus[o.planStatus] = (byStatus[o.planStatus] ?? 0) + 1;
    if (o.planStatus === "active") {
      const pl = getPlan(o.plan);
      if (pl) mrr += o.planInterval === "yearly" ? pl.yearlyPrice / 12 : pl.monthlyPrice;
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="admin-title">Οργανισμοί ({allOrgs.length})</h1>
          <p className="text-sm text-muted-foreground">Super-admin: {admin}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/plans" className="h-9 rounded-lg border px-4 text-sm leading-9" data-testid="admin-nav-plans">Πλάνα &amp; δυνατότητες</Link>
          <Link href="/admin/audit" className="h-9 rounded-lg border px-4 text-sm leading-9" data-testid="admin-nav-audit">Ιστορικό</Link>
          <form action={adminLogoutAction}>
            <button className="h-9 rounded-lg border px-4 text-sm" data-testid="admin-logout-btn">Αποσύνδεση</button>
          </form>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="admin-stats">
        <Stat label="Οργανισμοί" value={String(allOrgs.length)} testid="stat-orgs" />
        <Stat label="Ενεργές συνδρομές" value={String(byStatus.active ?? 0)} testid="stat-active" />
        <Stat label="Σε δοκιμή" value={String(byStatus.trialing ?? 0)} testid="stat-trialing" />
        <Stat label="Χρήστες / Παραστατικά" value={`${Number(userCount)} / ${Number(invCount)}`} testid="stat-users" />
        <Stat label="Εκτ. MRR" value={`${mrr.toFixed(0)} €`} testid="stat-mrr" />
      </div>

      <form method="get" action="/admin" className="flex flex-wrap items-center gap-2" data-testid="admin-filter-form">
        <input name="q" defaultValue={q} placeholder="Αναζήτηση επωνυμίας / ΑΦΜ" className="h-9 w-64 rounded-lg border bg-background px-3 text-sm" data-testid="admin-filter-q" />
        <select name="plan" defaultValue={planF} className="h-9 rounded-lg border bg-background px-2 text-sm" data-testid="admin-filter-plan">
          {PLAN_FILTER.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select name="status" defaultValue={statusF} className="h-9 rounded-lg border bg-background px-2 text-sm" data-testid="admin-filter-status">
          {STATUS_FILTER.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="admin-filter-submit">Φιλτράρισμα</button>
        <Link href="/admin" className="h-9 rounded-lg border px-4 text-sm leading-9" data-testid="admin-filter-clear">Καθαρισμός</Link>
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Επωνυμία</th>
              <th className="p-3">ΑΦΜ</th>
              <th className="p-3">Πλάνο</th>
              <th className="p-3">Κατάσταση</th>
              <th className="p-3 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground" data-testid="admin-empty">Κανένας οργανισμός με αυτά τα κριτήρια.</td></tr>
            ) : (
              orgs.map((o) => (
                <AdminOrgRow key={o.id} orgId={o.id} name={o.name} afm={o.afm ?? ""} plan={o.plan} planLabel={planLabel(o.plan)} status={o.planStatus} overridesJson={o.overridesJson ?? "{}"} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
