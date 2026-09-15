import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { getInvoiceWithLines, linesToDraft } from "@/lib/services/invoices";
import { loadEditorData } from "@/lib/services/editor-data";
import { getDocumentType } from "@/lib/greek/document-types";
import { PageHeader } from "@/components/page-header";
import { InvoiceEditor, type EditorPrefill } from "@/components/invoices/invoice-editor";
import { AdvisorInsight } from "@/components/advisor/advisor-insight";

export const metadata = { title: "Νέο παραστατικό" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const sp = await searchParams;
  const defaultCustomerId = typeof sp.customer === "string" ? sp.customer : undefined;
  const creditOf = typeof sp.creditOf === "string" ? sp.creditOf : undefined;
  const wantKind = sp.kind === "quote" ? "quote" : sp.kind === "delivery" ? "delivery" : undefined;
  const db = await getDb();
  const { org, role } = await requireContext(db);
  if (!can(role, "write")) redirect("/invoices");
  const data = await loadEditorData(db, org.id, org.customFieldDefsJson, org.salesChannels);

  let prefill: EditorPrefill | undefined;
  let title = wantKind === "quote" ? "Νέα προσφορά" : wantKind === "delivery" ? "Νέο δελτίο αποστολής" : "Νέο παραστατικό";
  if (creditOf) {
    const original = await getInvoiceWithLines(db, org.id, creditOf);
    if (original && original.mydataStatus === "sent") {
      const origType = getDocumentType(original.invoiceType);
      const creditSeries = data.seriesList.find((s) => s.active && getDocumentType(s.invoiceType).credit && getDocumentType(s.invoiceType).retail === origType.retail);
      prefill = {
        seriesId: creditSeries?.id,
        customerId: original.customerId,
        correlatedInvoiceId: original.id,
        currency: original.currency,
        exchangeRate: original.exchangeRate,
        notes: `Πιστωτικό επί του ${original.seriesCode}-${original.number} (${original.issueDate}).`,
        lines: linesToDraft(original.lines),
      };
      title = `Πιστωτικό για ${original.seriesCode}-${original.number}`;
    }
  } else if (wantKind) {
    const s = data.seriesList.find((x) => x.active && getDocumentType(x.invoiceType).kind === wantKind);
    if (s) prefill = { seriesId: s.id };
  }

  return (
    <>
      <PageHeader title={title} description="Συμπληρώστε τα στοιχεία και εκδώστε ή αποθηκεύστε ως πρόχειρο." />
      <AdvisorInsight org={org} />
      <InvoiceEditor org={org} {...data} defaultCustomerId={defaultCustomerId} prefill={prefill} onlyKind={wantKind} />
    </>
  );
}
