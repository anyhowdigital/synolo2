import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { getInvoiceWithLines } from "@/lib/services/invoices";
import { loadEditorData } from "@/lib/services/editor-data";
import { PageHeader } from "@/components/page-header";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";

export const metadata = { title: "Επεξεργασία πρόχειρου" };

export default async function EditInvoicePage({ params }: PageProps<"/invoices/[id]/edit">) {
  const { id } = await params;
  const db = await getDb();
  const { org, role } = await requireContext(db);
  if (!can(role, "write")) redirect("/invoices");
  const invoice = await getInvoiceWithLines(db, org.id, id);
  if (!invoice) notFound();
  if (invoice.status !== "draft") redirect(`/invoices/${id}`);
  const data = await loadEditorData(db, org.id, org.customFieldDefsJson, org.salesChannels);

  return (
    <>
      <PageHeader title="Επεξεργασία πρόχειρου" description="Το παραστατικό δεν έχει εκδοθεί ακόμη και μπορεί να τροποποιηθεί ελεύθερα." />
      <InvoiceEditor org={org} {...data} invoice={invoice} />
    </>
  );
}
