import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { opportunities, customers } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/crm/kanban-board";

export const metadata = { title: "CRM · Pipeline" };

export default async function CrmPage() {
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const opps = await db.select().from(opportunities).where(eq(opportunities.orgId, org.id)).orderBy(desc(opportunities.updatedAt));
  const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.orgId, org.id));
  return (
    <>
      <PageHeader title="Ευκαιρίες πωλήσεων" description="Παρακολουθήστε τις ευκαιρίες πωλήσεων σε στάδια. Σύρετε τις κάρτες για να αλλάξετε στάδιο.">
        {canWrite ? (
          <Button asChild data-testid="new-opp-btn">
            <Link href="/crm/new"><Plus data-icon="inline-start" /> Νέα ευκαιρία</Link>
          </Button>
        ) : null}
      </PageHeader>
      <KanbanBoard
        opportunities={opps.map((o) => ({
          id: o.id, title: o.title, stage: o.stage, amount: o.amount,
          probability: o.probability, customerName: o.customerName,
          expectedCloseDate: o.expectedCloseDate, ownerName: o.ownerName,
        }))}
        canWrite={canWrite}
      />
    </>
  );
}
