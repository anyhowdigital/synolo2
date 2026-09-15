import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { BulkOcrUploader } from "@/components/expenses/bulk-ocr-uploader";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Μαζικό OCR αποδείξεων πελάτη" };

export default async function OfficeClientOcrPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const client = await firmClient(db, firm, orgId);
  if (!client || client.accessLevel === "read") notFound();

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/office/clients/${orgId}`}>
          <ArrowLeft data-icon="inline-start" /> {client.org.name}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Μαζικό OCR αποδείξεων · {client.org.name}</h1>
        <p className="text-sm text-muted-foreground">Ανεβάστε έως 30 αποδείξεις του πελάτη. Καταχωρούνται πάντα ως προσχέδια στα έξοδά του για έλεγχο.</p>
      </div>
      <BulkOcrUploader orgId={orgId} />
    </div>
  );
}
