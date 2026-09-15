"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteStaffAction, removeStaffAction, cancelStaffInviteAction } from "@/app/actions/firm";
import { FIRM_ROLES, type FirmRole } from "@/lib/services/firm";

type Member = { id: string; userId: string; label: string; email: string; role: string; clients: number };
type Invite = { id: string; email: string; role: string; token: string; createdAt: string };

export function TeamPanel({
  role,
  firmName,
  owner,
  members,
  invites,
  ownerClients,
}: {
  role: FirmRole;
  firmName: string;
  owner: { id: string; label: string; email: string };
  members: Member[];
  invites: Invite[];
  ownerClients: number;
}) {
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<FirmRole>("staff");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isOwner = role === "owner";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ομάδα γραφείου</h1>
        <p className="text-sm text-muted-foreground">{firmName} · {members.length + 1} μέλη. Ο υπάλληλος βλέπει μόνο τους πελάτες που του έχουν ανατεθεί.</p>
      </div>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Πρόσκληση συνεργάτη</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="staff-email">Email συνεργάτη</Label>
              <Input id="staff-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="synergatis@grafeio.gr" data-testid="staff-email-input" />
            </div>
            <div className="space-y-1">
              <Label>Ρόλος</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as FirmRole)}>
                <SelectTrigger data-testid="staff-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">{FIRM_ROLES.partner}</SelectItem>
                  <SelectItem value="staff">{FIRM_ROLES.staff}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={pending || !email.trim()}
              data-testid="staff-invite-btn"
              onClick={() =>
                start(async () => {
                  const res = await inviteStaffAction(email, newRole);
                  if (!res.ok) { toast.error(res.error); return; }
                  setEmail("");
                  setLastUrl(res.url);
                  toast.success("Η πρόσκληση δημιουργήθηκε. Στείλτε τον σύνδεσμο στον συνεργάτη.");
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
              Πρόσκληση
            </Button>
            {lastUrl ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs sm:col-span-3" data-testid="staff-invite-url">
                <code className="min-w-0 flex-1 break-all">{lastUrl}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(lastUrl).then(() => toast.success("Αντιγράφηκε."))}>
                  <Copy data-icon="inline-start" />
                  Αντιγραφή
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Μέλη</CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm" data-testid="team-members">
          <div className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
            <div className="min-w-0">
              <div className="truncate font-medium">{owner.label}</div>
              <div className="text-xs text-muted-foreground">{owner.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{FIRM_ROLES.owner}</Badge>
              <span className="text-xs text-muted-foreground">{ownerClients} πελάτες</span>
            </div>
          </div>
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3" data-testid={`team-member-${m.id}`}>
              <div className="min-w-0">
                <div className="truncate font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{FIRM_ROLES[(m.role as FirmRole) ?? "staff"]}</Badge>
                <span className="text-xs text-muted-foreground">{m.clients} πελάτες</span>
                {isOwner ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    data-testid={`team-remove-${m.id}`}
                    onClick={() =>
                      start(async () => {
                        const res = await removeStaffAction(m.id);
                        res.ok ? toast.success("Το μέλος αφαιρέθηκε.") : toast.error(res.error);
                      })
                    }
                  >
                    <Trash2 data-icon="inline-start" />
                    Αφαίρεση
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {invites.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Εκκρεμείς προσκλήσεις ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm" data-testid="team-invites">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate font-medium">{i.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {FIRM_ROLES[(i.role as FirmRole) ?? "staff"]} · {new Date(i.createdAt).toLocaleDateString("el-GR")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/office-join/${i.token}`).then(() => toast.success("Ο σύνδεσμος αντιγράφηκε."))}>
                    <Copy data-icon="inline-start" />
                    Σύνδεσμος
                  </Button>
                  {isOwner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      data-testid={`invite-cancel-${i.id}`}
                      onClick={() =>
                        start(async () => {
                          const res = await cancelStaffInviteAction(i.id);
                          res.ok ? toast.success("Η πρόσκληση ακυρώθηκε.") : toast.error(res.error);
                        })
                      }
                    >
                      Ακύρωση
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
