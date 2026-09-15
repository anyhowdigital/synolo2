"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CloudUpload, GitCompareArrows, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { compareIncomeAction, reconcileAction, transmitAllPendingAction } from "@/app/actions/mydata";
import type { IncomeComparison, ReconciliationResult } from "@/lib/services/mydata-sync";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function BulkTransmitButton({ pending: pendingCount, mock, size = "default" }: { pending: number; mock: boolean; size?: "default" | "sm" }) {
  const [busy, start] = useTransition();
  return (
    <Button
      size={size}
      variant={pendingCount ? "default" : "outline"}
      disabled={busy || pendingCount === 0}
      title={pendingCount === 0 ? "Όλα τα εκδοθέντα παραστατικά έχουν διαβιβαστεί" : undefined}
      onClick={() =>
        start(async () => {
          const res = await transmitAllPendingAction();
          if (!res.ok) return void toast.error(res.error);
          if (res.errors.length === 0) toast.success(`Διαβιβάστηκαν ${res.sent}/${res.total} παραστατικά στο myDATA${mock ? " (προσομοίωση)" : ""}.`);
          else toast.warning(`Διαβιβάστηκαν ${res.sent}/${res.total}. Απέτυχαν: ${res.errors.map((e) => `${e.number} (${e.error})`).slice(0, 3).join(" · ")}`);
        })
      }
    >
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CloudUpload data-icon="inline-start" />}
      {pendingCount ? `Διαβίβαση εκκρεμών (${pendingCount})` : "Κανένα εκκρεμές προς διαβίβαση"}
    </Button>
  );
}

