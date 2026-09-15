"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptStaffInviteAction } from "@/app/actions/firm";

export function StaffJoinForm({ token, needsAccount }: { token: string; needsAccount: boolean }) {
  const [state, action, pending] = useActionState(acceptStaffInviteAction, null);
  return (
    <form action={action} className="space-y-3" data-testid="staff-join-form">
      <input type="hidden" name="token" value={token} />
      {needsAccount ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="name">Ονοματεπώνυμο</Label>
            <Input id="name" name="name" required data-testid="join-name-input" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Κωδικός (τουλάχιστον 8 χαρακτήρες)</Label>
            <Input id="password" name="password" type="password" required minLength={8} data-testid="join-password-input" />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Έχετε ήδη λογαριασμό με αυτό το email. Πατήστε «Αποδοχή» για να μπείτε στην ομάδα του γραφείου.</p>
      )}
      {state && !state.ok ? (
        <p className="text-sm text-destructive" data-testid="join-error">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending} data-testid="join-submit">
        {pending ? "Γίνεται αποδοχή…" : "Αποδοχή πρόσκλησης"}
      </Button>
    </form>
  );
}
