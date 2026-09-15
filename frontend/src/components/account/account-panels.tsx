"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  beginTotpSetupAction,
  changePasswordAction,
  confirmTotpSetupAction,
  disableTotpAction,
  resendVerificationAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateProfileAction,
} from "@/app/actions/auth";
import type { ActionResult } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ErrorAlert({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

export function ProfileCard({ name, email, emailVerifiedAt }: { name: string; email: string; emailVerifiedAt: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await updateProfileAction(prev, fd);
    if (res.ok) toast.success("Το προφίλ αποθηκεύτηκε.");
    return res;
  }, null);
  const [resending, startResend] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Προφίλ</CardTitle>
        <CardDescription>Το όνομά σας εμφανίζεται στις προσκλήσεις και στο ιστορικό ενεργειών.</CardDescription>
      </CardHeader>
      <ActionForm action={action}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="acc-name">Ονοματεπώνυμο</Label>
            <Input id="acc-name" name="name" defaultValue={name} required />
          </div>
          <div className="grid gap-2">
            <Label>Email</Label>
            <div className="flex items-center gap-2">
              <Input value={email} readOnly className="bg-muted" />
              {emailVerifiedAt ? (
                <Badge className="shrink-0 bg-emerald-600">Επαληθευμένο</Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 border-amber-500 text-amber-700">
                  Μη επαληθευμένο
                </Badge>
              )}
            </div>
            {!emailVerifiedAt ? (
              <button
                type="button"
                className="text-left text-xs text-primary underline"
                disabled={resending}
                onClick={() =>
                  startResend(async () => {
                    const res = await resendVerificationAction();
                    if (res.ok) toast.success("Στάλθηκε νέο email επαλήθευσης.");
                    else toast.error(res.error);
                  })
                }
              >
                Επαναποστολή email επαλήθευσης
              </button>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <ErrorAlert state={state} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Αποθήκευση
          </Button>
        </CardFooter>
      </ActionForm>
    </Card>
  );
}

export function PasswordCard() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await changePasswordAction(prev, fd);
    if (res.ok) toast.success("Ο κωδικός άλλαξε. Οι άλλες συσκευές αποσυνδέθηκαν.");
    return res;
  }, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Αλλαγή κωδικού</CardTitle>
        <CardDescription>Με την αλλαγή κωδικού αποσυνδέονται αυτόματα όλες οι άλλες συσκευές.</CardDescription>
      </CardHeader>
      <ActionForm action={action} key={state?.ok ? "done" : "form"}>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="pw-current">Τρέχων κωδικός</Label>
            <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-new">Νέος κωδικός</Label>
            <Input id="pw-new" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw-confirm">Επιβεβαίωση</Label>
            <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="sm:col-span-3">
            <ErrorAlert state={state} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" variant="outline" disabled={pending}>
            Αλλαγή κωδικού
          </Button>
        </CardFooter>
      </ActionForm>
    </Card>
  );
}

export function TwoFactorCard({ enabledAt }: { enabledAt: string | null }) {
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [starting, start] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await confirmTotpSetupAction(prev, fd);
    if (res.ok) {
      toast.success("Η επαλήθευση δύο βημάτων ενεργοποιήθηκε.");
      setSetup(null);
    }
    return res;
  }, null);
  const [disableState, disableAction, disabling] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await disableTotpAction(prev, fd);
    if (res.ok) toast.success("Η επαλήθευση δύο βημάτων απενεργοποιήθηκε.");
    return res;
  }, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabledAt ? <ShieldCheck className="size-5 text-emerald-600" /> : <ShieldOff className="size-5 text-muted-foreground" />}
          Επαλήθευση δύο βημάτων (2FA)
        </CardTitle>
        <CardDescription>
          Κωδικοί μίας χρήσης (TOTP) από εφαρμογή αυθεντικοποίησης. Συνιστάται ιδιαίτερα για λογαριασμούς με πρόσβαση στα κλειδιά myDATA και στη χρέωση.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {enabledAt ? (
          <>
            <p className="text-sm">
              Ενεργή από {new Date(enabledAt).toLocaleString("el-GR")}. Για απενεργοποίηση απαιτείται ο κωδικός πρόσβασης και ένας τρέχων κωδικός επαλήθευσης.
            </p>
            <ActionForm action={disableAction} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="dis-pw">Κωδικός πρόσβασης</Label>
                <Input id="dis-pw" name="password" type="password" autoComplete="current-password" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dis-code">Κωδικός 2FA</Label>
                <Input id="dis-code" name="code" inputMode="numeric" maxLength={7} required />
              </div>
              <Button type="submit" variant="destructive" disabled={disabling}>
                Απενεργοποίηση
              </Button>
              <div className="sm:col-span-3">
                <ErrorAlert state={disableState} />
              </div>
            </ActionForm>
          </>
        ) : setup ? (
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR code για εφαρμογή αυθεντικοποίησης" className="size-[220px] rounded-lg border bg-white p-2" />
            <div className="grid content-start gap-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Ανοίξτε την εφαρμογή αυθεντικοποίησης (Google Authenticator, Microsoft Authenticator, Authy, 1Password).</li>
                <li>Σαρώστε το QR ή εισάγετε χειροκίνητα το κλειδί:</li>
              </ol>
              <code className="rounded-md bg-muted px-3 py-2 text-sm break-all select-all">{setup.secret}</code>
              <ActionForm action={confirmAction} className="grid gap-2 sm:grid-cols-[200px_auto] sm:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="totp-code">Κωδικός από την εφαρμογή</Label>
                  <Input id="totp-code" name="code" inputMode="numeric" maxLength={7} placeholder="123456" required autoFocus />
                </div>
                <Button type="submit" disabled={confirming}>
                  {confirming ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Ενεργοποίηση
                </Button>
                <div className="sm:col-span-2">
                  <ErrorAlert state={confirmState} />
                </div>
              </ActionForm>
            </div>
          </div>
        ) : (
          <div>
            <Button
              onClick={() =>
                start(async () => {
                  const res = await beginTotpSetupAction();
                  if (res.ok) setSetup({ secret: res.secret, qrDataUrl: res.qrDataUrl });
                  else toast.error(res.error);
                })
              }
              disabled={starting}
            >
              {starting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Smartphone data-icon="inline-start" />}
              Ρύθμιση 2FA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface SessionRow {
  id: string;
  device: string;
  ipAddress: string;
  createdAt: string;
  lastSeenAt: string | null;
  current: boolean;
}

export function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult | void>, ok: string) =>
    start(async () => {
      const res = await fn();
      if (res && !res.ok) toast.error(res.error);
      else toast.success(ok);
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ενεργές συνδέσεις</CardTitle>
        <CardDescription>Συσκευές που είναι συνδεδεμένες στον λογαριασμό σας. Αποσυνδέστε όποια δεν αναγνωρίζετε.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Συσκευή</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Σύνδεση</TableHead>
              <TableHead>Τελευταία δραστηριότητα</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  {s.device} {s.current ? <Badge variant="secondary">Αυτή η συσκευή</Badge> : null}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.ipAddress || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString("el-GR")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString("el-GR") : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeSessionAction(s.id), "Η σύνδεση τερματίστηκε.")}>
                    <Trash2 data-icon="inline-start" /> {s.current ? "Αποσύνδεση" : "Τερματισμός"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {sessions.length > 1 ? (
        <CardFooter className="justify-end">
          <Button variant="outline" disabled={pending} onClick={() => run(() => revokeOtherSessionsAction(), "Οι άλλες συσκευές αποσυνδέθηκαν.")}>
            Αποσύνδεση όλων των άλλων συσκευών
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
