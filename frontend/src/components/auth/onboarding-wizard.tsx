"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ActionForm } from "@/components/ui/action-form";
import { AfmInput } from "@/components/afm-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOY_LIST } from "@/lib/greek/afm";
import { onboardingAction } from "@/app/actions/auth";
import type { ActionResult } from "@/app/actions/customers";

const STEPS = ["Στοιχεία επιχείρησης", "myDATA & τιμολόγηση", "Ολοκλήρωση"];

export function OnboardingWizard({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(onboardingAction, null);
  const [step, setStep] = useState(0);
  const [afm, setAfm] = useState("");
  const [lookup, setLookup] = useState(false);
  const [prefill, setPrefill] = useState<{ name: string; doy: string; activity: string; address: string; city: string; postalCode: string } | null>(null);
  const [env, setEnv] = useState("mock");

  const canNext = step === 0 ? afm.replace(/\D/g, "").length === 9 : true;

  const doLookup = async () => {
    setLookup(true);
    try {
      const res = await fetch("/api/afm/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ afm: afm.replace(/\D/g, "") }) });
      const json = await res.json();
      const data = json?.data;
      if (!res.ok || !json?.ok || !data?.name) {
        toast.error(json?.error ?? "Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ. Συμπληρώστε τα χειροκίνητα.");
        return;
      }
      setPrefill({ name: data.name ?? "", doy: data.doy ?? "", activity: data.activity ?? "", address: data.address ?? "", city: data.city ?? "", postalCode: data.postalCode ?? "" });
      toast.success("Τα στοιχεία συμπληρώθηκαν από το μητρώο της ΑΑΔΕ.");
    } catch {
      toast.error("Η αναζήτηση απέτυχε. Συμπληρώστε τα στοιχεία χειροκίνητα.");
    } finally {
      setLookup(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="onboarding-wizard">
      <div data-testid="onboarding-progress-bar">
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step ? "bg-emerald-600 text-white" : i === step ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={`hidden text-xs sm:block ${i === step ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
              {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
            </div>
          ))}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <Alert>
        <AlertDescription className="text-xs">
          <strong>Γιατί το βλέπω αυτό;</strong> Κάθε λογαριασμός δουλεύει μέσα σε μια επιχείρηση. Συμπληρώνουμε μία φορά τα στοιχεία του εκδότη (εμφανίζονται στα παραστατικά και στο myDATA) και μετά
          μπαίνετε κατευθείαν στο περιβάλλον εργασίας. Όλα αλλάζουν αργότερα από τις Ρυθμίσεις.
        </AlertDescription>
      </Alert>

      <ActionForm action={action} className="grid gap-4">
        <div className={step === 0 ? "grid gap-4" : "hidden"}>
          <div className="grid gap-2">
            <Label htmlFor="afm">ΑΦΜ *</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <AfmInput id="afm" name="afm" required onValueChange={setAfm} placeholder="9 ψηφία" data-testid="onboarding-afm-input" />
              </div>
              <Button type="button" variant="outline" disabled={lookup || afm.replace(/\D/g, "").length !== 9} onClick={doLookup} data-testid="onboarding-afm-lookup">
                {lookup ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                Άντληση από ΑΑΔΕ
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Βάλτε το ΑΦΜ και πατήστε «Άντληση» για αυτόματη συμπλήρωση επωνυμίας, ΔΟΥ, δραστηριότητας και διεύθυνσης.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Επωνυμία επιχείρησης *</Label>
            <Input id="name" name="name" required key={prefill?.name} defaultValue={prefill?.name ?? ""} placeholder="π.χ. Παπαδόπουλος & ΣΙΑ Ε.Ε." data-testid="onboarding-name-input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="doy">ΔΟΥ</Label>
              <Input id="doy" name="doy" list="onb-doy" key={prefill?.doy} defaultValue={prefill?.doy ?? ""} />
              <datalist id="onb-doy">
                {DOY_LIST.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="activity">Δραστηριότητα</Label>
              <Input id="activity" name="activity" key={prefill?.activity} defaultValue={prefill?.activity ?? ""} placeholder="π.χ. Υπηρεσίες πληροφορικής" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-3">
              <Label htmlFor="address">Διεύθυνση</Label>
              <Input id="address" name="address" key={prefill?.address} defaultValue={prefill?.address ?? ""} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="city">Πόλη</Label>
              <Input id="city" name="city" key={prefill?.city} defaultValue={prefill?.city ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="postalCode">Τ.Κ.</Label>
              <Input id="postalCode" name="postalCode" key={prefill?.postalCode} defaultValue={prefill?.postalCode ?? ""} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="email">Email επιχείρησης</Label>
              <Input id="email" name="email" type="email" defaultValue={defaultEmail} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Τηλέφωνο</Label>
              <Input id="phone" name="phone" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gemi">Αρ. ΓΕΜΗ (προαιρετικό)</Label>
            <Input id="gemi" name="gemi" inputMode="numeric" maxLength={12} pattern="[0-9]{12}" title="12 ψηφία" placeholder="12 ψηφία" />
          </div>
        </div>

        <div className={step === 1 ? "grid gap-4" : "hidden"}>
          <div className="grid gap-2">
            <Label>Διασύνδεση myDATA</Label>
            <Select value={env} onValueChange={setEnv}>
              <SelectTrigger data-testid="onboarding-mydata-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Προσομοίωση (δοκιμή χωρίς διαπιστευτήρια)</SelectItem>
                <SelectItem value="dev">Δοκιμαστικό περιβάλλον ΑΑΔΕ</SelectItem>
                <SelectItem value="prod">Παραγωγή ΑΑΔΕ</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="mydataEnvironment" value={env} />
            <p className="text-xs text-muted-foreground">Ξεκινήστε με προσομοίωση για να δοκιμάσετε όλη τη ροή. Αλλάζετε σε παραγωγή όποτε θέλετε από τις Ρυθμίσεις → myDATA.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mydataUserId">User ID ΑΑΔΕ</Label>
              <Input id="mydataUserId" name="mydataUserId" placeholder="προαιρετικό τώρα" data-testid="onboarding-mydata-user" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mydataSubscriptionKey">Subscription Key</Label>
              <Input id="mydataSubscriptionKey" name="mydataSubscriptionKey" placeholder="προαιρετικό τώρα" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="defaultPaymentTermsDays">Προθεσμία πληρωμής (ημέρες)</Label>
            <Input id="defaultPaymentTermsDays" name="defaultPaymentTermsDays" type="number" min="0" max="180" defaultValue={30} data-testid="onboarding-terms-input" />
            <p className="text-xs text-muted-foreground">Χρησιμοποιείται ως προεπιλογή στα νέα παραστατικά και στις αυτόματες υπενθυμίσεις.</p>
          </div>
        </div>

        <div className={step === 2 ? "grid gap-4" : "hidden"}>
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-primary" /> Τι γίνεται μόλις πατήσετε «Ολοκλήρωση»
            </div>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>· Δημιουργείται η επιχείρησή σας και ξεκινά η δωρεάν δοκιμή 14 ημερών.</li>
              <li>· Στήνονται αυτόματα οι σειρές παραστατικών (ΤΠ, ΤΠΥ, ΑΠΥ, ΑΛΠ, ΠΤ, ΔΑ, ΠΡ).</li>
              <li>· Μπαίνετε στο περιβάλλον εργασίας με έτοιμο dashboard.</li>
            </ul>
          </div>
          <div className="rounded-xl border p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-primary" /> Σύνδεση με τον λογιστή σας (μετά)
            </div>
            <p className="mt-2 text-muted-foreground">
              Από <strong>Ρυθμίσεις → Λογιστής</strong> παράγετε 6ψήφιο κωδικό ή στέλνετε πρόσκληση στο email του γραφείου και ορίζετε τι βλέπει (πλήρης / μόνο ανάγνωση / μόνο myDATA).
            </p>
          </div>
        </div>

        {state && !state.ok ? (
          <Alert variant="destructive">
            <AlertDescription data-testid="onboarding-error">{state.error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} data-testid="onboarding-back">
            Πίσω
          </Button>
          {step < 2 ? (
            <div className="flex items-center gap-2">
              {step === 1 ? (
                <Button type="button" variant="outline" onClick={() => setStep(2)} data-testid="onboarding-skip">
                  Παράλειψη
                </Button>
              ) : null}
              <Button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)} data-testid={step === 0 ? "onboarding-step-1-next" : "onboarding-step-2-next"}>
                Συνέχεια
              </Button>
            </div>
          ) : (
            <Button type="submit" disabled={pending} data-testid="onboarding-step-3-finish">
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Ολοκλήρωση & έναρξη δοκιμής
            </Button>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
