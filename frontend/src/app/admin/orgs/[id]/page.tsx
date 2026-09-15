import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, memberships, organizations, users } from "@/db/schema";
import { currentSuperAdmin } from "@/lib/admin/auth";
import { impersonateOrgAction, setOrgTrialFormAction } from "@/app/actions/admin";
import { planLabel } from "@/lib/billing/plans";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { AdminOrgOverrides } from "@/components/admin/admin-org-overrides";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  trialing: "Δοκιμαστική",
  active: "Ενεργή",
  past_due: "Εκκρεμεί πληρωμή",
  cancelled: "Ακυρωμένη",
  frozen: "Παγωμένη",
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export default async function AdminOrgDetailPage({ params }: PageProps<"/admin/orgs/[id]">) {
  const admin = await currentSuperAdmin();
  if (!admin) redirect("/admin/login");
  const { id } = await params;
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!org) redirect("/admin");

  const members = await db
    .select({ role: memberships.role, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, id));
  const [{ n: invCount }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(and(eq(invoices.orgId, id), ne(invoices.status, "draft"), ne(invoices.invoiceType, "QUOTE")));

  let initial: Record<string, unknown> = {};
  try {
    initial = org.overridesJson ? JSON.parse(org.overridesJson) : {};
  } catch {
    initial = {};
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="admin-detail-title">{org.name}</h1>
          <p className="text-sm text-muted-foreground">{org.afm ? `ΑΦΜ ${org.afm}` : "—"}</p>
        </div>
        <Link href="/admin" className="h-9 rounded-lg border px-4 text-sm leading-9" data-testid="admin-detail-back">← Οργανισμοί</Link>
      </div>

      <dl className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <Info label="Πλάνο" value={planLabel(org.plan)} />
        <Info label="Κατάσταση" value={STATUS_LABEL[org.planStatus] ?? org.planStatus} />
        <Info label="Παραστατικά (εκδοθέντα)" value={String(Number(invCount))} />
        <Info label="Δημιουργήθηκε" value={org.createdAt ? org.createdAt.slice(0, 10) : ""} />
        <Info label="Λήξη δοκιμαστικής" value={org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : "—"} />
        <Info label="Email χρέωσης" value={org.billingEmail ?? ""} />
      </dl>

      <div className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Χρήστες ({members.length})</h2>
        <ul className="space-y-1 text-sm" data-testid="admin-detail-users">
          {members.map((m) => (
            <li key={m.email} className="flex items-center justify-between">
              <span>{m.name} <span className="text-muted-foreground">· {m.email}</span></span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role as Role] ?? m.role}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form action={setOrgTrialFormAction} className="space-y-2 rounded-xl border p-4" data-testid="admin-trial-form">
          <h2 className="text-sm font-semibold">Δοκιμαστική περίοδος</h2>
          <input type="hidden" name="orgId" value={id} />
          <input type="date" name="trialEndsAt" defaultValue={org.trialEndsAt ? org.trialEndsAt.slice(0, 10) : ""} className="h-9 w-full rounded-lg border bg-background px-3 text-sm" data-testid="admin-trial-date" />
          <button className="h-9 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground" data-testid="admin-trial-save">Ενημέρωση λήξης</button>
        </form>

        <form action={impersonateOrgAction.bind(null, id)} className="space-y-2 rounded-xl border p-4" data-testid="admin-impersonate-form">
          <h2 className="text-sm font-semibold">Υποστήριξη</h2>
          <p className="text-xs text-muted-foreground">Είσοδος ως ιδιοκτήτης του οργανισμού για διερεύνηση προβλημάτων.</p>
          <button className="h-9 w-full rounded-lg border text-sm font-medium" data-testid="admin-impersonate-btn">Είσοδος ως χρήστης</button>
        </form>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Overrides δυνατοτήτων &amp; ορίων</h2>
        <AdminOrgOverrides orgId={id} initial={initial} />
      </div>
    </div>
  );
}
