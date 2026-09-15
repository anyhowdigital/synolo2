"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, Landmark, Loader2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewSeveranceAction, saveTerminationAction, staffPortalAccessAction, submitErganiAction } from "@/app/actions/payroll";

const eur = (n: number) => `${n.toFixed(2)} €`;

/** Αρχείο εμβασμάτων SEPA pain.001 για την μισθοδοσία του μήνα. */
export function SepaCard({ orgId, runKey, orgIban, hasItems }: { orgId: string; runKey: string; orgIban: string; hasItems: boolean }) {
  const [iban, setIban] = useState(orgIban);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Card data-testid="sepa-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4" /> Πληρωμή μισθοδοσίας — αρχείο εμβασμάτων
        </CardTitle>
        <CardDescription>SEPA XML (pain.001.001.03) με όλες τις καθαρές αποδοχές· ανεβάστε το στο e-banking και πληρώνονται όλοι με ένα upload.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-1">
          <Label className="text-xs">IBAN επιχείρησης (χρέωση)</Label>
          <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="GR16 0110 1250 0000 0001 2300 695" data-testid="sepa-iban" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Ημ. εκτέλεσης</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="sepa-date" />
        </div>
        <Button
          disabled={!hasItems}
          onClick={() => window.open(`/api/office/payroll?org=${orgId}&month=${runKey}&kind=sepa&iban=${encodeURIComponent(iban)}&date=${date}`, "_blank")}
          data-testid="sepa-download"
        >
          <Download data-icon="inline-start" /> Λήψη SEPA XML
        </Button>
        {!hasItems ? <p className="w-full text-xs text-muted-foreground">Υπολογίστε πρώτα τη μισθοδοσία του μήνα.</p> : null}
      </CardContent>
    </Card>
  );
}

/** Κουμπί πρόσβασης εργαζομένου στην προσωπική πύλη (link + PIN). */
export function StaffAccessButton({ orgId, employeeId }: { orgId: string; employeeId: string }) {
  const [pending, start] = useTransition();
  const [access, setAccess] = useState<{ url: string; pin: string } | null>(null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await staffPortalAccessAction(orgId, employeeId);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              setAccess({ url: `${window.location.origin}${res.url}`, pin: res.pin });
            })
          }
          data-testid={`staff-access-${employeeId}`}
        >
          <KeyRound data-icon="inline-start" /> Πύλη
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Προσωπική πύλη εργαζομένου</DialogTitle>
        </DialogHeader>
        {access ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Στείλτε τον σύνδεσμο και το PIN στον εργαζόμενο. Βλέπει αποδείξεις, βάρδιες, άδειες και δηλώνει άφιξη/αναχώρηση.</p>
            <div className="flex gap-2">
              <Input readOnly value={access.url} data-testid="staff-access-url" />
              <Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(access.url).then(() => toast.success("Αντιγράφηκε."))}>
                <Copy />
              </Button>
            </div>
            <p>
              PIN: <span className="font-mono text-lg font-semibold tracking-widest" data-testid="staff-access-pin">{access.pin}</span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await staffPortalAccessAction(orgId, employeeId, true);
                  if (res.ok) setAccess({ url: `${window.location.origin}${res.url}`, pin: res.pin });
                })
              }
              data-testid="staff-access-rotate"
            >
              Νέος σύνδεσμος & PIN
            </Button>
          </div>
        ) : (
          <Loader2 className="animate-spin" />
        )}
      </DialogContent>
    </Dialog>
  );
}

type TKind = "dismissal" | "contract_end" | "resignation";
const TLABEL: Record<TKind, string> = { dismissal: "Καταγγελία σύμβασης (Ε6)", contract_end: "Λήξη ορισμένου χρόνου (Ε7)", resignation: "Οικειοθελής αποχώρηση (Ε5)" };

export interface TerminationRow {
  id: string;
  employeeName: string;
  kind: string;
  endDate: string;
  withNotice: boolean;
  serviceYears: number;
  monthsOwed: number;
  gross: number;
  tax: number;
  net: number;
  note: string;
}

