import { redirect } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { currentSuperAdmin } from "@/lib/admin/auth";
import { adminLogoutAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  set_plan: "Αλλαγή πλάνου",
  freeze: "Πάγωμα",
  unfreeze: "Ενεργοποίηση",
  set_overrides: "Overrides οργανισμού",
  save_plan_overrides: "Overrides πλάνων",
  set_trial: "Ενημέρωση trial",
  impersonate: "Είσοδος ως χρήστης",
};

export default async function AdminAuditPage() {
  const admin = await currentSuperAdmin();
  if (!admin) redirect("/admin/login");
  const db = await getDb();
  const rows = await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(100);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="admin-audit-title">Ιστορικό ενεργειών</h1>
          <p className="text-sm text-muted-foreground">Οι τελευταίες 100 ενέργειες super-admin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="h-9 rounded-lg border px-4 text-sm leading-9" data-testid="admin-nav-orgs">Οργανισμοί</Link>
          <form action={adminLogoutAction}>
            <button className="h-9 rounded-lg border px-4 text-sm" data-testid="admin-logout-btn">Αποσύνδεση</button>
          </form>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Ημ/νία</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Ενέργεια</th>
              <th className="p-3">Οργανισμός</th>
              <th className="p-3">Λεπτομέρεια</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground" data-testid="admin-audit-empty">Καμία ενέργεια ακόμη.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t align-top" data-testid={`admin-audit-${r.id}`}>
                  <td className="p-3 whitespace-nowrap tabular-nums text-muted-foreground">{r.createdAt.slice(0, 19).replace("T", " ")}</td>
                  <td className="p-3">{r.adminEmail}</td>
                  <td className="p-3">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="p-3">{r.targetOrgId ? <Link className="underline" href={`/admin/orgs/${r.targetOrgId}`}>{r.targetOrgId.slice(0, 8)}…</Link> : "—"}</td>
                  <td className="p-3 max-w-md truncate text-xs text-muted-foreground">{r.detail || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
