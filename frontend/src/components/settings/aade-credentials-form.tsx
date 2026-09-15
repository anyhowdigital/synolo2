"use client";

import { useActionState, useTransition, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { saveAadeCredentials, testAadeCredentials, type ActionResult } from "@/app/actions/aade-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function AadeCredentialsForm({ username, hasPassword }: { username: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveAadeCredentials, null);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<string | null>(null);
  if (state && state.ok) { /* revalidated */ }
  if (state && !state.ok) toast.error(state.error);

  function runTest() {
    setTestResult(null);
    startTest(async () => {
      const res = await testAadeCredentials();
      if (!res.ok) { toast.error(res.error); return; }
      setTestResult(
        res.source === "aade"
          ? `Επιτυχής σύνδεση με την ΑΑΔΕ. Επιστράφηκαν στοιχεία για το ΑΦΜ της επιχείρησης: ${(res.sample as { name?: string } | undefined)?.name ?? "—"}`
          : "Η κλήση ολοκληρώθηκε αλλά ΧΩΡΙΣ διαπιστευτήρια ΑΑΔΕ – επιστράφηκαν δοκιμαστικά δεδομένα. Αποθηκεύστε username και password και δοκιμάστε ξανά.",
      );
      if (res.source === "aade") toast.success("Η σύνδεση με την ΑΑΔΕ λειτουργεί.");
      else toast.warning("Δοκιμαστικά δεδομένα – ελέγξτε τα διαπιστευτήρια.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Διαπιστευτήρια ΑΑΔΕ (RgWsPublic2)</CardTitle>
        <CardDescription>
          Αναζήτηση Βασικών Στοιχείων Μητρώου (ΑΦΜ → επωνυμία, ΔΟΥ, δραστηριότητα, διεύθυνση). Χρειάζεστε username και password που χορηγεί η ΑΑΔΕ κατόπιν αίτησης στο myAADE (Ψηφιακές Υπηρεσίες → «Αίτηση
          χορήγησης κωδικών web service» → υπηρεσία <strong>RgWsPublic2</strong> / wspublicreg). Όσο δεν είναι καταχωρισμένα, η αναζήτηση επιστρέφει <strong>δοκιμαστικά δεδομένα</strong>. Αν είναι
          καταχωρισμένα και η κλήση αποτύχει, εμφανίζεται το σφάλμα της ΑΑΔΕ αντί δοκιμαστικών στοιχείων.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="aadeRgUsername">Username</Label>
            <Input id="aadeRgUsername" name="aadeRgUsername" defaultValue={username} placeholder="π.χ. mycompany_afm" data-testid="aade-username-input" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="aadeRgPassword">Password {hasPassword ? <Badge variant="outline" className="ml-1">αποθηκευμένο</Badge> : null}</Label>
            <Input id="aadeRgPassword" name="aadeRgPassword" type="password" placeholder={hasPassword ? "Αποθηκευμένος – αφήστε κενό για διατήρηση" : ""} data-testid="aade-password-input" />
          </div>
          {testResult ? (
            <Alert className="sm:col-span-2">
              <AlertDescription>{testResult}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-between">
          <Button type="button" variant="outline" onClick={runTest} disabled={testing} title={!username ? "Αποθηκεύστε πρώτα διαπιστευτήρια ΑΑΔΕ" : undefined} data-testid="aade-test-btn">
            {testing ? <><Loader2 className="size-4 animate-spin" /> Δοκιμή…</> : "Δοκιμή σύνδεσης"}
          </Button>
          <Button type="submit" disabled={pending} data-testid="aade-save-btn">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Αποθήκευση
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
