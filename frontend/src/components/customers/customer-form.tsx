"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { saveCustomer, type ActionResult } from "@/app/actions/customers";
import { viesLookupAction } from "@/app/actions/developer";
import type { Customer } from "@/db/schema";
import { DOY_LIST } from "@/lib/greek/afm";
import { ActionForm } from "@/components/ui/action-form";
import { FieldError } from "@/components/ui/field-error";
import { AfmInput } from "@/components/afm-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { STAGE_OPTIONS } from "@/components/status-badge";
import { TagInput } from "@/components/tags/tag-input";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { parseCustomFieldValues, parseTags, type CustomFieldDef } from "@/lib/services/custom-fields";
import { DOCUMENT_LANGUAGES, type MemberOption } from "@/lib/i18n/languages";
import { Switch } from "@/components/ui/switch";

const COUNTRIES = [
  ["GR", "Ελλάδα"],
  ["CY", "Κύπρος"],
  ["DE", "Γερμανία"],
  ["FR", "Γαλλία"],
  ["IT", "Ιταλία"],
  ["ES", "Ισπανία"],
  ["NL", "Ολλανδία"],
  ["BE", "Βέλγιο"],
  ["AT", "Αυστρία"],
  ["DK", "Δανία"],
  ["SE", "Σουηδία"],
  ["PL", "Πολωνία"],
  ["RO", "Ρουμανία"],
  ["BG", "Βουλγαρία"],
  ["IE", "Ιρλανδία"],
  ["PT", "Πορτογαλία"],
  ["GB", "Ηνωμένο Βασίλειο"],
  ["US", "ΗΠΑ"],
  ["CH", "Ελβετία"],
  ["AL", "Αλβανία"],
  ["TR", "Τουρκία"],
];

export interface CustomerFormExtras {
  defs: CustomFieldDef[];
  members: MemberOption[];
  tagSuggestions: string[];
}

