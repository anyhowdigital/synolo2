import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { defsFor } from "@/lib/services/custom-fields";
import { loadFormExtras } from "@/lib/services/dimensions";

export const metadata = { title: "Επεξεργασία πελάτη" };

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const db = await getDb();
  const { org, role } = await requireContext(db);
  if (!can(role, "write")) redirect(`/customers/${id}`);
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.orgId, org.id)) });
  if (!customer) notFound();
  const extras = await loadFormExtras(db, org.id, "customer");
  return (
    <>
      <PageHeader title={`Επεξεργασία: ${customer.name}`} />
      <CustomerForm customer={customer} extras={{ ...extras, defs: defsFor(org.customFieldDefsJson, "customer") }} />
    </>
  );
}
