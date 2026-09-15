import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm } from "@/lib/services/firm";
import { listDocuments } from "@/lib/services/doc-registry";
import { accountantProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignatureSettings } from "@/components/office/signature-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Αυθεντικοποιημένα έγγραφα" };

export default async function OfficeDocsRegistryPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const docs = await listDocuments(
    db,
    clients.map((c) => c.org.id),
  );
  const profile = await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, firm.firmUserId) });
  const names = new Map(clients.map((c) => [c.org.id, c.org.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Αυθεντικοποιημένα έγγραφα</h1>
        <p className="text-sm text-muted-foreground">Κάθε έγγραφο που εκδίδετε παίρνει μοναδικό κωδικό, ψηφιακό αποτύπωμα SHA-256 και δημόσια σελίδα επαλήθευσης με τα στοιχεία σας.</p>
      </div>

      {firm.role === "owner" ? <SignatureSettings signatureName={profile?.signatureName ?? ""} regNo={profile?.regNo ?? ""} stampDataUrl={profile?.stampDataUrl ?? ""} /> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Μητρώο εκδόσεων</CardTitle>
          <CardDescription>{docs.length} έγγραφα</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="docs-registry-table">
            <TableHeader>
              <TableRow>
                <TableHead>Κωδικός</TableHead>
                <TableHead>Έγγραφο</TableHead>
                <TableHead>Πελάτης</TableHead>
                <TableHead>Περίοδος</TableHead>
                <TableHead>Έκδοση</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Δεν έχετε εκδώσει έγγραφα. Δημιουργήστε π.χ. PDF μηνιαίου κλεισίματος από το «Μηνιαίο κλείσιμο».
                  </TableCell>
                </TableRow>
              ) : (
                docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`/verify/${d.code}`} className="font-mono text-xs hover:underline" data-testid={`doc-verify-${d.code}`}>
                        {d.code}
                      </Link>
                      {d.revoked ? <Badge variant="destructive" className="ml-2">Ανακλήθηκε</Badge> : null}
                    </TableCell>
                    <TableCell>{d.title}</TableCell>
                    <TableCell>{names.get(d.orgId) ?? "—"}</TableCell>
                    <TableCell>{d.period || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("el-GR")}
                      {d.issuedByName ? ` · ${d.issuedByName}` : ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
