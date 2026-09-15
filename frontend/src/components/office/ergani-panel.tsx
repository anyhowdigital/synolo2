"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteShiftAction, saveShiftAction } from "@/app/actions/payroll";

interface ShiftRow {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  overtimeMinutes: number;
  kind: string;
}

const KINDS: Record<string, string> = { work: "Εργασία", leave: "Άδεια", sick: "Ασθένεια", off: "Ρεπό" };

export function ErganiPanel({ orgId, month, employees, shifts, readOnly }: { orgId: string; month: string; employees: { id: string; name: string }[]; shifts: ShiftRow[]; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ employeeId: employees[0]?.id ?? "", workDate: `${month}-01`, startTime: "09:00", endTime: "17:00", breakMinutes: "30", overtimeMinutes: "0", kind: "work" });

  const dl = (kind: string) => `/api/office/payroll?org=${orgId}&month=${month}&kind=${kind}`;

  return (
    <div className="space-y-6" data-testid="ergani-panel">
      <div className="flex flex-wrap gap-2">
        {(["E12", "E4", "E3", "E8"] as const).map((f) => (
          <Button key={f} asChild variant="outline" size="sm">
            <a href={dl(f)} data-testid={`ergani-${f}`}>
              <Download data-icon="inline-start" /> {f === "E12" ? "Ε12 κάρτα εργασίας" : f === "E4" ? "Ε4 πίνακας προσωπικού" : f === "E3" ? "Ε3 προσλήψεις" : "Ε8 υπερωρίες"}
            </a>
          </Button>
        ))}
        <form className="ml-auto flex items-end gap-2">
          <input type="month" name="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" data-testid="ergani-month" />
          <Button type="submit" variant="secondary" size="sm">
            Μήνας
          </Button>
        </form>
      </div>

      {!readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Καταχώρηση βάρδιας</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <div className="grid gap-1">
              <Label className="text-xs">Εργαζόμενος</Label>
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="shift-employee">
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Ημερομηνία</Label>
              <Input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} data-testid="shift-date" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Από</Label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} data-testid="shift-start" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Έως</Label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} data-testid="shift-end" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Διάλειμμα (λεπτά)</Label>
              <Input type="number" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} data-testid="shift-break" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Υπερωρία (λεπτά)</Label>
              <Input type="number" value={form.overtimeMinutes} onChange={(e) => setForm({ ...form, overtimeMinutes: e.target.value })} data-testid="shift-overtime" />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={pending || !employees.length}
                onClick={() =>
                  start(async () => {
                    const res = await saveShiftAction(orgId, {
                      employeeId: form.employeeId,
                      workDate: form.workDate,
                      startTime: form.startTime,
                      endTime: form.endTime,
                      breakMinutes: Number(form.breakMinutes) || 0,
                      overtimeMinutes: Number(form.overtimeMinutes) || 0,
                      kind: form.kind,
                    });
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Η βάρδια καταχωρήθηκε.");
                    router.refresh();
                  })
                }
                data-testid="shift-save"
              >
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />} Προσθήκη
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Βάρδιες {month} ({shifts.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table data-testid="shifts-table">
            <TableHeader>
              <TableRow>
                <TableHead>Ημερομηνία</TableHead>
                <TableHead>Εργαζόμενος</TableHead>
                <TableHead>Ώρες</TableHead>
                <TableHead className="text-right">Διάλειμμα</TableHead>
                <TableHead className="text-right">Υπερωρία</TableHead>
                <TableHead>Τύπος</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Δεν έχουν καταχωρηθεί βάρδιες για τον μήνα.
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.workDate}</TableCell>
                    <TableCell>{s.employeeName}</TableCell>
                    <TableCell>
                      {s.startTime} – {s.endTime}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.breakMinutes}′</TableCell>
                    <TableCell className="text-right tabular-nums">{s.overtimeMinutes}′</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{KINDS[s.kind] ?? s.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!readOnly ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              await deleteShiftAction(orgId, s.id);
                              router.refresh();
                            })
                          }
                          data-testid={`shift-delete-${s.id}`}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
