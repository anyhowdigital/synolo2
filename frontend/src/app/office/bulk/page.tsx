import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm, WRITE_LEVELS } from "@/lib/services/firm";
import { OfficeBulkTools } from "@/components/office/bulk-tools";
import { currentMonth } from "@/lib/services/monthly-close";

export const dynamic = "force-dynamic";
export const metadata = { title: "Μαζικές ενέργειες πελατών" };

export default async function OfficeBulkPage({ searchParams }: { searchParams: Promise<{ org?: string; action?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const preselect = clients.filter((c) => c.org.id === sp.org && WRITE_LEVELS.includes(c.accessLevel)).map((c) => c.org.id);

  return (
    <OfficeBulkTools
      month={currentMonth()}
      initialSelected={preselect}
      focusAction={sp.action === "transmit" || sp.action === "classify" ? sp.action : undefined}
      clients={clients.map((c) => ({ orgId: c.org.id, name: c.org.name, afm: c.org.afm, readOnly: !WRITE_LEVELS.includes(c.accessLevel) }))}
    />
  );
}