/** Αποζημίωση απόλυσης + Ε6/Ε7. */
export function TerminationCard({ orgId, employees, rows, hasErgani }: { orgId: string; employees: { id: string; name: string }[]; rows: TerminationRow[]; hasErgani: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: employees[0]?.id ?? "", kind: "dismissal" as TKind, endDate: new Date().toISOString().slice(0, 10), withNotice: false, note: "" });
  const [preview, setPreview] = useState<{ years: number; monthsOwed: number; monthlyBase: number; gross: number; tax: number; net: number; noticeMonths: number; explain: string } | null>(null);

  const doPreview = (f = form) =>
    start(async () => {
      if (!f.employeeId) return;
      const res = await previewSeveranceAction(orgId, f.employeeId, f.kind, f.endDate, f.withNotice);
      setPreview(res.ok ? res.calc : null);
      if (!res.ok) toast.error(res.error);
    });
  const update = (patch: Partial<typeof form>) => {
    const f = { ...form, ...patch };
    setForm(f);
    doPreview(f);
  };

  return (
    <Card data-testid="termination-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserMinus className="size-4" /> Αποχωρήσεις & αποζημιώσεις
          </CardTitle>
          <CardDescription>Πίνακας Ν.4093/2012 με προϋπηρεσία, με/χωρίς προειδοποίηση · αφορολόγητο έως 60.000 € · Ε6/Ε7 έτοιμα.</CardDescription>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) doPreview();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!employees.length} data-testid="termination-new">
              Νέα αποχώρηση
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Αποχώρηση εργαζομένου</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1 sm:col-span-2">
                <Label className="text-xs">Εργαζόμενος</Label>
                <select value={form.employeeId} onChange={(e) => update({ employeeId: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="termination-employee">
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Είδος</Label>
                <select value={form.kind} onChange={(e) => update({ kind: e.target.value as TKind })} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="termination-kind">
                  {(Object.keys(TLABEL) as TKind[]).map((k) => (
                    <option key={k} value={k}>
                      {TLABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Ημ. αποχώρησης</Label>
                <Input type="date" value={form.endDate} onChange={(e) => update({ endDate: e.target.value })} data-testid="termination-date" />
              </div>
              {form.kind === "dismissal" ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.withNotice} onChange={(e) => update({ withNotice: e.target.checked })} data-testid="termination-notice" /> Με προειδοποίηση (προμήνυση{preview ? ` ${preview.noticeMonths} μηνών` : ""}) → αποζημίωση στο ½
                </label>
              ) : null}
              <div className="grid gap-1 sm:col-span-2">
                <Label className="text-xs">Σημείωση</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="termination-note" />
              </div>
            </div>
            {preview ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="termination-preview">
                <p className="text-xs text-muted-foreground">{preview.explain}</p>
                <div className="mt-2 grid grid-cols-2 gap-1 tabular-nums sm:grid-cols-4">
                  <span>Προϋπηρεσία: <b>{preview.years} έτη</b></span>
                  <span>Μήνες: <b>{preview.monthsOwed}</b></span>
                  <span>Βάση/μήνα: <b>{eur(preview.monthlyBase)}</b></span>
                  <span>Αποζημίωση: <b data-testid="termination-gross">{eur(preview.gross)}</b></span>
                </div>
                <p className="mt-1 text-xs">Φόρος {eur(preview.tax)} · Καθαρό {eur(preview.net)}</p>
              </div>
            ) : null}
            <DialogFooter>
              <Button
                disabled={pending || !form.employeeId}
                onClick={() =>
                  start(async () => {
                    const res = await saveTerminationAction(orgId, form);
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success(`Η αποχώρηση καταχωρήθηκε — αποζημίωση ${eur(res.gross)}.`);
                    setOpen(false);
                    router.refresh();
                  })
                }
                data-testid="termination-save"
              >
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Καταχώρηση αποχώρησης
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table data-testid="terminations-table">
          <TableHeader>
            <TableRow>
              <TableHead>Εργαζόμενος</TableHead>
              <TableHead>Είδος</TableHead>
              <TableHead>Ημ/νία</TableHead>
              <TableHead className="text-right">Έτη</TableHead>
              <TableHead className="text-right">Αποζημίωση</TableHead>
              <TableHead className="text-right">Καθαρό</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  Δεν υπάρχουν καταχωρημένες αποχωρήσεις.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((t) => {
                const form = t.kind === "dismissal" ? "E6" : t.kind === "contract_end" ? "E7" : "E5";
                return (
                  <TableRow key={t.id}>
                    <TableCell>{t.employeeName}</TableCell>
                    <TableCell className="text-xs">
                      {TLABEL[t.kind as TKind] ?? t.kind} {t.withNotice ? <Badge variant="outline">με προειδοποίηση</Badge> : null}
                    </TableCell>
                    <TableCell className="text-xs">{t.endDate}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.serviceYears}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(t.gross)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(t.net)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/api/office/payroll?org=${orgId}&month=${t.endDate.slice(0, 7)}&kind=termination&termination=${t.id}`} data-testid={`termination-file-${t.id}`}>
                          <Download data-icon="inline-start" /> {form}
                        </a>
                      </Button>
                      {hasErgani ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await submitErganiAction(orgId, t.kind === "dismissal" ? (t.withNotice ? "E6P" : "E6") : t.kind === "contract_end" ? "E7" : "E5", t.endDate.slice(0, 7), t.id);
                              if (!res.ok) toast.error(res.error);
                              else toast.success(`Υποβλήθηκε στο ΕΡΓΑΝΗ${res.protocol ? ` · αρ. πρωτ. ${res.protocol}` : ""}`);
                              router.refresh();
                            })
                          }
                          data-testid={`termination-submit-${t.id}`}
                        >
                          Υποβολή
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