export function CustomerForm({ customer, extras }: { customer?: Customer; extras?: CustomerFormExtras }) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (previous, data) => {
    const result = await saveCustomer(previous, data);
    if (!result.ok) {
      const errors = result.fieldErrors ?? {};
      setFieldErrors(errors);
      const field = Object.keys(errors)[0];
      const input = field ? formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`) : null;
      input?.scrollIntoView({ block: "center", behavior: "smooth" });
      input?.focus({ preventScroll: true });
    }
    return result;
  }, null);
  const errorProps = (field: string) => ({ "aria-invalid": !!fieldErrors[field], "aria-describedby": fieldErrors[field] ? `customer-error-${field}` : undefined });
  const fieldError = (field: string) => <FieldError id={`customer-error-${field}`} message={fieldErrors[field]} />;
  const defs = extras?.defs ?? [];
  const members = extras?.members ?? [];
  const [kind, setKind] = useState(customer?.kind ?? "company");
  const [country, setCountry] = useState(customer?.country ?? "GR");
  const [looking, startLookup] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const setField = (name: string, value: string) => {
    const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
    if (el && value) el.value = value;
  };

  const lookup = () => {
    const afm = (formRef.current?.elements.namedItem("afm") as HTMLInputElement | null)?.value?.trim() ?? "";
    if (!afm) {
      toast.error("Συμπληρώστε πρώτα το ΑΦΜ / VAT ID.");
      return;
    }
    startLookup(async () => {
      const res = await viesLookupAction(country, afm);
      if (!res.valid) {
        toast.error(res.error ?? "Ο ΑΦΜ δεν βρέθηκε ενεργός στο VIES.");
        return;
      }
      setField("name", res.name);
      setField("address", res.street || res.address);
      setField("city", res.city);
      setField("postalCode", res.postalCode);
      toast.success(`Βρέθηκε: ${res.name || "ενεργός ΑΦΜ"} – ελέγξτε και συμπληρώστε τα υπόλοιπα στοιχεία.`);
    });
  };

  const aadeLookup = () => {
    const afm = (formRef.current?.elements.namedItem("afm") as HTMLInputElement | null)?.value?.trim() ?? "";
    if (!afm) { toast.error("Συμπληρώστε πρώτα το ΑΦΜ."); return; }
    startLookup(async () => {
      try {
        const resp = await fetch("/api/afm/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ afm }) });
        const j = await resp.json();
        if (!resp.ok || !j.ok) { toast.error(j.error ?? "Δεν βρέθηκε ο ΑΦΜ."); return; }
        const d = j.data;
        setField("name", d.name);
        setField("doy", d.doy);
        setField("activity", d.activity);
        setField("address", d.address);
        setField("city", d.city);
        setField("postalCode", d.postalCode);
        const source = j.source === "aade" ? "ΑΑΔΕ" : "δοκιμαστικά δεδομένα";
        if (j.source === "aade") toast.success(`Βρέθηκε στο μητρώο ΑΑΔΕ: ${d.name}`);
        else
          toast.warning(`Συμπληρώθηκε με ${source}: ${d.name}`, {
            description: "Δεν έχουν καταχωριστεί διαπιστευτήρια ΑΑΔΕ. Ρυθμίσεις → Αναζήτηση ΑΦΜ (ΑΑΔΕ).",
            duration: 8000,
          });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Σφάλμα αναζήτησης.");
      }
    });
  };

  return (
    <ActionForm ref={formRef} action={action} className="grid gap-6 lg:grid-cols-3" data-testid="customer-form" onInputCapture={(event) => { const field = (event.target as HTMLInputElement).name; if (field) setFieldErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== field))); }} onInvalidCapture={(event) => { const input = event.target as HTMLInputElement; setFieldErrors((previous) => ({ ...previous, [input.name]: input.validity.valueMissing ? "Συμπληρώστε αυτό το πεδίο." : input.type === "email" ? "Συμπληρώστε έγκυρο email, π.χ. name@example.gr." : "Ελέγξτε την τιμή και τα επιτρεπόμενα όρια του πεδίου." })); }}>
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="country" value={country} />

      <div className="flex flex-col gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Βασικά στοιχεία</CardTitle>
            <CardDescription>Τα στοιχεία που θα εμφανίζονται στα παραστατικά και θα διαβιβάζονται στο myDATA.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Τύπος</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Επιχείρηση / Επιτηδευματίας</SelectItem>
                  <SelectItem value="individual">Ιδιώτης</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Χώρα</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name} ({code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="name">Επωνυμία / Ονοματεπώνυμο *</Label>
              <Input id="name" name="name" required defaultValue={customer?.name ?? ""} placeholder="π.χ. Αφοί Γεωργίου Α.Ε." {...errorProps("name")} data-testid="customer-name-input" />
              {fieldError("name")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="afm">{country === "GR" ? "ΑΦΜ" : "VAT ID"} {kind === "company" && country === "GR" ? "*" : ""}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <AfmInput
                    key={country === "GR" ? "gr" : "eu"}
                    id="afm"
                    name="afm"
                    validate={country === "GR"}
                    defaultValue={customer?.afm ?? ""}
                    placeholder={country === "GR" ? "9 ψηφία" : "π.χ. DK12345678"}
                    maxLength={country === "GR" ? 9 : 20}
                    {...errorProps("afm")}
                    data-testid="customer-afm-input"
                  />
                </div>
                {kind === "company" && country === "GR" ? (
                  <Button type="button" variant="default" onClick={aadeLookup} disabled={looking} title="Αναζήτηση Βασικών Στοιχείων Μητρώου ΑΑΔΕ" data-testid="aade-lookup-btn">
                    {looking ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                    ΑΑΔΕ
                  </Button>
                ) : null}
                {kind === "company" ? (
                  <Button type="button" variant="outline" onClick={lookup} disabled={looking} title="Αναζήτηση στοιχείων στο VIES (ΕΕ)">
                    {looking ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                    VIES
                  </Button>
                ) : null}
              </div>
              {fieldError("afm")}
              {kind === "company" ? <p className="text-xs text-muted-foreground">Ένα κλικ: το «ΑΑΔΕ» φέρνει επωνυμία, ΔΟΥ & διεύθυνση από το μητρώο. Το «VIES» ελέγχει ΑΦΜ ΕΕ.</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doy">ΔΟΥ</Label>
              <Input id="doy" name="doy" list="doy-list" defaultValue={customer?.doy ?? ""} placeholder="π.χ. ΦΑΕ Αθηνών" disabled={country !== "GR"} />
              <datalist id="doy-list">
                {DOY_LIST.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="activity">Επάγγελμα / Δραστηριότητα</Label>
              <Input id="activity" name="activity" defaultValue={customer?.activity ?? ""} placeholder="π.χ. Εμπόριο ηλεκτρολογικού υλικού" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Διεύθυνση & επικοινωνία</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="address">Οδός & αριθμός</Label>
              <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city">Πόλη</Label>
              <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postalCode">Τ.Κ.</Label>
              <Input id="postalCode" name="postalCode" defaultValue={customer?.postalCode ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} {...errorProps("email")} data-testid="customer-email-input" />
              {fieldError("email")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Τηλέφωνο</Label>
              <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="contactPerson">Υπεύθυνος επικοινωνίας</Label>
              <Input id="contactPerson" name="contactPerson" defaultValue={customer?.contactPerson ?? ""} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>CRM</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Στάδιο</Label>
              <Select name="stage" defaultValue={customer?.stage ?? "customer"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="creditLimit">Πιστωτικό όριο (€)</Label>
              <Input id="creditLimit" name="creditLimit" type="number" step="0.01" min={0} defaultValue={customer?.creditLimit ?? 0} data-testid="customer-credit-limit" {...errorProps("creditLimit")} />
              {fieldError("creditLimit")}
              <p className="text-xs text-muted-foreground">0 = χωρίς όριο. Εμφανίζεται προειδοποίηση όταν το ανοιχτό υπόλοιπο το υπερβαίνει.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paymentTermsDays">Όροι πληρωμής (ημέρες)</Label>
              <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min={0} max={365} defaultValue={customer?.paymentTermsDays ?? ""} placeholder="Προεπιλογή εταιρείας" {...errorProps("paymentTermsDays")} data-testid="customer-payment-days" />
              {fieldError("paymentTermsDays")}
            </div>
            <div className="grid gap-2">
              <Label>Πωλητής / υπεύθυνος</Label>
              <Select name="salespersonId" defaultValue={customer?.salespersonId ?? "none"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Κανείς —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Γλώσσα παραστατικών</Label>
              <Select name="language" defaultValue={customer?.language ?? "el"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_LANGUAGES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Τα PDF και τα email προς τον πελάτη θα εκδίδονται σε αυτή τη γλώσσα.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Σημειώσεις</Label>
              <Textarea id="notes" name="notes" rows={5} defaultValue={customer?.notes ?? ""} placeholder="Εσωτερικές σημειώσεις – δεν εμφανίζονται στα παραστατικά." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ετικέτες & πεδία</CardTitle>
            <CardDescription>Ομαδοποίηση πελατών και επιπλέον στοιχεία. Τα πεδία ορίζονται στις Ρυθμίσεις → Πεδία & κανάλια.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Ετικέτες</Label>
              <TagInput name="tags" defaultValue={parseTags(customer?.tags)} suggestions={extras?.tagSuggestions ?? []} />
            </div>
            <CustomFieldInputs defs={defs} defaultValues={parseCustomFieldValues(customer?.customFieldsJson)} columns={1} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Τιμολόγηση Δημοσίου (B2G)</CardTitle>
            <CardDescription>Για φορείς του Δημοσίου. Τα στοιχεία αυτά είναι υποχρεωτικά στο PEPPOL και τα δίνει η αναθέτουσα αρχή. Χρησιμοποιούνται ως προεπιλογή σε κάθε παραστατικό του φορέα.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div>
                <div className="font-medium">Φορέας Δημοσίου</div>
                <p className="text-sm text-muted-foreground">Ενεργοποιεί την αποστολή μέσω PEPPOL στο κοινό σημείο παραλαβής 9933:997001671.</p>
              </div>
              <Switch name="publicEntity" defaultChecked={customer?.publicEntity ?? false} data-testid="customer-public-entity" />
            </label>
            <div className="grid gap-2">
              <Label htmlFor="b2gBuyerReference">BuyerReference (BT-10) *</Label>
              <Input id="b2gBuyerReference" name="b2gBuyerReference" defaultValue={customer?.b2gBuyerReference ?? ""} placeholder="Κωδικός δρομολόγησης φορέα" data-testid="b2g-buyer-reference" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b2gContractAdam">ΑΔΑΜ / αρ. σύμβασης (BT-12) *</Label>
              <Input id="b2gContractAdam" name="b2gContractAdam" defaultValue={customer?.b2gContractAdam ?? ""} placeholder="π.χ. 24PROC001234567" data-testid="b2g-contract-adam" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b2gProjectReference">Αναφορά έργου (BT-11) *</Label>
              <Input id="b2gProjectReference" name="b2gProjectReference" defaultValue={customer?.b2gProjectReference ?? ""} placeholder="π.χ. 1|ΑΔΑ-ΑΠΟΦΑΣΗΣ" data-testid="b2g-project-reference" />
              <p className="text-xs text-muted-foreground">Μορφή «1|…», «2|…» ή «3|…» ανάλογα με τον τύπο προϋπολογισμού που ορίζει ο φορέας.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b2gOrderReference">Αρ. παραγγελίας / εντολής (BT-13)</Label>
              <Input id="b2gOrderReference" name="b2gOrderReference" defaultValue={customer?.b2gOrderReference ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b2gBuyerIdentifier">Κωδικός Αναθέτουσας Αρχής (BT-46) *</Label>
              <Input id="b2gBuyerIdentifier" name="b2gBuyerIdentifier" defaultValue={customer?.b2gBuyerIdentifier ?? ""} placeholder="π.χ. 1017.000000000.0183 (C.A. label code — τον δίνει ο φορέας)" data-testid="b2g-buyer-identifier" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="b2gCpv">CPV σύμβασης (BT-158)</Label>
                <Input id="b2gCpv" name="b2gCpv" defaultValue={customer?.b2gCpv ?? ""} placeholder="π.χ. 72000000-5" pattern="\d{8}(-\d)?" data-testid="b2g-cpv" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b2gKae">ΚΑΕ</Label>
                <Input id="b2gKae" name="b2gKae" defaultValue={customer?.b2gKae ?? ""} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">PEPPOL endpoint λήπτη: σταθερό <code>9933:997001671</code> (ΚΕ.Δ./ΓΓΠΣΔΔ) για όλες τις Αναθέτουσες Αρχές. BT-11: «1|ΑΔΑ ανάληψης» (τακτικός), «2|ενάριθμος» (ΠΔΕ), «3|ΑΔΑ» (λοιποί). BT-12: ΑΔΑΜ ΚΗΜΔΗΣ ή «0».</p>
            <input type="hidden" name="b2gEndpointId" value="9933:997001671" />
          </CardContent>
        </Card>

        {state && !state.ok ? (
          <Alert variant="destructive">
            <AlertDescription data-testid="customer-error-summary">{state.error}{Object.keys(fieldErrors).length ? " Ελέγξτε τα επισημασμένα πεδία· τα στοιχεία σας παραμένουν στη φόρμα." : ""}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1" data-testid="customer-save-button">
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {customer ? "Αποθήκευση αλλαγών" : "Δημιουργία πελάτη"}
          </Button>
          <Button asChild variant="outline">
            <Link href={customer ? `/customers/${customer.id}` : "/customers"}>Άκυρο</Link>
          </Button>
        </div>
      </div>
    </ActionForm>
  );
}
