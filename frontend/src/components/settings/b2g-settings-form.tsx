"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { saveB2GSettings, type SettingsResult } from "@/app/actions/b2g";
import { B2G_PROVIDERS } from "@/lib/b2g/providers";
import type { Organization } from "@/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const FIELD_LABELS: Record<string, string> = {
  b2gBaseUrl: "Base URL παρόχου",
  b2gApiKey: "API key / token",
  b2gApiSecret: "Password / secret",
  b2gUsername: "Username / ΑΦΜ χρήστη API",
  b2gSubscriptionKey: "Subscription key",
};

export function B2GSettingsForm({ org }: { org: Organization }) {
  const [state, action, pending] = useActionState<SettingsResult | null, FormData>(saveB2GSettings, null);
  const [provider, setProvider] = useState(org.b2gProvider);
  const [environment, setEnvironment] = useState(org.b2gEnvironment);
  const [enabled, setEnabled] = useState(org.b2gEnabled);
  const [fields, setFields] = useState<Record<string, string>>({ b2gBaseUrl: org.b2gBaseUrl, b2gUsername: org.b2gUsername, b2gApiKey: "", b2gApiSecret: "", b2gSubscriptionKey: "" });
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("Οι ρυθμίσεις B2G αποθηκεύτηκαν.");
    else toast.error(state.error);
  }, [state]);

  const desc = B2G_PROVIDERS.find((p) => p.id === provider) ?? B2G_PROVIDERS[0];
  const secretFields = new Set(["b2gApiKey", "b2gApiSecret", "b2gSubscriptionKey"]);
  const stored: Record<string, string> = {
    b2gBaseUrl: org.b2gBaseUrl,
    b2gUsername: org.b2gUsername,
    b2gApiKey: org.b2gApiKey,
    b2gApiSecret: org.b2gApiSecret,
    b2gSubscriptionKey: org.b2gSubscriptionKey,
  };

  return (
    <ActionForm action={action}>
      <Card data-testid="b2g-settings-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-5 text-primary" /> Τιμολόγηση Δημοσίου (B2G / PEPPOL)
            <Badge variant={org.b2gEnabled ? "default" : "outline"}>{org.b2gEnabled ? "Ενεργό" : "Ανενεργό"}</Badge>
          </CardTitle>
          <CardDescription>
            Τα παραστατικά προς φορείς του Δημοσίου διαβιβάζονται ως PEPPOL BIS Billing 3.0 (UBL 2.1) μέσω πιστοποιημένου παρόχου. Το κοινό σημείο παραλαβής του ελληνικού Δημοσίου είναι
            <span className="mx-1 font-mono text-xs">9933:997001671</span>. Χωρίς διαπιστευτήρια, λειτουργεί σε προσομοίωση: παράγεται και αποθηκεύεται το XML.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Ενεργοποίηση τιμολόγησης Δημοσίου</div>
              <p className="text-sm text-muted-foreground">Εμφανίζει το πάνελ αποστολής B2G στα παραστατικά φορέων Δημοσίου.</p>
            </div>
            <Switch name="b2gEnabled" checked={enabled} onCheckedChange={setEnabled} data-testid="b2g-enabled-switch" />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Αυτόματη αποστολή μετά την έκδοση</div>
              <p className="text-sm text-muted-foreground">
                Κάθε παραστατικό προς φορέα Δημοσίου φεύγει αμέσως μόλις εκδοθεί, χωρίς δεύτερο κλικ. Αν λείπει υποχρεωτικό στοιχείο (π.χ. ΑΔΑΜ), η έκδοση ολοκληρώνεται κανονικά και λαμβάνετε ειδοποίηση
                με το τι λείπει.
              </p>
            </div>
            <Switch name="b2gAutoSend" defaultChecked={org.b2gAutoSend} data-testid="b2g-autosend-switch" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Πάροχος</Label>
              <Select name="b2gProvider" value={provider} onValueChange={setProvider}>
                <SelectTrigger data-testid="b2g-provider-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {B2G_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Περιβάλλον</Label>
              <Select name="b2gEnvironment" value={environment} onValueChange={setEnvironment}>
                <SelectTrigger data-testid="b2g-env-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Δοκιμαστικό (UAT)</SelectItem>
                  <SelectItem value="prod">Παραγωγή</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {environment === "prod" && provider !== "simulation" && <Alert data-testid="b2g-production-warning"><AlertDescription>
            <label className="flex items-start gap-3"><input type="checkbox" name="confirmProduction" required={enabled} className="mt-1 size-4 shrink-0" data-testid="b2g-confirm-production" />
              <span>Κατανοώ ότι οι αποστολές θα γίνονται στην παραγωγή. Η αποθήκευση ρυθμίσεων δεν στέλνει παραστατικά· η αυτόματη αποστολή εκτελείται με κάθε νέα έκδοση.</span>
            </label>
          </AlertDescription></Alert>}
          {provider === "simulation" && <p className="text-sm text-muted-foreground" data-testid="b2g-settings-simulation">Δεν γίνεται πραγματική αποστολή. Τα αποθηκευμένα διαπιστευτήρια διατηρούνται όταν επιλέγετε προσομοίωση.</p>}
          {state && !state.ok && <Alert variant="destructive" data-testid="b2g-settings-error"><AlertDescription>{state.error}</AlertDescription></Alert>}
          <Alert>
            <AlertDescription className="text-sm">{desc.help}</AlertDescription>
          </Alert>

          {desc.fields.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {desc.fields.map((f) => (
                <div key={f} className="grid gap-2">
                  <Label htmlFor={f}>
                    {FIELD_LABELS[f]} {secretFields.has(f) && stored[f] ? <Badge variant="outline" className="ml-1">αποθηκευμένο</Badge> : null}
                  </Label>
                  <Input
                    id={f}
                    name={f}
                    type={secretFields.has(f) ? "password" : "text"}
                    value={fields[f] ?? ""}
                    onChange={(event) => setFields((previous) => ({ ...previous, [f]: event.target.value }))}
                    placeholder={secretFields.has(f) ? (stored[f] ? "•••••••• (κενό = διατήρηση)" : "") : f === "b2gBaseUrl" ? (desc.defaultBaseUrl?.test ?? "https://…") : ""}
                    data-testid={`b2g-field-${f}`}
                  />
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="eInvoiceProviderName">Πάροχος ηλεκτρονικής τιμολόγησης</Label>
              <Input id="eInvoiceProviderName" name="eInvoiceProviderName" defaultValue={org.eInvoiceProviderName} placeholder="Επωνυμία πιστοποιημένου παρόχου" data-testid="provider-name-input" />
              <p className="text-xs text-muted-foreground">Αναγράφεται στο υποσέλιδο κάθε παραστατικού, όπως απαιτείται όταν η έκδοση ή η διαβίβαση γίνεται μέσω παρόχου.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eInvoiceProviderAfm">ΑΦΜ παρόχου</Label>
              <Input id="eInvoiceProviderAfm" name="eInvoiceProviderAfm" defaultValue={org.eInvoiceProviderAfm} inputMode="numeric" maxLength={9} data-testid="provider-afm-input" />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending} data-testid="b2g-save-btn">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Αποθήκευση
          </Button>
        </CardFooter>
      </Card>
    </ActionForm>
  );
}
