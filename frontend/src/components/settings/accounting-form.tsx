"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useEffect } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { saveAccountingMap } from "@/app/actions/settings";
import type { ActionResult } from "@/app/actions/customers";
import { ACCOUNT_KEYS, DEFAULT_ACCOUNT_MAP, type AccountMap } from "@/lib/accounting/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AccountingMapForm({ map }: { map: AccountMap }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveAccountingMap, null);
  useEffect(() => {
    if (state?.ok) toast.success("Οι λογαριασμοί ΕΛΠ αποθηκεύτηκαν.");
  }, [state]);
  const groups = [...new Set(ACCOUNT_KEYS.map((k) => k.group))];

  return (
    <ActionForm action={action} key={JSON.stringify(map)}>
      <Card>
        <CardHeader>
          <CardTitle>Λογιστική γέφυρα ΕΛΠ – σχέδιο λογαριασμών</CardTitle>
          <CardDescription>
            Οι κωδικοί χρησιμοποιούνται στο ημερολόγιο άρθρων (Αναφορές → Ημερολόγιο ΕΛΠ) ώστε ο λογιστής να εισάγει τις κινήσεις στο πρόγραμμά του χωρίς επανακαταχώρηση. Προεπιλογή: Σχέδιο Λογαριασμών ΕΛΠ (Ν. 4308/2014, Παράρτημα Γ&apos;).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {groups.map((g) => (
            <div key={g}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ACCOUNT_KEYS.filter((k) => k.group === g).map((k) => (
                  <div key={k.key} className="grid gap-1.5">
                    <Label htmlFor={`acc-${k.key}`} className="text-xs">
                      {k.label}
                    </Label>
                    <Input id={`acc-${k.key}`} name={k.key} defaultValue={map[k.key]} placeholder={k.hint} className="font-mono" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={(e) => {
              const form = e.currentTarget.form!;
              for (const k of ACCOUNT_KEYS) (form.elements.namedItem(k.key) as HTMLInputElement).value = DEFAULT_ACCOUNT_MAP[k.key];
            }}
          >
            <RotateCcw data-icon="inline-start" /> Επαναφορά προεπιλογών
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Αποθήκευση
          </Button>
        </CardFooter>
      </Card>
    </ActionForm>
  );
}
