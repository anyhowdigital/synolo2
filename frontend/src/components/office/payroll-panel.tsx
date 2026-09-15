"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeRunAction, postRunAction } from "@/app/actions/payroll";

const eur = (n: number) => `${n.toFixed(2)} €`;

export interface EmployeeRow {
  id: string;
  name: string;
  afm: string;
  amka: string;
  specialty: string;
  contractType: string;
  gross: number;
  hireDate: string;
  iban: string;
  active: boolean;
}

export interface ItemRow {
  employeeId: string;
  employeeName: string;
  days: number;
  overtimeHours: number;
  gross: number;
  efkaEmployee: number;
  efkaEmployer: number;
  tax: number;
  net: number;
}

export function PayrollPanel({
  orgId,
  month,
  employees,
  items,
  totals,
  posted,
}: {
  orgId: string;
  month: string;
  employees: EmployeeRow[];
  items: ItemRow[];
  totals: { gross: number; efkaEmployee: number; efkaEmployer: number; tax: number; net: number } | null;
  posted: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const dl = (kind: string, employeeId?: string) => `/api/office/payroll?org=${orgId}&month=${month}&kind=${kind}${employeeId ? `&employee=${employeeId}` : ""}`;

  return (
    <div className="space-y-6" data-testid="payroll-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            if (posted) {
              toast.error(`Η μισθοδοσία ${month} έχει ήδη καταχωρηθεί λογιστικά — δεν επιτρέπεται επανυπολογισμός.`);
              return;
            }
            start(async () => {
              const res = await computeRunAction(orgId, month);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(`Υπολογίστηκε: ακαθάριστες ${eur(res.gross)} · καθαρά ${eur(res.net)}`);
              router.refresh();
            });
          }}
          disabled={pending}
          data-testid="payroll-compute"
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Users data-icon="inline-start" />} Υπολογισμός μισθοδοσίας
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (posted) {
              toast.error(`Η μισθοδοσία ${month} έχει ήδη καταχωρηθεί στα διπλογραφικά.`);
              return;
            }
            if (!items.length) {
              toast.error("Υπολογίστε πρώτα τη μισθοδοσία του μήνα.");
              return;
            }
            start(async () => {
              const res = await postRunAction(orgId, month);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success("Η μισθοδοσία καταχωρήθηκε στα διπλογραφικά.");
              router.refresh();
            });
          }}
          data-testid="payroll-post"
        >
          Λογιστική καταχώρηση
        </Button>
        <Button
          variant="outline"
          onClick={() => (items.length ? window.open(dl("apd"), "_blank") : toast.error(`Δεν υπάρχει μισθοδοσία για τον μήνα ${month} — υπολογίστε πρώτα.`))}
          data-testid="payroll-apd"
        >
          <Download data-icon="inline-start" /> ΑΠΔ (ΕΦΚΑ)
        </Button>
        <Button
          variant="outline"
          onClick={() => (items.length ? window.open(dl("fmy"), "_blank") : toast.error(`Δεν υπάρχει μισθοδοσία για τον μήνα ${month} — υπολογίστε πρώτα.`))}
          data-testid="payroll-fmy"
        >
          <Download data-icon="inline-start" /> ΦΜΥ (JL10)
        </Button>
        {posted ? <Badge>Καταχωρημένη</Badge> : items.length ? <Badge variant="secondary">Προσχέδιο</Badge> : null}

        <Button asChild variant="ghost" className="ml-auto">
          <a href={`/office/clients/${orgId}/employees/new`} data-testid="employee-add">
            <Plus data-icon="inline-start" /> Νέος εργαζόμενος
          </a>
        </Button>
      </div>

      {totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="payroll-totals">
          {[
            ["Ακαθάριστες", totals.gross],
            ["ΕΦΚΑ εργαζομένου", totals.efkaEmployee],
            ["ΕΦΚΑ εργοδότη", totals.efkaEmployer],
            ["ΦΜΥ", totals.tax],
            ["Καθαρά πληρωτέα", totals.net],
          ].map(([label, value]) => (
            <Card key={label as string}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label as string}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{eur(value as number)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Μισθοδοσία {month}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table data-testid="payroll-table">
            <TableHeader>
              <TableRow>
                <TableHead>Εργαζόμενος</TableHead>
                <TableHead className="text-right">Ημέρες</TableHead>
                <TableHead className="text-right">Υπερωρίες</TableHead>
                <TableHead className="text-right">Ακαθάριστες</TableHead>
                <TableHead className="text-right">ΕΦΚΑ</TableHead>
                <TableHead className="text-right">ΦΜΥ</TableHead>
                <TableHead className="text-right">Καθαρά</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Πατήστε «Υπολογισμός μισθοδοσίας» για τον μήνα.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow key={it.employeeId}>
                    <TableCell>{it.employeeName}</TableCell>
                    <TableCell className="text-right tabular-nums">{it.days}</TableCell>
                    <TableCell className="text-right tabular-nums">{it.overtimeHours}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(it.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(it.efkaEmployee)}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(it.tax)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(it.net)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <a href={dl("payslip", it.employeeId)} data-testid={`payslip-${it.employeeId}`}>
                          Απόδειξη
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card data-testid="employees-summary">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>
            <b>{employees.filter((e) => e.active).length}</b> ενεργοί εργαζόμενοι · {employees.filter((e) => !e.iban).length} χωρίς IBAN
          </span>
          <Button asChild size="sm" variant="outline">
            <a href={`/office/clients/${orgId}/employees?month=${month}`} data-testid="employees-manage-link">
              Διαχείριση προσωπικού →
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
