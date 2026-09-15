"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveErganiCredentialsAction, submitErganiAction, testErganiAction } from "@/app/actions/payroll";

export interface SubmissionRow {
  id: string;
  form: string;
  period: string;
  status: string;
  protocol: string;
  response: string;
  createdAt: string;
  createdBy: string;
}

export interface ErganiCreds {
  username: string;
  hasPassword: boolean;
  mode: string;
  verifiedAt: string;
  employerAfm: string;
  employerName: string;
  annexAa: string;
  sepe: string;
  oaed: string;
  kad: string;
  kallikratis: string;
  cardSector: boolean;
}

export function ErganiCredentialsCard({ orgId, current, readOnly, orgAfm = "" }: { orgId: string; current: ErganiCreds | null; readOnly: boolean; orgAfm?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ username: current?.username ?? "", password: "", mode: (current?.mode as "trial" | "live") ?? "live" });
  return (
    <Card data-testid="ergani-credentials-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> Σύνδεση ΕΡΓΑΝΗ ΙΙ
          {current?.verifiedAt ? <Badge>Συνδεδεμένο · {current.employerName || current.employerAfm}</Badge> : current ? <Badge variant="secondary">Μη επαληθευμένο</Badge> : <Badge variant="outline">Μη ρυθμισμένο</Badge>}
          {current ? <Badge variant="outline">{current.mode === "live" ? "Παραγωγή" : "Δοκιμαστικό"}</Badge> : null}
        </CardTitle>
        <CardDescription>
          Οι κωδικοί ΕΡΓΑΝΗ της επιχείρησης (ίδιοι με το eservices.yeka.gr). Με τη «Δοκιμή σύνδεσης» ανακτώνται αυτόματα εργοδότης και παράρτημα.
          {current?.verifiedAt ? (
            <span className="mt-1 block text-xs" data-testid="ergani-annex-info">
              ΑΦΜ {current.employerAfm} · Παράρτημα {current.annexAa} · ΣΕΠΕ {current.sepe} · ΔΥΠΑ {current.oaed} · ΚΑΔ {current.kad} · Καλλικράτης {current.kallikratis} · Κάρτα εργασίας: {current.cardSector ? "ναι" : "όχι"}
            </span>
          ) : null}
          {current?.verifiedAt && orgAfm && current.employerAfm && current.employerAfm !== orgAfm ? (
            <span className="mt-1 block text-xs font-medium text-destructive" data-testid="ergani-afm-mismatch">
              Το ΑΦΜ του λογαριασμού ΕΡΓΑΝΗ ({current.employerAfm}) δεν ταιριάζει με το ΑΦΜ της επιχείρησης ({orgAfm}). Οι υποβολές θα απορριφθούν — χρησιμοποιήστε τους κωδικούς της σωστής επιχείρησης.
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      {!readOnly ? (
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Όνομα χρήστη</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" data-testid="ergani-username" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Κωδικός {current?.hasPassword ? "(κενό = διατήρηση)" : ""}</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" data-testid="ergani-password" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Περιβάλλον</Label>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as "trial" | "live" })} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="ergani-mode">
              <option value="live">Παραγωγή (eservices.yeka.gr)</option>
              <option value="trial">Δοκιμαστικό (trialv2eservices)</option>
            </select>
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveErganiCredentialsAction(orgId, form);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Τα διαπιστευτήρια ΕΡΓΑΝΗ αποθηκεύτηκαν.");
                setForm({ ...form, password: "" });
                router.refresh();
              })
            }
            data-testid="ergani-save-credentials"
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Αποθήκευση
          </Button>
          <Button
            variant="outline"
            disabled={pending || !current}
            onClick={() =>
              start(async () => {
                const res = await testErganiAction(orgId);
                if (res.ok) {
                  if (res.info.afmMismatch) toast.warning(`Προσοχή: το ΑΦΜ ΕΡΓΑΝΗ (${res.info.employerAfm} · ${res.info.employerName}) διαφέρει από το ΑΦΜ της επιχείρησης — οι υποβολές θα απορριφθούν.`, { duration: 10000 });
                  toast.success(`Συνδέθηκε: ${res.info.employerName} (ΑΦΜ ${res.info.employerAfm}) · παράρτημα ${res.info.annexAa}`);
                  router.refresh();
                } else toast.error(res.error);
              })
            }
            data-testid="ergani-test-connection"
          >
            Δοκιμή σύνδεσης
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

const FORM_LABEL: Record<string, string> = { E12: "Ε12 κάρτα εργασίας", E4: "Ε4 εβδομαδιαίο ωράριο", E3: "Ε3 πρόσληψη", E8: "Ε8 υπερωρίες", E6: "Ε6 καταγγελία", E6P: "Ε6 καταγγελία (με προειδοποίηση)", E7: "Ε7 λήξη σύμβασης", E5: "Ε5 οικειοθελής", LEAVE: "Άδειες" };

export function ErganiSubmitBar({ orgId, month, enabled }: { orgId: string; month: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ergani-submit-bar">
      <span className="text-xs text-muted-foreground">Υποβολή στο ΕΡΓΑΝΗ:</span>
      {(["E12", "E4", "E8"] as const).map((f) => (
        <Button
          key={f}
          size="sm"
          variant="secondary"
          disabled={pending || !enabled}
          onClick={() =>
            start(async () => {
              const res = await submitErganiAction(orgId, f, month);
              if (!res.ok) toast.error(res.error);
              else toast.success(`${FORM_LABEL[f]} υποβλήθηκε${res.protocol ? ` · αρ. πρωτ. ${res.protocol}` : ""}.`);
              router.refresh();
            })
          }
          data-testid={`ergani-submit-${f}`}
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />} {f}
        </Button>
      ))}
      {!enabled ? <span className="text-xs text-muted-foreground">Καταχωρήστε τα διαπιστευτήρια και πατήστε «Δοκιμή σύνδεσης».</span> : null}
    </div>
  );
}

export function ErganiSubmissionsTable({ rows }: { rows: SubmissionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ιστορικό υποβολών ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table data-testid="ergani-submissions-table">
          <TableHeader>
            <TableRow>
              <TableHead>Ημ/νία</TableHead>
              <TableHead>Έντυπο</TableHead>
              <TableHead>Περίοδος</TableHead>
              <TableHead>Κατάσταση</TableHead>
              <TableHead>Αρ. πρωτ. / Απάντηση</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Δεν έχουν γίνει υποβολές ακόμη.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{r.createdAt.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell className="text-xs">{FORM_LABEL[r.form] ?? r.form}</TableCell>
                  <TableCell className="text-xs">{r.period}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "sent" ? "default" : "destructive"}>{r.status === "sent" ? "Υποβλήθηκε" : "Απέτυχε"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={r.response}>
                    {r.protocol || r.response.slice(0, 120) || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
