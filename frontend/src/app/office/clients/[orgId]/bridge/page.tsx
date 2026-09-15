import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { PageHeader } from "@/components/page-header";
import { AccountingBridgeCard } from "@/components/accounting/accounting-bridge-card";
import { parseBridgeConfig, maskBridgeConfig } from "@/lib/accounting-bridge";

export const dynamic = "force-dynamic";

export default async function ClientBridgePage({ params }: PageProps<"/office/clients/[orgId]/bridge">) {
  const { orgId } = await params;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Γέφυρα λογιστικού — ${client.org.name}`}
        description="Εξαγωγή βιβλίων του πελάτη προς ελληνικά λογιστικά προγράμματα (Epsilon Net, SoftOne, γενική μορφή)."
      />
      <AccountingBridgeCard exportBase={`/api/office/accounting-bridge?org=${orgId}`} orgId={orgId} config={maskBridgeConfig(parseBridgeConfig(client.org.accountingBridgeJson))} />
    </div>
  );
}
