import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { opportunities, customers } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { OpportunityForm } from "@/components/crm/opportunity-form";

export default async function EditOppPage({ params }: { params?: Promise<{ id?: string }> }) {
  const id = (params ? (await params).id : undefined) ?? "new";
  const db = await getDb();
  const { org } = await requireContext(db);
  const isNew = id === "new";
  const opp = isNew ? null : await db.query.opportunities.findFirst({ where: and(eq(opportunities.id, id), eq(opportunities.orgId, org.id)) });
  if (!isNew && !opp) notFound();
  const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.orgId, org.id)).orderBy(desc(customers.createdAt));
  return (
    <>
      <PageHeader title={isNew ? "Νέα ευκαιρία" : `Ευκαιρία: ${opp!.title}`}>
        <Button asChild variant="ghost"><Link href="/crm"><ArrowLeft className="size-4" /> Επιστροφή</Link></Button>
      </PageHeader>
      <OpportunityForm opportunity={opp ?? undefined} customers={custs} />
    </>
  );
}
