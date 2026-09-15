import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm, WRITE_LEVELS } from "@/lib/services/firm";
import { collectFindings } from "@/lib/services/office-findings";
import { FindingsList } from "@/components/office/findings-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Λάθη & προσοχή" };

export default async function OfficeAlertsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org: orgFilter } = await searchParams;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const scoped = orgFilter ? clients.filter((c) => c.org.id === orgFilter) : clients;
  const { findings } = await collectFindings(db, scoped, (c) => WRITE_LEVELS.includes(c.accessLevel));
  const books = findings.filter((f) => f.source === "books" || f.source === "mydata");
  const high = books.filter((a) => a.severity === "high").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Λάθη & προσοχή</h1>
          <p className="text-sm text-muted-foreground">
            Έλεγχος βιβλίων & myDATA ανά πελάτη: {books.length} ευρήματα, {high} κρίσιμα. Προθεσμίες, κίνδυνοι ΑΑΔΕ και εκκρεμότητες εμφανίζονται στις «Ειδοποιήσεις».
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={orgFilter ? `/office/inbox?org=${orgFilter}` : "/office/inbox"}>Όλα τα θέματα →</Link></Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant={orgFilter ? "outline" : "default"} size="sm">
          <Link href="/office/alerts">Όλοι οι πελάτες</Link>
        </Button>
        {clients.map((c) => (
          <Button key={c.org.id} asChild variant={orgFilter === c.org.id ? "default" : "outline"} size="sm">
            <Link href={`/office/alerts?org=${c.org.id}`}>{c.org.name}</Link>
          </Button>
        ))}
      </div>

      <div className="space-y-4" data-testid="office-alerts">
        {scoped.map((client) => {
          const alerts = books.filter((f) => f.orgId === client.org.id);
          return (
            <Card key={client.org.id} data-testid={`alerts-client-${client.org.id}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link href={`/office/clients/${client.org.id}`} className="hover:underline">{client.org.name}</Link>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={alerts.some((a) => a.severity === "high") ? "destructive" : alerts.length ? "secondary" : "outline"}>{alerts.length} ευρήματα</Badge>
                    {WRITE_LEVELS.includes(client.accessLevel) ? <Badge variant="outline">μπορείτε να διορθώσετε</Badge> : <Badge variant="outline">περιορισμένη πρόσβαση</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <FindingsList findings={alerts.slice(0, 12)} showClient={false} emptyText="Κανένα εύρημα — τα βιβλία είναι καθαρά." />
                {alerts.length > 12 ? <p className="mt-2 text-xs text-muted-foreground">+{alerts.length - 12} ακόμη — δείτε τα όλα στις <Link className="underline" href={`/office/inbox?org=${client.org.id}`}>Ειδοποιήσεις</Link>.</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
