import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClients, WRITE_LEVELS } from "@/lib/services/firm";
import { collectFindings, countBySeverity, SOURCE_LABEL, type FindingSource } from "@/lib/services/office-findings";
import { FindingsList } from "@/components/office/findings-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ειδοποιήσεις γραφείου" };

const SOURCES = Object.keys(SOURCE_LABEL) as FindingSource[];

export default async function OfficeInboxPage({ searchParams }: { searchParams: Promise<{ source?: string; org?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const { findings } = await collectFindings(db, clients, (c) => WRITE_LEVELS.includes(c.accessLevel));
  const source = SOURCES.includes(sp.source as FindingSource) ? (sp.source as FindingSource) : null;
  const scoped = findings.filter((f) => (!source || f.source === source) && (!sp.org || f.orgId === sp.org));
  const counts = countBySeverity(findings);
  const bySource = new Map<FindingSource, number>();
  for (const f of findings) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);
  const qs = (s?: FindingSource | null) => `/office/inbox?${[s ? `source=${s}` : "", sp.org ? `org=${sp.org}` : ""].filter(Boolean).join("&")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ειδοποιήσεις γραφείου</h1>
          <p className="text-sm text-muted-foreground" data-testid="inbox-summary">
            {findings.length} θέματα σε {clients.length} πελάτες · {counts.high} κρίσιμα, {counts.medium} προσοχή. Ίδια πηγή ευρημάτων με «Λάθη & προσοχή» και Cockpit. Εβδομαδιαίο digest κάθε Δευτέρα 08:00.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/office/alerts">Ανά πελάτη →</Link></Button>
          <Button asChild variant="outline" size="sm" data-testid="inbox-assistant-link"><Link href="/office/assistant">AI πλάνο ημέρας</Link></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="inbox-source-filters">
        <Button asChild size="sm" variant={source ? "outline" : "default"}><Link href={qs(null)}>Όλα ({findings.length})</Link></Button>
        {SOURCES.filter((s) => bySource.get(s)).map((s) => (
          <Button key={s} asChild size="sm" variant={source === s ? "default" : "outline"} data-testid={`inbox-filter-${s}`}>
            <Link href={qs(s)}>{SOURCE_LABEL[s]} ({bySource.get(s)})</Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Θέματα προς ενέργεια</CardTitle>
          <CardDescription>«Διόρθωσέ το» ανοίγει τις μαζικές ενέργειες με προεπιλεγμένο τον πελάτη· «Άνοιγμα εγγραφής» μεταφέρει στην ίδια την εγγραφή της επιχείρησης.</CardDescription>
        </CardHeader>
        <CardContent data-testid="inbox-list">
          <FindingsList findings={scoped} emptyText="Κανένα ανοιχτό θέμα. Όλα τα βιβλία είναι ενήμερα." />
        </CardContent>
      </Card>
    </div>
  );
}
