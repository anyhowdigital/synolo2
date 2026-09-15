import Link from "next/link";
import { Lightbulb, FileText, Users } from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm } from "@/lib/services/firm";
import { firmTaxScan, advisorProductivity } from "@/lib/services/tax-advisor";
import { formatMoney } from "@/lib/invoice/totals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Σύμβουλος πελατών" };

export default async function OfficeAdvisorPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const { clients: scan, firmTotal } = await firmTaxScan(db, clients);
  const withBenefit = scan.filter((c) => c.totalBenefit > 0).length;
  const productivity = await advisorProductivity(db, firm, clients);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="office-advisor-title">Σύμβουλος πελατών</h1>
        <p className="text-sm text-muted-foreground">Σάρωση όλων των επιχειρήσεων για νόμιμες ευκαιρίες εξοικονόμησης φόρων & εισφορών.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Συνολικό δυνητικό όφελος</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-emerald-600 tabular-nums" data-testid="office-advisor-firm-total">~{formatMoney(firmTotal)}/έτος</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Πελάτες με ευκαιρία</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{withBenefit} / {scan.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Σύνολο επιχειρήσεων</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold tabular-nums">{scan.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-primary" /> Ευκαιρίες ανά πελάτη</CardTitle>
          <CardDescription>Ταξινομημένες κατά εκτιμώμενο όφελος. Άνοιγμα πελάτη για λεπτομέρειες.</CardDescription>
        </CardHeader>
        <CardContent>
          {scan.length === 0 ? (
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν συνδεδεμένοι πελάτες. <Link href="/office/clients" className="underline">Συνδέστε επιχειρήσεις</Link>.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Επιχείρηση</TableHead>
                  <TableHead>Κορυφαία ευκαιρία</TableHead>
                  <TableHead className="text-center">Πλήθος</TableHead>
                  <TableHead className="text-right">Όφελος/έτος</TableHead>
                  <TableHead className="text-right">Σύμβουλος</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scan.map((c) => (
                  <TableRow key={c.orgId} data-testid={`office-advisor-row-${c.orgId}`}>
                    <TableCell>
                      <Link href={`/office/clients/${c.orgId}`} className="font-medium underline-offset-2 hover:underline" data-testid={`office-advisor-open-${c.orgId}`}>{c.name}</Link>
                      <div className="text-xs text-muted-foreground">ΑΦΜ {c.afm || "—"}</div>
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      {c.top ? (
                        <>
                          <div className="text-sm">{c.top.title}</div>
                          <div className="text-xs text-muted-foreground">{c.top.legalBasis}</div>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{c.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.totalBenefit > 0 ? (
                        <span className="font-medium text-emerald-600">~{formatMoney(c.totalBenefit)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/office/clients/${c.orgId}/advisor`}
                        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
                        data-testid={`office-advisor-pdf-${c.orgId}`}
                      >
                        <FileText className="size-3.5" /> Πλάνο
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-4 text-primary" /> Παραγωγικότητα Συμβούλου</CardTitle>
          <CardDescription>Ανατεθειμένες & ολοκληρωμένες ευκαιρίες ανά συνεργάτη και κλειδωμένο όφελος.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Ανατεθειμένες</div>
              <div className="text-xl font-semibold tabular-nums" data-testid="advisor-prod-assigned">{productivity.totals.assigned}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Ολοκληρωμένες</div>
              <div className="text-xl font-semibold tabular-nums" data-testid="advisor-prod-done">{productivity.totals.done}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Κλειδωμένο όφελος</div>
              <div className="text-xl font-semibold tabular-nums text-emerald-600" data-testid="advisor-prod-locked">~{formatMoney(productivity.totals.lockedBenefit)}</div>
            </div>
          </div>
          {productivity.perMember.length === 0 ? (
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν ακόμη αναθέσεις. Αναθέστε ευκαιρίες από την καρτέλα Συμβούλου κάθε πελάτη.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Συνεργάτης</TableHead>
                  <TableHead className="text-center">Ανατεθειμένες</TableHead>
                  <TableHead className="text-center">Ανοιχτές</TableHead>
                  <TableHead className="text-center">Ολοκληρωμένες</TableHead>
                  <TableHead className="text-right">Κλειδωμένο όφελος</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productivity.perMember.map((m) => (
                  <TableRow key={m.userId} data-testid={`advisor-prod-row-${m.userId}`}>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.role === "owner" ? "Ιδιοκτήτης" : m.role === "partner" ? "Συνεργάτης" : m.role === "staff" ? "Υπάλληλος" : "—"}</div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{m.assigned}</TableCell>
                    <TableCell className="text-center tabular-nums">{m.open}</TableCell>
                    <TableCell className="text-center tabular-nums">{m.done}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.lockedBenefit > 0 ? <span className="font-medium text-emerald-600">~{formatMoney(m.lockedBenefit)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
