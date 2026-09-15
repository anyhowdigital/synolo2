import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BulkOcrUploader } from "@/components/expenses/bulk-ocr-uploader";

export const metadata = { title: "Μαζικό OCR αποδείξεων" };

export default async function BulkOcrPage() {
  const db = await getDb();
  await requireContext(db);
  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/expenses">
            <ArrowLeft data-icon="inline-start" /> Έξοδα & Αγορές
          </Link>
        </Button>
      </div>
      <PageHeader title="Μαζικό OCR αποδείξεων" description="Ανεβάστε πολλές αποδείξεις μαζί και το AI τις καταχωρεί ως προσχέδια εξόδων με προμηθευτή, ΑΦΜ, ΦΠΑ και προτεινόμενο χαρακτηρισμό." />
      <BulkOcrUploader />
    </>
  );
}
