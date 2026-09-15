"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useSyncExternalStore } from "react";
import { PasswordInput } from "./password-input";
import Link from "next/link";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { AfmInput } from "@/components/afm-input";
import {
  forgotPasswordAction,
  loginAction,
  onboardingAction,
  registerAction,
  resetPasswordAction,
  verifyTotpLoginAction,
} from "@/app/actions/auth";
import type { ActionResult } from "@/app/actions/customers";
import { DOY_LIST } from "@/lib/greek/afm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const subscribeHydration = () => () => {};

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  const ready = useSyncExternalStore(subscribeHydration, () => true, () => false);
  return (
    <Button type="submit" className="w-full" disabled={pending || !ready} data-testid="auth-submit-button" aria-busy={pending || !ready}>
      {pending || !ready ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
      {!ready ? "Προετοιμασία φόρμας…" : children}
    </Button>
  );
}

const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "Τουλάχιστον 8 χαρακτήρες", test: (v) => v.length >= 8 },
  { label: "Ένα γράμμα", test: (v) => /\p{L}/u.test(v) },
  { label: "Έναν αριθμό", test: (v) => /\d/.test(v) },
];

/** Πεδίο κωδικού με ορατές απαιτήσεις που ενημερώνονται καθώς πληκτρολογεί ο χρήστης. */
export function PasswordField({ id, name, label, autoFocus }: { id: string; name: string; label: string; autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput id={id} name={name} autoComplete="new-password" minLength={8} required autoFocus={autoFocus} value={value} onChange={(e) => setValue(e.target.value)} data-testid={`${id}-input`} aria-describedby={`${id}-rules`} />
      <ul id={`${id}-rules`} className="grid gap-1 text-[11px]" aria-live="polite" data-testid={`${id}-rules`}>
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(value);
          return (
            <li key={rule.label} className={ok ? "flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400" : "flex items-center gap-1.5 text-muted-foreground"}>
              {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ErrorAlert({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return (
    <Alert variant="destructive" data-testid="auth-error-alert">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);
  return (
    <ActionForm action={action} className="grid gap-5" data-testid="login-form">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="email">Email λογαριασμού</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus placeholder="Το email σας" data-testid="login-email-input" />
      </div>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="password">Κωδικός πρόσβασης</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:underline" data-testid="login-forgot-password">
            Ξεχάσατε τον κωδικό;
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" required placeholder="Ο κωδικός σας" data-testid="login-password-input" />
      </div>
      <ErrorAlert state={state} />
      <SubmitButton pending={pending}>{pending ? "Σύνδεση…" : "Σύνδεση στο Σύνολο"}</SubmitButton>
    </ActionForm>
  );
}

export function TotpLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(verifyTotpLoginAction, null);
  return (
    <ActionForm action={action} className="grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="code">Κωδικός επαλήθευσης</Label>
        <Input id="code" name="code" inputMode="numeric" pattern="[0-9 ]*" autoComplete="one-time-code" maxLength={7} required autoFocus className="text-center text-lg tracking-[0.4em]" placeholder="123456" />
      </div>
      <ErrorAlert state={state} />
      <SubmitButton pending={pending}>Επαλήθευση</SubmitButton>
    </ActionForm>
  );
}

export function RegisterForm({ invite, inviteEmail }: { invite?: string; inviteEmail?: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(registerAction, null);
  return (
    <ActionForm action={action} className="grid gap-5" data-testid="register-form">
      {!invite && <div className="synolo-auth-step" data-testid="register-progress"><strong>1. Λογαριασμός</strong><span>→</span><span>2. Στοιχεία επιχείρησης</span></div>}
      {invite ? <input type="hidden" name="invite" value={invite} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="name">Ονοματεπώνυμο</Label>
        <Input id="name" name="name" autoComplete="name" required autoFocus placeholder="Το όνομά σας" data-testid="register-name-input" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email λογαριασμού</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={inviteEmail ?? ""} readOnly={!!inviteEmail} placeholder="Το επαγγελματικό σας email" data-testid="register-email-input" />
      </div>
      <PasswordField id="password" name="password" label="Δημιουργήστε κωδικό" autoFocus={false} />
      <ErrorAlert state={state} />
      <SubmitButton pending={pending}>{pending ? "Δημιουργία λογαριασμού…" : invite ? "Δημιουργία λογαριασμού & αποδοχή" : "Δημιουργία λογαριασμού"}</SubmitButton>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Με την εγγραφή αποδέχεστε τους{" "}
        <Link href="/terms" className="underline" data-testid="register-terms-link">Όρους χρήσης</Link>{" "}
        και την{" "}<Link href="/privacy" className="underline" data-testid="register-privacy-link">Πολιτική απορρήτου</Link>.
      </p>
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <Alert>
        <AlertDescription>Αν υπάρχει λογαριασμός με αυτό το email, στείλαμε σύνδεσμο επαναφοράς. Ελέγξτε τα εισερχόμενά σας (ή το Outbox στις ρυθμίσεις σε τοπική εγκατάσταση).</AlertDescription>
      </Alert>
    );
  }
  return (
    <ActionForm action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoFocus />
      </div>
      <ErrorAlert state={state} />
      <SubmitButton pending={pending}>Αποστολή συνδέσμου</SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(resetPasswordAction, null);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField id="password" name="password" label="Νέος κωδικός" autoFocus />
      <div className="grid gap-2">
        <Label htmlFor="confirm">Επιβεβαίωση κωδικού</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <ErrorAlert state={state} />
      <SubmitButton pending={pending}>Αποθήκευση κωδικού</SubmitButton>
    </ActionForm>
  );
}

export function OnboardingForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(onboardingAction, null);
  return (
    <ActionForm action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Επωνυμία επιχείρησης *</Label>
        <Input id="name" name="name" required autoFocus placeholder="π.χ. Παπαδόπουλος & ΣΙΑ Ε.Ε." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="afm">ΑΦΜ *</Label>
          <AfmInput id="afm" name="afm" required placeholder="9 ψηφία" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="doy">ΔΟΥ</Label>
          <Input id="doy" name="doy" list="onb-doy" />
          <datalist id="onb-doy">
            {DOY_LIST.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="gemi">Αρ. ΓΕΜΗ</Label>
          <Input id="gemi" name="gemi" inputMode="numeric" maxLength={12} pattern="[0-9]{12}" title="12 ψηφία" placeholder="12 ψηφία (προαιρετικό)" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activity">Δραστηριότητα</Label>
          <Input id="activity" name="activity" placeholder="π.χ. Υπηρεσίες πληροφορικής" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2 sm:col-span-3">
          <Label htmlFor="address">Διεύθυνση</Label>
          <Input id="address" name="address" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="city">Πόλη</Label>
          <Input id="city" name="city" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="postalCode">Τ.Κ.</Label>
          <Input id="postalCode" name="postalCode" />
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
      <ErrorAlert state={state} />
      <SubmitButton pending={pending}>Δημιουργία επιχείρησης & έναρξη δοκιμής</SubmitButton>
      <p className="text-center text-xs text-muted-foreground">Θα δημιουργηθούν αυτόματα οι βασικές σειρές (ΤΠ, ΤΠΥ, ΑΠΥ, ΑΛΠ, ΠΤ, ΔΑ, ΠΡ). Μπορείτε να τις αλλάξετε από τις Ρυθμίσεις.</p>
    </ActionForm>
  );
}
