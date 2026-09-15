"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Link2Off, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  generateAccountantCodeAction,
  revokeAccountantCodeAction,
  inviteAccountantAction,
  cancelAccountantInviteAction,
  setFirmLinkAccessAction,
  unlinkAccountantAction,
} from "@/app/actions/firm";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/services/firm";

type Link = { id: string; firmName: string; email: string; accessLevel: AccessLevel; source: string; since: string };
type Invite = { id: string; email: string; accessLevel: string; createdAt: string };

const SOURCE: Record<string, string> = { code: "μέσω κωδικού", invite: "μέσω πρόσκλησης", afm: "μέσω αιτήματος ΑΦΜ" };

export function AccountantAccessPanel({ code, codeExpires, links, invites }: { code: string; codeExpires: string | null; links: Link[]; invites: Invite[] }) {
  const [currentCode, setCurrentCode] = useState(code);
  const [expires, setExpires] = useState(codeExpires);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<AccessLevel>("full");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6" data-testid="accountant-access-panel">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Κωδικός σύνδεσης λογιστή</CardTitle>
          <CardDescription>Δώστε τον 6ψήφιο κωδικό στον λογιστή σας. Η σύνδεση γίνεται άμεσα, χωρίς άλλη έγκριση. Ισχύει 7 ημέρες και χρησιμοποιείται μία φορά.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {currentCode ? (
            <>
              <code className="rounded-lg border bg-muted px-4 py-2 text-2xl font-semibold tracking-[0.3em] tabular-nums" data-testid="accountant-code-value">
                {currentCode}
              </code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(currentCode).then(() => toast.success("Αντιγράφηκε."))}>
                <Copy data-icon="inline-start" />
                Αντιγραφή
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                data-testid="accountant-code-revoke"
                onClick={() =>
                  start(async () => {
                    const res = await revokeAccountantCodeAction();
                    if (!res.ok) { toast.error(res.error); return; }
                    setCurrentCode("");
                    setExpires(null);
                    toast.success("Ο κωδικός ακυρώθηκε.");
                  })
                }
              >
                Ακύρωση
              </Button>
              {expires ? <span className="text-xs text-muted-foreground">Λήγει {new Date(expires).toLocaleDateString("el-GR")}</span> : null}
            </>
          ) : (
            <Button
              disabled={pending}
              data-testid="accountant-code-generate"
              onClick={() =>
                start(async () => {
                  const res = await generateAccountantCodeAction();
                  if (!res.ok) { toast.error(res.error); return; }
                  setCurrentCode(res.code);
                  setExpires(res.expiresAt);
                  toast.success("Ο κωδικός δημιουργήθηκε.");
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
              Δημιουργία κωδικού
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Πρόσκληση λογιστικού γραφείου με email</CardTitle>
          <CardDescription>Στέλνουμε πρόσκληση στο email του γραφείου· ο λογιστής την αποδέχεται από το πάνελ του.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="acc-invite-email">Email γραφείου</Label>
            <Input id="acc-invite-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="logistis@grafeio.gr" data-testid="accountant-invite-email" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-invite-note">Σημείωση</Label>
            <Input id="acc-invite-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ανάληψη από 1/7" data-testid="accountant-invite-note" />
          </div>
          <div className="space-y-1">
            <Label>Επίπεδο πρόσβασης</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as AccessLevel)}>
              <SelectTrigger data-testid="accountant-invite-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCESS_LEVELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={pending || !email.trim()}
            data-testid="accountant-invite-btn"
            onClick={() =>
              start(async () => {
                const res = await inviteAccountantAction(email, note, level);
                if (!res.ok) { toast.error(res.error); return; }
                setEmail("");
                setNote("");
                toast.success("Η πρόσκληση στάλθηκε.");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
            Αποστολή
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-4">{ACCESS_LEVELS[level].hint}</p>
        </CardContent>
      </Card>

      {invites.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Εκκρεμείς προσκλήσεις ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y text-sm" data-testid="accountant-invites">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate font-medium">{i.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {ACCESS_LEVELS[(i.accessLevel as AccessLevel) ?? "full"].label} · {new Date(i.createdAt).toLocaleDateString("el-GR")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  data-testid={`accountant-invite-cancel-${i.id}`}
                  onClick={() =>
                    start(async () => {
                      const res = await cancelAccountantInviteAction(i.id);
                      res.ok ? toast.success("Η πρόσκληση ακυρώθηκε.") : toast.error(res.error);
                    })
                  }
                >
                  Ακύρωση
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ενεργές συνεργασίες ({links.length})</CardTitle>
          <CardDescription>Ορίστε τι βλέπει το γραφείο. Η διακοπή είναι άμεση και καταγράφεται στο ιστορικό ενεργειών.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y text-sm" data-testid="accountant-links">
          {links.length === 0 ? (
            <p className="py-6 text-muted-foreground">Δεν υπάρχει συνδεδεμένο λογιστικό γραφείο.</p>
          ) : (
            links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0" data-testid={`accountant-link-${l.id}`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.firmName}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.email} · {SOURCE[l.source] ?? "μέσω αιτήματος"} · από {new Date(l.since).toLocaleDateString("el-GR")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ACCESS_LEVELS[l.accessLevel]?.label ?? l.accessLevel}</Badge>
                  <Select
                    value={l.accessLevel}
                    onValueChange={(v) =>
                      start(async () => {
                        const res = await setFirmLinkAccessAction(l.id, v as AccessLevel);
                        res.ok ? toast.success("Το επίπεδο πρόσβασης ενημερώθηκε.") : toast.error(res.error);
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[190px] text-xs" data-testid={`accountant-level-${l.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACCESS_LEVELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    data-testid={`accountant-unlink-${l.id}`}
                    onClick={() =>
                      start(async () => {
                        const res = await unlinkAccountantAction(l.id);
                        res.ok ? toast.success("Η συνεργασία διακόπηκε.") : toast.error(res.error);
                      })
                    }
                  >
                    <Link2Off data-icon="inline-start" />
                    Διακοπή
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