export function MyDataSyncPanel({ from: initialFrom, to: initialTo, mock, canWrite }: { from: string; to: string; mock: boolean; canWrite: boolean }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [reconcile, setReconcile] = useState<ReconciliationResult | null>(null);
  const [income, setIncome] = useState<IncomeComparison | null>(null);
  const [busyReconcile, startReconcile] = useTransition();
  const [busyIncome, startIncome] = useTransition();

  const runReconcile = () =>
    startReconcile(async () => {
      const res = await reconcileAction(from, to);
      if (!res.ok) return void toast.error(res.error);
      setReconcile(res.data);
      if (res.data.cancelledRemote.length) toast.info(`${res.data.cancelledRemote.length} παραστατικά σημάνθηκαν ως ακυρωμένα βάσει ΑΑΔΕ.`);
      else toast.success("Η συμφωνία ολοκληρώθηκε.");
    });
  const runIncome = () =>
    startIncome(async () => {
      const res = await compareIncomeAction(from, to);
      if (!res.ok) return void toast.error(res.error);
      setIncome(res.data);
    });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="sync-from">Από</Label>
          <Input id="sync-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sync-to">Έως</Label>
          <Input id="sync-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
        {canWrite ? (
          <Button onClick={runReconcile} disabled={busyReconcile}>
            {busyReconcile ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <GitCompareArrows data-icon="inline-start" />}
            Συμφωνία διαβιβασμένων
          </Button>
        ) : null}
        <Button variant="secondary" onClick={runIncome} disabled={busyIncome}>
          {busyIncome ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Scale data-icon="inline-start" />}
          Σύγκριση εσόδων (MyIncome)
        </Button>
        {mock ? (
          <p className="ml-auto text-xs text-muted-foreground">
            Περιβάλλον προσομοίωσης: οι απαντήσεις της ΑΑΔΕ παράγονται από τα τοπικά δεδομένα. Αλλάξτε σε dev/prod στις{" "}
            <Link href="/settings?tab=mydata" className="underline">
              Ρυθμίσεις
            </Link>
            .
          </p>
        ) : null}
      </div>

      {reconcile ? <ReconcileResults r={reconcile} /> : null}
      {income ? <IncomeResults c={income} /> : null}

      {!reconcile && !income ? (
        <Card>
          <CardContent className="grid gap-3 py-8 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <GitCompareArrows className="size-4" /> Συμφωνία διαβιβασμένων (RequestTransmittedDocs)
              </div>
              <p className="mt-1">Αντιπαραβάλλει τα MARK των παραστατικών σας με όσα έχει καταγράψει η ΑΑΔΕ στην περίοδο. Εντοπίζει παραστατικά που λείπουν από τη μία ή την άλλη πλευρά και συγχρονίζει ακυρώσεις που έγιναν εκτός εφαρμογής.</p>
            </div>
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Scale className="size-4" /> Σύγκριση εσόδων (RequestMyIncome)
              </div>
              <p className="mt-1">Συγκρίνει καθαρή αξία και ΦΠΑ ανά τύπο παραστατικού μεταξύ βιβλίων εφαρμογής και ηλεκτρονικών βιβλίων ΑΑΔΕ, πριν την υποβολή Φ2 / Ε3.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReconcileResults({ r }: { r: ReconciliationResult }) {
  const issues = r.missingRemote.length + r.missingLocal.length + r.notTransmitted.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Συμφωνία διαβιβασμένων {r.period.from} – {r.period.to}
          {r.mock ? <Badge variant="outline">προσομοίωση</Badge> : null}
        </CardTitle>
        <CardDescription>
          {r.matched} παραστατικά επιβεβαιώθηκαν από την ΑΑΔΕ · {r.cancelledRemote.length} ενημερώθηκαν ως ακυρωμένα
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {issues === 0 ? (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Πλήρης συμφωνία</AlertTitle>
            <AlertDescription>Όλα τα εκδοθέντα παραστατικά της περιόδου έχουν MARK και επιβεβαιώνονται από τα ηλεκτρονικά βιβλία της ΑΑΔΕ.</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{issues} σημεία προς έλεγχο</AlertTitle>
            <AlertDescription>Ελέγξτε τις παρακάτω λίστες. Τα μη διαβιβασμένα μπορούν να σταλούν μαζικά από το κουμπί «Διαβίβαση εκκρεμών».</AlertDescription>
          </Alert>
        )}

        {r.notTransmitted.length ? (
          <InvoiceList title="Εκδοθέντα χωρίς διαβίβαση" tone="amber" rows={r.notTransmitted.map((i) => ({ id: i.id, label: invoiceDisplayNumber(i), date: i.issueDate, party: i.customerName ?? "—", amount: i.totalGrossValue, extra: i.mydataStatus === "error" ? "σφάλμα διαβίβασης" : "" }))} />
        ) : null}
        {r.missingRemote.length ? (
          <InvoiceList title="Με MARK τοπικά, αλλά δεν βρέθηκαν στην ΑΑΔΕ" tone="red" rows={r.missingRemote.map((i) => ({ id: i.id, label: invoiceDisplayNumber(i), date: i.issueDate, party: i.customerName ?? "—", amount: i.totalGrossValue, extra: `MARK ${i.mydataMark}` }))} />
        ) : null}
        {r.cancelledRemote.length ? (
          <InvoiceList title="Ακυρωμένα στην ΑΑΔΕ – ενημερώθηκαν τοπικά" tone="muted" rows={r.cancelledRemote.map((i) => ({ id: i.id, label: invoiceDisplayNumber(i), date: i.issueDate, party: i.customerName ?? "—", amount: i.totalGrossValue, extra: `MARK ${i.mydataMark}` }))} />
        ) : null}
        {r.missingLocal.length ? (
          <div>
            <h4 className="mb-2 text-sm font-medium text-red-700">Στην ΑΑΔΕ αλλά όχι στην εφαρμογή ({r.missingLocal.length})</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MARK</TableHead>
                  <TableHead>Παραστατικό</TableHead>
                  <TableHead>Ημερομηνία</TableHead>
                  <TableHead>ΑΦΜ λήπτη</TableHead>
                  <TableHead className="text-right">Σύνολο</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.missingLocal.map((d) => (
                  <TableRow key={d.mark}>
                    <TableCell className="font-mono text-xs">{d.mark}</TableCell>
                    <TableCell>
                      {d.invoiceType} {d.series}-{d.aa}
                    </TableCell>
                    <TableCell>{formatDate(d.issueDate)}</TableCell>
                    <TableCell>{d.counterpartAfm || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(d.totalGrossValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">Συνήθως πρόκειται για παραστατικά από ταμειακή μηχανή, πάροχο ηλεκτρονικής τιμολόγησης ή χειροκίνητη καταχώρηση στο myDATA.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoiceList({ title, tone, rows }: { title: string; tone: "amber" | "red" | "muted"; rows: { id: string; label: string; date: string; party: string; amount: number; extra: string }[] }) {
  return (
    <div>
      <h4 className={cn("mb-2 text-sm font-medium", tone === "amber" && "text-amber-700", tone === "red" && "text-red-700", tone === "muted" && "text-muted-foreground")}>
        {title} ({rows.length})
      </h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Παραστατικό</TableHead>
            <TableHead>Ημερομηνία</TableHead>
            <TableHead>Πελάτης</TableHead>
            <TableHead className="hidden sm:table-cell">Σημείωση</TableHead>
            <TableHead className="text-right">Σύνολο</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                <Link href={`/invoices/${i.id}`} className="font-medium underline-offset-2 hover:underline">
                  {i.label}
                </Link>
              </TableCell>
              <TableCell>{formatDate(i.date)}</TableCell>
              <TableCell className="max-w-[220px] truncate">{i.party}</TableCell>
              <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{i.extra}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(i.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IncomeResults({ c }: { c: IncomeComparison }) {
  const diffNet = Math.round((c.localNet - c.remoteNet) * 100) / 100;
  const diffVat = Math.round((c.localVat - c.remoteVat) * 100) / 100;
  const balanced = Math.abs(diffNet) < 0.005 && Math.abs(diffVat) < 0.005;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Έσοδα: εφαρμογή vs ηλεκτρονικά βιβλία ΑΑΔΕ
          {c.mock ? <Badge variant="outline">προσομοίωση</Badge> : null}
        </CardTitle>
        <CardDescription>{c.rowCount} συγκεντρωτικές γραμμές από RequestMyIncome · τα πιστωτικά αφαιρούνται</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert variant={balanced ? "default" : "destructive"} className="mb-4">
          {balanced ? <CheckCircle2 /> : <AlertTriangle />}
          <AlertTitle>{balanced ? "Τα έσοδα συμφωνούν" : `Απόκλιση ${formatMoney(Math.abs(diffNet))} καθαρή / ${formatMoney(Math.abs(diffVat))} ΦΠΑ`}</AlertTitle>
          <AlertDescription>
            {balanced
              ? "Καθαρή αξία και ΦΠΑ εκροών ταυτίζονται με όσα έχει καταγράψει η ΑΑΔΕ για την περίοδο."
              : "Θετική απόκλιση σημαίνει έσοδα στην εφαρμογή που δεν έχουν διαβιβαστεί· αρνητική σημαίνει παραστατικά στην ΑΑΔΕ που λείπουν από την εφαρμογή."}
          </AlertDescription>
        </Alert>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Τύπος</TableHead>
              <TableHead className="text-right">Καθαρό (εφαρμογή)</TableHead>
              <TableHead className="text-right">Καθαρό (ΑΑΔΕ)</TableHead>
              <TableHead className="text-right">Διαφορά</TableHead>
              <TableHead className="hidden text-right sm:table-cell">ΦΠΑ (εφαρμογή)</TableHead>
              <TableHead className="hidden text-right sm:table-cell">ΦΠΑ (ΑΑΔΕ)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.byType.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Δεν υπάρχουν έσοδα στην περίοδο.
                </TableCell>
              </TableRow>
            ) : (
              c.byType.map((t) => (
                <TableRow key={t.invoiceType}>
                  <TableCell>
                    <span className="font-mono text-xs">{t.invoiceType}</span> <span className="text-xs text-muted-foreground">{t.name}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(t.localNet)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(t.remoteNet)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", Math.abs(t.diffNet) >= 0.005 && "font-medium text-red-700")}>{Math.abs(t.diffNet) < 0.005 ? "—" : formatMoney(t.diffNet)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(t.localVat)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(t.remoteVat)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Σύνολο</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(c.localNet)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(c.remoteNet)}</TableCell>
              <TableCell className={cn("text-right tabular-nums", !balanced && "text-red-700")}>{Math.abs(diffNet) < 0.005 ? "—" : formatMoney(diffNet)}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(c.localVat)}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(c.remoteVat)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
