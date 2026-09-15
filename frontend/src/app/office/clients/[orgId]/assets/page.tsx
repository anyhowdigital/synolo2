import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { assetSchedule } from "@/lib/services/fixed-assets";
import { AssetsPanel } from "@/components/office/assets-panel";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function OfficeAssetsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ month?: string }> }) {
  const { orgId } = await params;
  const { month: m } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string) : new Date().toISOString().slice(0, 7);

  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();

  const rows = await assetSchedule(db, orgId, month);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href={`/office/clients/${orgId}`}>
            <ArrowLeft data-icon="inline-start" /> {client.org.name}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Πάγια & αποσβέσεις</h1>
        <p className="text-sm text-muted-foreground">Μητρώο παγίων με σταθερή μέθοδο απόσβεσης και αυτόματα λογιστικά άρθρα ανά μήνα (66 / λογαριασμός παγίου).</p>
      </div>

      <AssetsPanel
        orgId={orgId}
        month={month}
        readOnly={client.accessLevel === "read" || client.accessLevel === "mydata"}
        rows={rows.map((r) => ({
          id: r.asset.id,
          name: r.asset.name,
          category: r.asset.category,
          accountCode: r.asset.accountCode,
          acquiredAt: r.asset.acquiredAt,
          cost: r.asset.cost,
          usefulYears: r.asset.usefulYears,
          monthly: r.monthly,
          accumulated: r.accumulated,
          bookValue: r.bookValue,
        }))}
      />
    </div>
  );
}
