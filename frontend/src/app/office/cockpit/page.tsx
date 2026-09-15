import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { Calendar, FileWarning } from "lucide-react";
import { getDb } from "@/db";
import { invoices, orgPins } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClients, WRITE_LEVELS } from "@/lib/services/firm";
import { collectFindings, countBySeverity } from "@/lib/services/office-findings";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { taxDeadlines } from "@/lib/services/compliance";
import { formatMoney } from "@/lib/invoice/totals";
import { EarlyWarningPanel } from "@/components/accountant/early-warning-panel";
import { MultiCompanyTools } from "@/components/accountant/multi-company-tools";
import { FindingsList } from "@/components/office/findings-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cockpit · Κίνδυνοι & μαζικές" };

export default async function OfficeCockpitPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const { findings, watches } = await collectFindings(db, clients, (c) => WRITE_LEVELS.includes(c.accessLevel));
  const counts = countBySeverity(findings);

  const summaries = await Promise.all(
    clients.map(async (c) => {
      const [openInvoices, pending] = await Promise.all([
        db.select().from(invoices).where(and(eq(invoices.orgId, c.org.id), inArray(invoices.status, ["issued", "partially_paid"]))),
        listPendingTransmissions(db, c.org.id),
      ]);
      const mine = findings.filter((f) => f.orgId === c.org.id);
      return {
        c,
        receivables: +openInvoices.reduce((s, i) => s + Math.max(0, i.totalGrossValue - i.paidAmount), 0).toFixed(2),
        openInvoiceCount: openInvoices.length,
        pending: pending.length,
        unclassified: mine.filter((f) => f.code === "expenses_unclassified").length,
        rejected: mine.filter((f) => f.code === "mydata_rejected").length,
        high: mine.filter((f) => f.severity === "high").length,
      };
    }),
  );
  const totalReceivables = summaries.reduce((s, r) => s + r.receivables, 0);
  const totalRejected = summaries.reduce((s, r) => s + r.rejected, 0);
  const nextDl = clients
    .flatMap((c) => taxDeadlines(c.org).items.filter((d) => d.days >= 0).map((d) => ({ ...d, org: c.org.name })))
    .sort((a, b) => a.days - b.days)[0];

  const pins = await db.select().from(orgPins).where(eq(orgPins.userId, user.id));
  const pinMap = new Map(pins.map((p) => [p.orgId, p]));
  const sortedWatches = [...watches.values()].sort((a, b) => b.priority - a.priority);
  const multiOrgRows = sortedWatches.map((w) => {
    const s = summaries.find((x) => x.c.org.id === w.orgId);
    return {
      id: w.orgId,
      name: w.orgName,
      afm: s?.c.org.afm ?? "",
      pinned: pinMap.get(w.orgId)?.pinned ?? false,
      lastOpenedAt: pinMap.get(w.orgId)?.lastOpenedAt ?? null,
      score: w.score,
      pendingMydata: s?.pending ?? 0,
      unclassified: s?.unclassified ?? 0,
      findings: findings.filter((f) => f.orgId === w.orgId && f.severity === "high").slice(0, 5).map((f) => ({ orgId: f.orgId, code: f.code, title: f.title, severity: f.severity })),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cockpit — Κίνδυνοι & μαζικές ενέργειες</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} πελάτες γραφείου · {counts.high} κρίσιμα θέματα από την κοινή πηγή ευρημάτων (ίδια με «Ειδοποιήσεις» και «Λάθη & προσοχή»).
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/office/inbox">Όλα τα θέματα →</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/office/tasks">Εκκρεμότητες →</Link></Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Πελάτες</CardDescription><CardTitle className="text-2xl">{clients.length}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Συνδεδεμένοι με το γραφείο</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Συνολικές απαιτήσεις</CardDescription><CardTitle className="text-2xl tabular-nums">{formatMoney(totalReceivables)}</CardTitle></CardHeader>
        </Card>
        <Card className={totalRejected > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/30" : ""}>
          <CardHeader className="pb-2"><CardDescription>Απορρίψεις myDATA</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><FileWarning className="size-5 text-red-600" /> {totalRejected}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Παραστατικά προς διόρθωση</CardContent>
        </Card>
        <Card className={nextDl && nextDl.days <= 7 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : ""}>
          <CardHeader className="pb-2"><CardDescription>Επόμενη προθεσμία</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><Calendar className="size-5" /> {nextDl ? (nextDl.days > 0 ? `${nextDl.days} ημέρες` : "Σήμερα") : "—"}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{nextDl ? `${nextDl.title} · ${nextDl.org}` : "Καμία επερχόμενη"}</CardContent>
        </Card>
      </div>

      <MultiCompanyTools orgs={multiOrgRows} />

      <EarlyWarningPanel watches={sortedWatches} />

      <Card data-testid="cockpit-critical">
        <CardHeader>
          <CardTitle className="text-base">Κρίσιμα θέματα τώρα</CardTitle>
          <CardDescription>Τα {Math.min(10, counts.high)} πρώτα κρίσιμα από όλους τους πελάτες, με απευθείας διόρθωση.</CardDescription>
        </CardHeader>
        <CardContent>
          <FindingsList findings={findings.filter((f) => f.severity === "high").slice(0, 10)} emptyText="Κανένα κρίσιμο θέμα." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Επισκόπηση ανά πελάτη</CardTitle>
          <CardDescription>«Είσοδος» ανοίγει το πάνελ της επιχείρησης με ενεργό τον σωστό οργανισμό.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Πελάτης</TableHead>
                <TableHead>ΑΦΜ</TableHead>
                <TableHead>Πρόσβαση</TableHead>
                <TableHead className="text-right">Απαιτήσεις</TableHead>
                <TableHead className="text-center">Ανοιχτά</TableHead>
                <TableHead className="text-center">Εκκρεμή myDATA</TableHead>
                <TableHead className="text-center">Κρίσιμα</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Δεν υπάρχουν συνδεδεμένοι πελάτες.</TableCell></TableRow>
              ) : summaries.map((s) => (
                <TableRow key={s.c.org.id} data-testid={`cockpit-row-${s.c.org.id}`}>
                  <TableCell><Link href={`/office/clients/${s.c.org.id}`} className="font-medium hover:underline">{s.c.org.name}</Link></TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{s.c.org.afm}</TableCell>
                  <TableCell><Badge variant="outline">{s.c.accessLevel}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(s.receivables)}</TableCell>
                  <TableCell className="text-center">{s.openInvoiceCount}</TableCell>
                  <TableCell className="text-center">{s.pending > 0 ? <Badge className="bg-amber-100 text-amber-800">{s.pending}</Badge> : "—"}</TableCell>
                  <TableCell className="text-center">{s.high > 0 ? <Badge variant="destructive">{s.high}</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline" data-testid={`cockpit-open-${s.c.org.id}`}>
                      <Link href={`/office/open?org=${s.c.org.id}&to=${encodeURIComponent("/dashboard")}`}>Είσοδος →</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
