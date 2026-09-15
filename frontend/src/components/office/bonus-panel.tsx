"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeBonusAction, postRunAction } from "@/app/actions/payroll";
import type { ItemRow } from "@/components/office/payroll-panel";

const eur = (n: number) => `${n.toFixed(2)} €`;
type Kind = "xmas" | "easter" | "leave";
const LABEL: Record<Kind, string> = { xmas: "Δώρο Χριστουγέννων", easter: "Δώρο Πάσχα", leave: "Επίδομα αδείας" };
const RULE: Record<Kind, string> = {
  xmas: "1 μισθός για απασχόληση 1/5–31/12, αλλιώς 2/25 μισθού ανά 19 ημέρες · +4,166% · πληρωμή έως 21/12",
  easter: "½ μισθός για απασχόληση 1/1–30/4, αλλιώς 1/15 του ½ μισθού ανά 8 ημέρες · +4,166% · πληρωμή έως Μ. Τετάρτη",
  leave: "Αποδοχές ημερών άδειας (20/21/22/25/26 ημέρες βάσει προϋπηρεσίας), όριο ½ μισθού",
};

export interface BonusRunView {
  kind: Kind;
  key: string;
  deadline: string;
  posted: boolean;
  totals: { gross: number; efkaEmployee: number; tax: number; net: number } | null;
  items: (ItemRow & { note: string })[];
}

export function BonusPanel({ orgId, year, runs, sepaBase }: { orgId: string; year: number; runs: BonusRunView[]; sepaBase: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<Kind>("xmas");
  const run = runs.find((r) => r.kind === active)!;

  return (
    <Card data-testid="bonus-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" /> Δώρα & επιδόματα {year}
        </CardTitle>
        <CardDescription>{RULE[active]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {runs.map((r) => (
            <Button key={r.kind} size="sm" variant={r.kind === active ? "default" : "outline"} onClick={() => setActive(r.kind)} data-testid={`bonus-tab-${r.kind}`}>
              {LABEL[r.kind]} {r.totals ? <Badge variant="secondary" className="ml-1">{eur(r.totals.net)}</Badge> : null}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending || run.posted}
            onClick={() =>
              start(async () => {
                const res = await computeBonusAction(orgId, active, year);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                if (!res.count) {
                  toast.info(`${LABEL[active]} ${year}: κανένας εργαζόμενος δεν είχε απασχόληση στην περίοδο υπολογισμού.`);
                  return;
                }
                toast.success(`${LABEL[active]} ${year}: ${res.count} εργαζόμενοι · ακαθάριστα ${eur(res.gross)} · καθαρά ${eur(res.net)}`);
                router.refresh();
              })
            }
            data-testid="bonus-compute"
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Υπολογισμός {LABEL[active]}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || run.posted || !run.items.length}
            onClick={() =>
              start(async () => {
                const res = await postRunAction(orgId, run.key);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Καταχωρήθηκε στα διπλογραφικά.");
                router.refresh();
              })
            }
            data-testid="bonus-post"
          >
            Λογιστική καταχώρηση
          </Button>
          <Button size="sm" variant="outline" disabled={!run.items.length} onClick={() => window.open(`${sepaBase}&month=${run.key}`, "_blank")} data-testid="bonus-sepa">
            <Download data-icon="inline-start" /> Αρχείο εμβασμάτων
          </Button>
          <span className="ml-auto text-xs text-muted-foreground" data-testid="bonus-deadline">
            Προθεσμία: {run.deadline}
          </span>
          {run.posted ? <Badge>Καταχωρημένο</Badge> : run.items.length ? <Badge variant="secondary">Προσχέδιο</Badge> : null}
        </div>
        <div className="overflow-x-auto">
          <Table data-testid="bonus-table">
            <TableHeader>
              <TableRow>
                <TableHead>Εργαζόμενος</TableHead>
                <TableHead>Υπολογισμός</TableHead>
                <TableHead className="text-right">Ακαθάριστα</TableHead>
                <TableHead className="text-right">ΕΦΚΑ</TableHead>
                <TableHead className="text-right">ΦΜΥ</TableHead>
                <TableHead className="text-right">Καθαρά</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Πατήστε «Υπολογισμός» για να υπολογιστεί το {LABEL[active]} όλων των εργαζομένων.
                  </TableCell>
                </TableRow>
              ) : (
                run.items.map((it) => (
                  <TableRow key={it.employeeId}>
                    <TableCell>{it.employeeName}</TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">{it.note}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(it.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(it.efkaEmployee)}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(it.tax)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(it.net)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/api/office/payroll?org=${orgId}&month=${run.key}&kind=payslip&employee=${it.employeeId}`} data-testid={`bonus-payslip-${it.employeeId}`}>
                          Απόδειξη
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
