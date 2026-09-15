"use client";

import { useEffect, useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import { Fingerprint, Trash2, Loader2, KeyRound, ShieldCheck } from "lucide-react";
import {
  listMyPasskeysAction,
  passkeyDeleteAction,
  passkeyRegisterOptionsAction,
  passkeyRegisterVerifyAction,
  passkeyRenameAction,
} from "@/app/actions/passkeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Row = { id: string; nickname: string; deviceType: string; backedUp: boolean; transports: string; lastUsedAt: string | null; createdAt: string };

export function PasskeysCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, startLoad] = useTransition();
  const [registering, startRegister] = useTransition();
  const [nickname, setNickname] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
    refresh();
  }, []);

  function refresh() {
    startLoad(async () => {
      const res = await listMyPasskeysAction();
      if (res.ok) setRows(res.rows);
    });
  }

  async function register() {
    startRegister(async () => {
      try {
        const opt = await passkeyRegisterOptionsAction();
        if (!opt.ok) { toast.error(opt.error); return; }
        const response = await Promise.race([
          startRegistration({ optionsJSON: opt.options }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Η δημιουργία passkey έληξε χρονικά ή ακυρώθηκε.")), 60000)),
        ]);
        const verify = await passkeyRegisterVerifyAction(opt.challengeId, response, nickname || "Passkey");
        if (!verify.ok) { toast.error(verify.error); return; }
        toast.success("Το passkey αποθηκεύτηκε.");
        setNickname("");
        refresh();
      } catch (err) {
        toast.error((err as Error).message || "Η δημιουργία passkey ακυρώθηκε.");
      }
    });
  }

  async function remove(id: string) {
    const res = await passkeyDeleteAction(id);
    if (res.ok) { toast.success("Το passkey διαγράφηκε."); refresh(); } else toast.error(res.error);
  }

  async function rename(id: string, current: string) {
    const next = prompt("Νέο όνομα για το passkey:", current) ?? "";
    if (!next.trim()) return;
    const res = await passkeyRenameAction(id, next.trim());
    if (res.ok) { toast.success("Ενημερώθηκε."); refresh(); } else toast.error(res.error);
  }

  return (
    <Card data-testid="passkeys-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="size-5 text-primary" /> Passkeys (WebAuthn / FIDO2)
        </CardTitle>
        <CardDescription>Συνδέσου χωρίς κωδικό, με το δακτυλικό αποτύπωμα, το Face ID ή το Windows Hello της συσκευής σου. Πιο ασφαλές από κωδικό + 2FA.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {supported === false ? (
          <Alert variant="destructive">
            <AlertDescription>Ο περιηγητής δεν υποστηρίζει WebAuthn/Passkeys. Δοκίμασε Chrome, Safari, Edge ή Firefox σε πρόσφατη έκδοση.</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-lg border p-4">
          <Label htmlFor="pk-nick" className="text-xs">Ονομασία συσκευής</Label>
          <div className="mt-2 flex gap-2">
            <Input id="pk-nick" data-testid="passkey-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="π.χ. iPhone εργασίας" maxLength={60} />
            <Button onClick={register} disabled={registering || supported === false} data-testid="add-passkey-btn">
              {registering ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Προσθήκη passkey
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">Οι συσκευές μου {rows.length ? <Badge variant="secondary">{rows.length}</Badge> : null}</div>
          {loading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-3 animate-spin" /> Φόρτωση…</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Δεν έχεις καταχωρημένα passkeys. Πρόσθεσε ένα για γρήγορη είσοδο χωρίς κωδικό.</p>
          ) : (
            <ul className="grid gap-2" data-testid="passkeys-list">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm" data-testid={`passkey-row-${r.id}`}>
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Fingerprint className="size-4 text-primary" />
                      <button onClick={() => rename(r.id, r.nickname)} className="hover:underline">{r.nickname || "Passkey"}</button>
                      {r.backedUp ? <Badge className="bg-emerald-600"><ShieldCheck className="mr-1 size-3" /> Cloud backup</Badge> : <Badge variant="outline">Μόνο σε συσκευή</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {r.transports ? r.transports.replaceAll(",", " · ") : "internal"} · Δημιουργία {new Date(r.createdAt).toLocaleDateString("el-GR")}
                      {r.lastUsedAt ? ` · Τελευταία χρήση ${new Date(r.lastUsedAt).toLocaleDateString("el-GR")}` : " · Δεν έχει χρησιμοποιηθεί"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(r.id)} data-testid={`delete-passkey-${r.id}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
