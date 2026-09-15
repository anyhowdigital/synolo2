"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { registerAccountantAction } from "@/app/actions/accountant";

export default function AccountantSignupPage() {
  const [state, action, pending] = useActionState(registerAccountantAction, null);
  return <AuthShell audience="office" title="Το γραφείο σας ξεκινά εδώ." description="Δημιουργήστε τη δική σας πύλη. Συνδέστε τις επιχειρήσεις των πελατών σας με τη δική τους έγκριση." footer={<><span>Έχετε ήδη λογαριασμό; </span><Link href="/login" className="font-semibold underline" data-testid="accountant-login-link">Συνδεθείτε</Link><p className="mt-2">Είστε επιχείρηση; <Link href="/register?type=business" className="underline" data-testid="acc-signup-business-link">Εγγραφή επιχείρησης</Link></p></>}>
    <form action={action} className="grid gap-4" data-testid="accountant-signup-form">
      <div className="grid gap-2"><Label htmlFor="firmName">Επωνυμία γραφείου</Label><Input id="firmName" name="firmName" autoComplete="organization" placeholder="Το όνομα του λογιστικού σας γραφείου" required data-testid="firm-name-input" /></div>
      <div className="grid gap-2"><Label htmlFor="name">Ονοματεπώνυμο</Label><Input id="name" name="name" autoComplete="name" required placeholder="Το όνομα του υπευθύνου" data-testid="acc-name-input" /></div>
      <div className="grid gap-2"><Label htmlFor="email">Επαγγελματικό email</Label><Input id="email" name="email" type="email" autoComplete="email" placeholder="name@office.gr" required data-testid="acc-email-input" /></div>
      <div className="grid gap-2"><Label htmlFor="password">Κωδικός πρόσβασης</Label><PasswordInput id="password" name="password" autoComplete="new-password" placeholder="Δημιουργήστε τον κωδικό σας" required minLength={8} data-testid="acc-password-input" aria-describedby="acc-password-help" /><p id="acc-password-help" className="text-[11px] text-muted-foreground" data-testid="acc-password-help">Χρησιμοποιήστε τουλάχιστον 8 χαρακτήρες.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="afm">ΑΦΜ γραφείου <span className="text-[10px] text-muted-foreground">προαιρετικό</span></Label><Input id="afm" name="afm" inputMode="numeric" placeholder="9 ψηφία" data-testid="acc-afm-input" /></div><div className="grid gap-2"><Label htmlFor="phone">Τηλέφωνο <span className="text-[10px] text-muted-foreground">προαιρετικό</span></Label><Input id="phone" name="phone" type="tel" autoComplete="tel" data-testid="acc-phone-input" /></div></div>
      <div className="grid gap-2"><Label htmlFor="city">Πόλη <span className="text-[10px] text-muted-foreground">προαιρετικό</span></Label><Input id="city" name="city" autoComplete="address-level2" data-testid="acc-city-input" /></div>
      {state && !state.ok && <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert" data-testid="acc-signup-error">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending} data-testid="acc-signup-submit">{pending && <Loader2 className="size-4 animate-spin" />}{pending ? "Δημιουργία γραφείου…" : "Δημιουργία λογαριασμού γραφείου"}</Button>
      <p className="text-[10px] leading-relaxed text-muted-foreground">Με την εγγραφή αποδέχεστε τους <Link href="/terms" className="underline" data-testid="accountant-signup-terms">Όρους χρήσης</Link> και την <Link href="/privacy" className="underline" data-testid="accountant-signup-privacy">Πολιτική απορρήτου</Link>.</p>
    </form>
  </AuthShell>;
}
