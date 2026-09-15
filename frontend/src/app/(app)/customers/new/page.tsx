import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/components/customers/customer-form";
import { defsFor } from "@/lib/services/custom-fields";
import { loadFormExtras } from "@/lib/services/dimensions";

export const metadata = { title: "Νέος πελάτης" };

export default async function NewCustomerPage() {
  const db = await getDb();
  const { org, role } = await requireContext(db);
  if (!can(role, "write")) redirect("/customers");
  const extras = await loadFormExtras(db, org.id, "customer");
  return (
    <>
      <PageHeader title="Νέος πελάτης" description="Το ΑΦΜ ελέγχεται αυτόματα (modulo 11) για ελληνικές επιχειρήσεις." />
      <CustomerForm extras={{ ...extras, defs: defsFor(org.customFieldDefsJson, "customer") }} />
    </>
  );
}
