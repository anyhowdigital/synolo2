"use client";

import { useState, useTransition } from "react";
import { Loader2, Pin, PinOff, Radio, Download, Tags, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { bulkBooksCsvAction, bulkClassifyExpensesAction, bulkTransmitAction, syncOfficeTasksAction, toggleOrgPinAction, type BulkResult } from "@/app/actions/office";

export interface OrgRow {
  id: string;
  name: string;
  afm: string;
  pinned: boolean;
  lastOpenedAt: string | null;
  score: number;
  pendingMydata: number;
  unclassified: number;
  findings: { orgId: string; code: string; title: string; severity: string }[];
}

export function MultiCompanyTools({ orgs }: { orgs: OrgRow[] }) {
  const [selected, setSelected] = useState<string[]>(orgs.filter((o) => o.pendingMydata > 0 || o.unclassified > 0).map((o) => o.id));
  const [q, setQ] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, start] = useTransition();

  const visible = orgs
    .filter((o) => (q ? `${o.name} ${o.afm}`.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "") || a.name.localeCompare(b.name));

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = (fn: () => Promise<BulkResult>) =>
    start(async () => {
      const res = await fn();
      setResult(res);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Ολοκληρώθηκε σε ${res.rows.length} επιχειρήσεις.`);
    });

  const downloadBooks = () =>
    start(async () => {
      const res = await bulkBooksCsvAction(selected);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "vivlia-poles-etairies.csv";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Κατεβάστηκαν ${res.rows} γραμμές.`);
    });

  const makeTasks = () =>
    start(async () => {
      const findings = orgs.filter((o) => selected.includes(o.id)).flatMap((o) => o.findings);
      const res = await syncOfficeTasksAction(selected, findings);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.created ? `Δημιουργήθηκαν ${res.created} εκκρεμότητες.` : "Δεν υπήρχαν νέα ευρήματα.");
    });

  return (
    <Card className="mb-6" data-testid="multi-company-tools">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="size-5" /> Μαζικές ενέργειες σε πολλές εταιρίες
        </CardTitle>
        <CardDescription>Επιλέξτε επιχειρήσεις και εκτελέστε την ίδια εργασία σε όλες. Οι καρφιτσωμένες εμφανίζονται πρώτες.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση επωνυμίας ή ΑΦΜ…" data-testid="org-search-input" />

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2">
          {visible.map((o) => (
            <div key={o.id} className="flex min-w-0 items-center gap-2 rounded-md p-2 hover:bg-muted/60" data-testid={`org-row-${o.id}`}>
              <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} data-testid={`org-check-${o.id}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{o.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  ΑΦΜ {o.afm} · σκορ {o.score}/100
                  {o.pendingMydata ? ` · ${o.pendingMydata} προς διαβίβαση` : ""}
                  {o.unclassified ? ` · ${o.unclassified} αχαρακτήριστα` : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title={o.pinned ? "Ξεκαρφίτσωμα" : "Καρφίτσωμα"}
                data-testid={`org-pin-${o.id}`}
                onClick={() =>
                  start(async () => {
                    await toggleOrgPinAction(o.id);
                  })
                }
              >
                {o.pinned ? <Pin className="text-primary" /> : <PinOff className="text-muted-foreground" />}
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/office/open?org=${o.id}&to=${encodeURIComponent("/dashboard")}`} target="_blank" rel="noreferrer" data-testid={`org-open-${o.id}`}>
                  Νέα καρτέλα
                </a>
              </Button>
            </div>
          ))}
          {visible.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Καμία επιχείρηση δεν ταιριάζει.</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={pending || !selected.length} onClick={() => run(() => bulkTransmitAction(selected))} data-testid="bulk-transmit-btn">
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Radio data-icon="inline-start" />}
            Διαβίβαση εκκρεμών myDATA ({selected.length})
          </Button>
          <Button variant="outline" disabled={pending || !selected.length} onClick={() => run(() => bulkClassifyExpensesAction(selected))} data-testid="bulk-classify-btn">
            <Tags data-icon="inline-start" /> Μαζικός χαρακτηρισμός εξόδων
          </Button>
          <Button variant="outline" disabled={pending || !selected.length} onClick={downloadBooks} data-testid="bulk-books-btn">
            <Download data-icon="inline-start" /> Εξαγωγή βιβλίων (CSV)
          </Button>
          <Button variant="outline" disabled={pending || !selected.length} onClick={makeTasks} data-testid="bulk-tasks-btn">
            <ListChecks data-icon="inline-start" /> Δημιουργία εκκρεμοτήτων
          </Button>
        </div>

        {result && result.ok ? (
          <div className="space-y-1 rounded-lg border p-3 text-sm" data-testid="bulk-result">
            {result.rows.map((r) => (
              <div key={r.orgName} className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{r.orgName}</span>
                <span className={r.failed ? "text-destructive" : "text-muted-foreground"}>{r.message}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
