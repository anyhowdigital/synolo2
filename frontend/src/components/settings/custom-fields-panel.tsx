"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveCustomFieldDefsAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, type CustomFieldDef } from "@/lib/services/custom-fields";

type Row = CustomFieldDef & { optionsText: string };

function newRow(entity: CustomFieldDef["entity"]): Row {
  return { id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, entity, label: "", type: "text", options: [], required: false, showOnPdf: false, optionsText: "" };
}

export function CustomFieldsPanel({ defs, salesChannels }: { defs: CustomFieldDef[]; salesChannels: string }) {
  const [rows, setRows] = useState<Row[]>(defs.map((d) => ({ ...d, optionsText: d.options.join(", ") })));
  const [channels, setChannels] = useState(salesChannels);
  const [pending, start] = useTransition();
  const update = (id: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const save = () =>
    start(async () => {
      const payload = rows.map(({ optionsText, ...d }) => ({ ...d, options: optionsText.split(",").map((o) => o.trim()).filter(Boolean) }));
      const res = await saveCustomFieldDefsAction({ defs: payload, salesChannels: channels });
      if (res.ok) toast.success("Τα πεδία και τα κανάλια αποθηκεύτηκαν.");
      else toast.error(res.error);
    });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Custom πεδία</CardTitle>
          <CardDescription>
            Δικά σας πεδία σε πελάτες, παραστατικά, έξοδα και είδη (π.χ. «Αριθμός σύμβασης», «Κωδικός έργου πελάτη», «Ημερομηνία παράδοσης»). Τα πεδία παραστατικών με «Στο PDF» εμφανίζονται και στο
            εκτυπωμένο παραστατικό.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {CUSTOM_FIELD_ENTITIES.map((ent) => {
            const mine = rows.filter((r) => r.entity === ent.id);
            return (
              <div key={ent.id} className="grid gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{ent.label}</h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRows((r) => [...r, newRow(ent.id)])}>
                    <Plus data-icon="inline-start" /> Πεδίο
                  </Button>
                </div>
                {mine.length === 0 ? <p className="text-sm text-muted-foreground">Κανένα custom πεδίο.</p> : null}
                {mine.map((row) => (
                  <div key={row.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_1fr_auto]">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`lbl-${row.id}`}>Όνομα</Label>
                      <Input id={`lbl-${row.id}`} value={row.label} onChange={(e) => update(row.id, { label: e.target.value })} placeholder="π.χ. Αριθμός σύμβασης" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`type-${row.id}`}>Τύπος</Label>
                      <select id={`type-${row.id}`} value={row.type} onChange={(e) => update(row.id, { type: e.target.value as CustomFieldDef["type"] })} className="h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs">
                        {CUSTOM_FIELD_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      {row.type === "select" ? (
                        <>
                          <Label htmlFor={`opt-${row.id}`}>Επιλογές (με κόμμα)</Label>
                          <Input id={`opt-${row.id}`} value={row.optionsText} onChange={(e) => update(row.id, { optionsText: e.target.value })} placeholder="Χονδρική, Λιανική, Εξαγωγές" />
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-4 pt-6 text-sm">
                          <label className="flex items-center gap-2">
                            <Checkbox checked={row.required} onCheckedChange={(c) => update(row.id, { required: c === true })} /> Υποχρεωτικό
                          </label>
                          {row.entity === "invoice" ? (
                            <label className="flex items-center gap-2">
                              <Checkbox checked={row.showOnPdf} onCheckedChange={(c) => update(row.id, { showOnPdf: c === true })} /> Στο PDF
                            </label>
                          ) : null}
                        </div>
                      )}
                      {row.type === "select" ? (
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <label className="flex items-center gap-2">
                            <Checkbox checked={row.required} onCheckedChange={(c) => update(row.id, { required: c === true })} /> Υποχρεωτικό
                          </label>
                          {row.entity === "invoice" ? (
                            <label className="flex items-center gap-2">
                              <Checkbox checked={row.showOnPdf} onCheckedChange={(c) => update(row.id, { showOnPdf: c === true })} /> Στο PDF
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="self-end text-destructive" onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))} aria-label="Διαγραφή πεδίου">
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Κανάλια πώλησης</CardTitle>
          <CardDescription>Λίστα καναλιών (π.χ. Κατάστημα, E-shop, Τηλεφωνικά, Συνεργάτες). Επιλέγονται στο παραστατικό και εμφανίζονται στις αναφορές πωλήσεων ανά κανάλι.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input value={channels} onChange={(e) => setChannels(e.target.value)} placeholder="Κατάστημα, E-shop, Τηλεφωνικά" />
        </CardContent>
        <CardFooter>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Αποθήκευση πεδίων & καναλιών
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
