import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmFeeCharges, firmFees } from "@/db/schema";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { FeesPanel } from "@/components/office/fees-panel";

export const dynamic = "force-dynamic";

export default async function OfficeFeesPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);

  const [fees, charges] = await Promise.all([
    db.select().from(firmFees).where(eq(firmFees.firmUserId, firm.firmUserId)),
    db.select().from(firmFeeCharges).where(eq(firmFeeCharges.firmUserId, firm.firmUserId)).orderBy(desc(firmFeeCharges.month)),
  ]);

  return (
    <FeesPanel
      month={new Date().toISOString().slice(0, 7)}
      clients={clients.map((c) => {
        const fee = fees.find((f) => f.orgId === c.org.id);
        return { orgId: c.org.id, name: c.org.name, afm: c.org.afm, amount: fee?.amount ?? 0, cadence: fee?.cadence ?? "monthly", note: fee?.note ?? "" };
      })}
      charges={charges.map((ch) => ({
        id: ch.id,
        orgId: ch.orgId,
        orgName: clients.find((c) => c.org.id === ch.orgId)?.org.name ?? "—",
        month: ch.month,
        amount: ch.amount,
        status: ch.status,
      }))}
    />
  );
}
