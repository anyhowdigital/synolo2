import { notFound } from "next/navigation";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { getDb } from "@/db";
import { verifyDocument } from "@/lib/services/doc-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Επαλήθευση εγγράφου" };

const KIND_LABELS: Record<string, string> = {
  closing: "Μηνιαίο κλείσιμο",
  balance: "Ισολογισμός",
  trial: "Ισοζύγιο",
  payroll: "Απόδειξη αποδοχών",
  apd: "ΑΠΔ",
  fmy: "ΦΜΥ",
  ergani: "ΕΡΓΑΝΗ",
  other: "Έγγραφο",
};

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = await getDb();
  const doc = await verifyDocument(db, decodeURIComponent(code));
  if (!doc) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card data-testid="verify-card">
        <CardHeader>
          <div className="flex items-center gap-3">
            {doc.revoked ? <ShieldAlert className="size-6 text-destructive" /> : <BadgeCheck className="size-6 text-emerald-600" />}
            <CardTitle className="text-lg">{doc.revoked ? "Το έγγραφο έχει ανακληθεί" : "Γνήσιο έγγραφο"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            ["Κωδικός επαλήθευσης", doc.code],
            ["Τύπος", KIND_LABELS[doc.kind] ?? doc.kind],
            ["Τίτλος", doc.title],
            ["Περίοδος", doc.period || "—"],
            ["Επιχείρηση", `${doc.orgName}${doc.orgAfm ? ` · ΑΦΜ ${doc.orgAfm}` : ""}`],
            ["Εκδόθηκε από", doc.issuedByName || "—"],
            ["Λογιστικό γραφείο", doc.firmName || "—"],
            ["Α.Μ. ΟΕΕ / άδεια", doc.regNo || "—"],
            ["Ημερομηνία έκδοσης", new Date(doc.createdAt).toLocaleString("el-GR")],
            ["Αρχείο", `${doc.fileName} · ${(doc.size / 1024).toFixed(0)} KB`],
          ].map(([l, v]) => (
            <div key={l} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
              <span className="text-muted-foreground">{l}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Ψηφιακό αποτύπωμα (SHA-256)</p>
            <p className="font-mono text-[11px] break-all" data-testid="verify-hash">
              {doc.hash}
            </p>
          </div>
          {doc.hasFile ? (
            <Button asChild size="sm" data-testid="verify-download">
              <a href={`/api/verify/${doc.code}`}>Κατέβασμα αντιγράφου</a>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Η σελίδα αυτή επιβεβαιώνει ότι το έγγραφο εκδόθηκε από την πλατφόρμα και δεν έχει αλλοιωθεί. Συγκρίνετε το αποτύπωμα SHA-256 του αρχείου σας με το παραπάνω.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
