import { redirect } from "next/navigation";
import Link from "next/link";
import { currentSuperAdmin } from "@/lib/admin/auth";
import { adminLogoutAction } from "@/app/actions/admin";
import { readPlatformOverrides } from "@/lib/billing/platform-settings";
import { planCapabilities, planInvoiceLimit, planUserLimit, type PlanId } from "@/lib/billing/plans";
import { PlanFlagsEditor, type PlanState } from "@/components/admin/plan-flags-editor";

export const dynamic = "force-dynamic";

const IDS: PlanId[] = ["trial", "starter", "pro", "business"];
const NAMES: Record<PlanId, string> = { trial: "Δοκιμαστική", starter: "Starter", pro: "Pro", business: "Business" };

export default async function AdminPlansPage() {
  const admin = await currentSuperAdmin();
  if (!admin) redirect("/admin/login");
  await readPlatformOverrides();

  const plans: PlanState[] = IDS.map((id) => ({
    id,
    name: NAMES[id],
    capabilities: planCapabilities(id),
    invoiceLimit: planInvoiceLimit(id),
    userLimit: planUserLimit(id),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="admin-plans-title">Πλάνα &amp; δυνατότητες</h1>
          <p className="text-sm text-muted-foreground">Επεξεργασία δυνατοτήτων και ορίων ανά πλάνο συνδρομής.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="h-9 rounded-lg border px-4 text-sm leading-9" data-testid="admin-nav-orgs">Οργανισμοί</Link>
          <form action={adminLogoutAction}>
            <button className="h-9 rounded-lg border px-4 text-sm" data-testid="admin-logout-btn">Αποσύνδεση</button>
          </form>
        </div>
      </div>
      <PlanFlagsEditor plans={plans} />
    </div>
  );
}
