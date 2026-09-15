"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useTransition } from "react";
import { Loader2, MailPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { changeMemberRoleAction, inviteUserAction, removeMemberAction } from "@/app/actions/auth";
import type { ActionResult } from "@/app/actions/customers";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  expired: boolean;
}

const ROLE_HELP: Record<Role, string> = {
  owner: "Πλήρης πρόσβαση, συνδρομή & χρέωση",
  admin: "Ρυθμίσεις, χρήστες, έκδοση παραστατικών",
  member: "Έκδοση παραστατικών, πελάτες, είδη",
  accountant: "Μόνο ανάγνωση & εξαγωγές για τον λογιστή",
};

export function UsersPanel({
  members,
  invitations,
  currentUserId,
  currentRole,
  userLimit,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
  currentRole: Role;
  userLimit: number | null;
}) {
  const [pending, start] = useTransition();
  const roles: Role[] = currentRole === "owner" ? ["owner", "admin", "member"] : ["admin", "member"];
  const roleOptions = (current: Role): Role[] => (current === "accountant" ? [...roles, "accountant"] : roles);

  const changeRole = (id: string, role: Role) =>
    start(async () => {
      const res = await changeMemberRoleAction(id, role);
      if (res.ok) toast.success("Ο ρόλος ενημερώθηκε.");
      else toast.error(res.error);
    });

  const remove = (id: string, name: string) => {
    if (!confirm(`Να αφαιρεθεί ο/η ${name} από την επιχείρηση;`)) return;
    start(async () => {
      const res = await removeMemberAction(id);
      if (res.ok) toast.success("Ο χρήστης αφαιρέθηκε.");
      else toast.error(res.error);
    });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Χρήστες</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "χρήστης" : "χρήστες"}
            {userLimit !== null ? ` από ${userLimit} που επιτρέπει το πακέτο σας.` : " – απεριόριστοι χρήστες."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Χρήστης</TableHead>
                <TableHead>Ρόλος</TableHead>
                <TableHead className="hidden sm:table-cell">Από</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.userId === currentUserId;
                const locked = m.role === "owner" && currentRole !== "owner";
                return (
                  <TableRow key={m.membershipId}>
                    <TableCell>
                      <div className="font-medium">
                        {m.name} {isSelf ? <span className="text-xs text-muted-foreground">(εσείς)</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      {isSelf || locked ? (
                        <Badge variant="outline">{ROLE_LABELS[m.role]}</Badge>
                      ) : (
                        <Select value={m.role} onValueChange={(v) => changeRole(m.membershipId, v as Role)} disabled={pending || m.role === "accountant"}>
                          <SelectTrigger size="sm" className="w-40">
                            <SelectValue placeholder={m.role === "accountant" ? "Λογιστής (γραφείο)" : "Ρόλος"} />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions(m.role).map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{new Date(m.joinedAt).toLocaleDateString("el-GR")}</TableCell>
                    <TableCell>
                      {!isSelf && m.role !== "owner" ? (
                        <Button variant="ghost" size="icon-sm" aria-label="Αφαίρεση" disabled={pending} onClick={() => remove(m.membershipId, m.name)}>
                          <Trash2 />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <div className="grid gap-0.5 text-xs text-muted-foreground">
            {roles.map((r) => (
              <div key={r}>
                <span className="font-medium text-foreground">{ROLE_LABELS[r]}:</span> {ROLE_HELP[r]}
              </div>
            ))}
          </div>
          <InviteDialog roles={roles} />
        </CardFooter>
      </Card>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Εκκρεμείς προσκλήσεις</CardTitle>
            <CardDescription>Ο σύνδεσμος πρόσκλησης στάλθηκε με email και ισχύει 7 ημέρες. Χωρίς SMTP, το email βρίσκεται στην καρτέλα «Email».</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Ρόλος</TableHead>
                  <TableHead>Λήξη</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id} className={i.expired ? "opacity-60" : ""}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[i.role]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.expired ? "Έληξε" : new Date(i.expiresAt).toLocaleDateString("el-GR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function InviteDialog({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("member");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await inviteUserAction(prev, fd);
    if (res.ok) {
      toast.success("Η πρόσκληση στάλθηκε.");
      setOpen(false);
    }
    return res;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MailPlus data-icon="inline-start" /> Πρόσκληση χρήστη
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Πρόσκληση χρήστη</DialogTitle>
          <DialogDescription>Ο συνεργάτης θα λάβει email με σύνδεσμο για να δημιουργήσει λογαριασμό (ή να συνδεθεί) και να αποκτήσει πρόσβαση.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          <input type="hidden" name="role" value={role} />
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" required placeholder="logistis@example.gr" autoFocus />
          </div>
          <div className="grid gap-2">
            <Label>Ρόλος</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]} – <span className="text-muted-foreground">{ROLE_HELP[r]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Αποστολή πρόσκλησης
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
