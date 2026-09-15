"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveTaxProfileAction } from "@/app/actions/tax-advisor";
import { saveClientTaxProfileAction } from "@/app/actions/office-advisor";
import { LEGAL_FORM_LABELS, type TaxProfile } from "@/lib/tax/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EFKA_OPTIONS = [
  { v: "0", l: "Άγνωστη / δεν έχει οριστεί" },
  { v: "7", l: "Ειδική νέων (<5 έτη) — 156,79 €" },
  { v: "1", l: "1η κατηγορία — 254,65 €" },
  { v: "2", l: "2η κατηγορία — 303,59 €" },
  { v: "3", l: "3η κατηγορία — 361,84 €" },
  { v: "4", l: "4η κατηγορία — 432,90 €" },
  { v: "5", l: "5η κατηγορία — 516,78 €" },
  { v: "6", l: "6η κατηγορία — 669,39 €" },
];

export function TaxProfileForm({ initial, readOnly, orgId }: { initial: TaxProfile; readOnly: boolean; orgId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [p, setP] = useState<TaxProfile>(initial);
  const set = <K extends keyof TaxProfile>(k: K, v: TaxProfile[K]) => setP((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    start(async () => {
      const res = orgId ? await saveClientTaxProfileAction(orgId, p) : await saveTaxProfileAction(p);
      if (res.ok) {
        toast.success("Το φορολογικό προφίλ αποθηκεύτηκε — ο Σύμβουλος επανυπολόγισε τις ευκαιρίες.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Αποτυχία αποθήκευσης.");
      }
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="tax-profile-form">
      <div className="grid gap-1.5">
        <Label>Νομική μορφή</Label>
        <Select value={p.legalForm || "none"} onValueChange={(v) => set("legalForm", (v === "none" ? "" : v) as TaxProfile["legalForm"])} disabled={readOnly}>
          <SelectTrigger data-testid="tax-legal-form"><SelectValue placeholder="Επιλέξτε" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {Object.entries(LEGAL_FORM_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax-start">Ημ/νία έναρξης δραστηριότητας</Label>
        <Input id="tax-start" type="date" value={p.activityStartDate} onChange={(e) => set("activityStartDate", e.target.value)} disabled={readOnly} data-testid="tax-start-date" />
      </div>
      <div className="grid gap-1.5">
        <Label>Ασφαλιστική κατηγορία ΕΦΚΑ</Label>
        <Select value={String(p.efkaCategory)} onValueChange={(v) => set("efkaCategory", Number(v))} disabled={readOnly}>
          <SelectTrigger data-testid="tax-efka"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EFKA_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label>Περιοχή έδρας</Label>
        <Select value={p.region || "none"} onValueChange={(v) => set("region", (v === "none" ? "" : v) as TaxProfile["region"])} disabled={readOnly}>
          <SelectTrigger data-testid="tax-region"><SelectValue placeholder="Επιλέξτε" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="mainland">Ηπειρωτική</SelectItem>
            <SelectItem value="island_reduced">Νησί μειωμένου ΦΠΑ</SelectItem>
            <SelectItem value="small_village">Μικρός οικισμός (&lt;500 κατ.)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax-emp">Αριθμός εργαζομένων</Label>
        <Input id="tax-emp" type="number" min={0} value={p.employeesCount} onChange={(e) => set("employeesCount", Number(e.target.value))} disabled={readOnly} data-testid="tax-employees" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax-salary">Ετήσιος μικτός μισθός ιδιοκτήτη (€)</Label>
        <Input id="tax-salary" type="number" min={0} value={p.ownerSalary} onChange={(e) => set("ownerSalary", Number(e.target.value))} disabled={readOnly} data-testid="tax-owner-salary" />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox checked={p.vatExempt} onCheckedChange={(c) => set("vatExempt", !!c)} disabled={readOnly} data-testid="tax-vat-exempt" />
        Είμαι ήδη σε καθεστώς απαλλαγής ΦΠΑ (άρθρο 44)
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox checked={p.hasRnd} onCheckedChange={(c) => set("hasRnd", !!c)} disabled={readOnly} data-testid="tax-rnd" />
        Πραγματοποιώ δαπάνες Έρευνας & Ανάπτυξης (Ε&Α)
      </label>
      {p.hasRnd ? (
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="tax-rnd-spend">Ετήσιες δαπάνες Ε&Α (€)</Label>
          <Input id="tax-rnd-spend" type="number" min={0} value={p.rndSpend} onChange={(e) => set("rndSpend", Number(e.target.value))} disabled={readOnly} data-testid="tax-rnd-spend" />
        </div>
      ) : null}
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="tax-green-spend">Ετήσιες δαπάνες ενεργειακής/πράσινης αναβάθμισης (€)</Label>
        <Input id="tax-green-spend" type="number" min={0} value={p.greenSpend} onChange={(e) => set("greenSpend", Number(e.target.value))} disabled={readOnly} data-testid="tax-green-spend" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax-children">Εξαρτώμενα τέκνα</Label>
        <Input id="tax-children" type="number" min={0} value={p.children} onChange={(e) => set("children", Number(e.target.value))} disabled={readOnly} data-testid="tax-children" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tax-age">Ηλικία (για νέους ≤30)</Label>
        <Input id="tax-age" type="number" min={0} value={p.age} onChange={(e) => set("age", Number(e.target.value))} disabled={readOnly} data-testid="tax-age" />
      </div>
      {!readOnly ? (
        <div className="sm:col-span-2">
          <Button onClick={save} disabled={pending} data-testid="tax-profile-save">
            {pending ? "Αποθήκευση…" : "Αποθήκευση προφίλ & επανυπολογισμός"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
