"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEmployeeAction, submitErganiAction } from "@/app/actions/payroll";

export interface EmployeeFormValues {
  firstName: string;
  lastName: string;
  afm: string;
  amka: string;
  efkaAm: string;
  doy: string;
  specialtyCode: string;
  specialtyName: string;
  kpk: string;
  contractType: string;
  hireDate: string;
  grossSalary: number;
  dailyWage: number;
  hoursPerWeek: number;
  children: number;
  iban: string;
  birthDate: string;
  sex: string;
  fatherName: string;
  motherName: string;
  nationality: string;
  idType: string;
  idNumber: string;
  maritalStatus: string;
  educationLevel: string;
  email: string;
  phone: string;
}

export const EMPTY_EMPLOYEE: EmployeeFormValues = { firstName: "", lastName: "", afm: "", amka: "", efkaAm: "", doy: "", specialtyCode: "", specialtyName: "", kpk: "101", contractType: "full", hireDate: new Date().toISOString().slice(0, 10), grossSalary: 1000, dailyWage: 0, hoursPerWeek: 40, children: 0, iban: "", birthDate: "", sex: "0", fatherName: "", motherName: "", nationality: "000", idType: "ΑΔΤ", idNumber: "", maritalStatus: "0", educationLevel: "", email: "", phone: "" };

type Field = { key: keyof EmployeeFormValues; label: string; type?: "text" | "number" | "date"; options?: [string, string][] };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Ταυτότητα",
    fields: [
      { key: "lastName", label: "Επώνυμο" },
      { key: "firstName", label: "Όνομα" },
      { key: "fatherName", label: "Όνομα πατρός" },
      { key: "motherName", label: "Όνομα μητρός" },
      { key: "birthDate", label: "Ημ. γέννησης", type: "date" },
      { key: "sex", label: "Φύλο", options: [["0", "Άνδρας"], ["1", "Γυναίκα"]] },
      { key: "nationality", label: "Υπηκοότητα (κωδ. ΕΡΓΑΝΗ, 000=Ελλάδα)" },
      { key: "idType", label: "Τύπος ταυτότητας", options: [["ΑΔΤ", "ΑΔΤ"], ["ΔΙΑΒ", "Διαβατήριο"], ["ΑΔΠ", "Άδεια παραμονής"]] },
      { key: "idNumber", label: "Αρ. ταυτότητας" },
      { key: "maritalStatus", label: "Οικογ. κατάσταση", options: [["0", "Άγαμος"], ["1", "Έγγαμος"], ["2", "Διαζευγμένος"], ["3", "Χήρος"]] },
      { key: "children", label: "Τέκνα", type: "number" },
      { key: "educationLevel", label: "Εκπαιδευτικό επίπεδο (κωδ.)" },
    ],
  },
  {
    title: "Μητρώα & επικοινωνία",
    fields: [
      { key: "afm", label: "ΑΦΜ" },
      { key: "doy", label: "ΔΟΥ (κωδ.)" },
      { key: "amka", label: "ΑΜΚΑ" },
      { key: "efkaAm", label: "Α.Μ. ΕΦΚΑ" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Τηλέφωνο" },
      { key: "iban", label: "IBAN μισθοδοσίας" },
    ],
  },
  {
    title: "Σύμβαση & αποδοχές",
    fields: [
      { key: "hireDate", label: "Ημ. πρόσληψης", type: "date" },
      { key: "contractType", label: "Καθεστώς", options: [["full", "Πλήρης"], ["part", "Μερική"], ["shift", "Εκ περιτροπής"], ["seasonal", "Ορισμένου χρόνου/εποχικός"]] },
      { key: "specialtyCode", label: "Κωδ. ειδικότητας (ΣΤΕΠ92)" },
      { key: "specialtyName", label: "Ειδικότητα" },
      { key: "kpk", label: "ΚΠΚ ΕΦΚΑ" },
      { key: "grossSalary", label: "Μηνιαίες ακαθάριστες (€)", type: "number" },
      { key: "dailyWage", label: "Ημερομίσθιο (€, αν εργατοτεχνίτης)", type: "number" },
      { key: "hoursPerWeek", label: "Ώρες/εβδομάδα", type: "number" },
    ],
  },
];

export function EmployeeForm({ orgId, employeeId, initial, hasErgani }: { orgId: string; employeeId?: string; initial: EmployeeFormValues; hasErgani: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(initial);
  const set = (k: keyof EmployeeFormValues, v: string) => setForm({ ...form, [k]: typeof initial[k] === "number" ? Number(v) || 0 : v });

  return (
    <Card data-testid="employee-form">
      <CardHeader>
        <CardTitle className="text-base">{employeeId ? "Καρτέλα εργαζομένου" : "Νέος εργαζόμενος"}</CardTitle>
        <CardDescription>Τα πεδία ταυτότητας χρησιμοποιούνται στις ψηφιακές αναγγελίες ΕΡΓΑΝΗ (Ε3, Ε5/Ε6/Ε7).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {s.fields.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label className="text-xs">{f.label}</Label>
                  {f.options ? (
                    <select value={String(form[f.key])} onChange={(e) => set(f.key, e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid={`employee-${f.key}`}>
                      {f.options.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input type={f.type ?? "text"} step={f.type === "number" ? "0.01" : undefined} value={String(form[f.key])} onChange={(e) => set(f.key, e.target.value)} data-testid={`employee-${f.key}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveEmployeeAction(orgId, form, employeeId);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Η καρτέλα αποθηκεύτηκε.");
                if (!employeeId) router.push(`/office/clients/${orgId}/employees/${res.id}`);
                else router.refresh();
              })
            }
            data-testid="employee-save"
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />} Αποθήκευση
          </Button>
          {employeeId && hasErgani ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await submitErganiAction(orgId, "E3", form.hireDate.slice(0, 7), employeeId);
                  if (!res.ok) toast.error(res.error);
                  else toast.success(`Ε3 υποβλήθηκε${res.protocol ? ` · ${res.protocol}` : ""}`);
                  router.refresh();
                })
              }
              data-testid="employee-submit-e3"
            >
              <Send data-icon="inline-start" /> Αναγγελία πρόσληψης Ε3 στο ΕΡΓΑΝΗ
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
