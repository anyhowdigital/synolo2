import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { getCurrentOrg } from "@/lib/services/org";
import { docRequests } from "@/db/schema";
import { DocRequestPanel } from "@/components/accountant/doc-request-panel";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const rows = await db.select().from(docRequests).where(eq(docRequests.orgId, org.id)).orderBy(desc(docRequests.createdAt));

  return (
    <>
      <PageHeader title="Αιτήματα εγγράφων" description={`${org.name} · Στείλτε στον πελάτη σύνδεσμο ανεβάσματος χωρίς κωδικούς, με λίστα «τι λείπει». Ο σύνδεσμος λήγει σε 7 ημέρες.`} />
      <DocRequestPanel
        requests={rows.map((r) => ({
          id: r.id,
          token: r.token,
          title: r.title,
          status: r.status,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
          items: JSON.parse(r.itemsJson) as { label: string; uploaded: boolean }[],
        }))}
      />
    </>
  );
}
