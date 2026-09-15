import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm } from "@/lib/services/firm";
import { buildWidgets, WIDGETS } from "@/lib/services/office-widgets";
import { loadDashboard } from "@/app/actions/office-dashboard";
import { OfficeDashboardGrid } from "@/components/office/office-dashboard-grid";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function OfficeOverviewPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const [clients, prefs] = await Promise.all([firmClients(db, firm), loadDashboard(user.id)]);
  const data = await buildWidgets(db, firm, clients, prefs.map((p) => p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="office-overview-title">
            {firm.firmName || "Λογιστικό γραφείο"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} συνεργαζόμενες επιχειρήσεις · προσωπικό dashboard με ό,τι παρακολουθείτε καθημερινά.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/office/clients">Πελάτες & συνδέσεις</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/office/assistant">AI πλάνο ημέρας</Link>
          </Button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Δεν έχετε ακόμη συνδεδεμένους πελάτες.{" "}
            <Link href="/office/clients" className="font-medium underline">
              Συνδέστε την πρώτη επιχείρηση
            </Link>{" "}
            με 6ψήφιο κωδικό ή αίτημα ΑΦΜ.
          </p>
        </div>
      ) : (
        <OfficeDashboardGrid prefs={prefs} data={data} catalog={WIDGETS} />
      )}
    </div>
  );
}
