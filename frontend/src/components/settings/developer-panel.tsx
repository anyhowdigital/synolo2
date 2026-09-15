"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { toast } from "sonner";
import { createApiKeyAction, createWebhookAction, deleteWebhookAction, revokeApiKeyAction, toggleWebhookAction } from "@/app/actions/developer";
import type { ActionResult } from "@/app/actions/customers";
import type { ApiKey, Webhook } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {copied ? "Αντιγράφηκε" : "Αντιγραφή"}
    </Button>
  );
}

function SecretReveal({ secret, label }: { secret: string; label: string }) {
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>
        <p>Αποθηκεύστε το τώρα – για λόγους ασφαλείας δεν θα εμφανιστεί ξανά.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">{secret}</code>
          <CopyButton text={secret} />
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function ApiKeysCard({ keys, appUrl }: { keys: ApiKey[]; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, action, submitting] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await createApiKeyAction(prev, fd);
    if (res.ok && res.id) {
      setRevealed(res.id);
      setOpen(false);
    }
    return res;
  }, null);

  const revoke = (id: string) => {
    if (!confirm("Να ανακληθεί το κλειδί; Οι εφαρμογές που το χρησιμοποιούν θα σταματήσουν να έχουν πρόσβαση.")) return;
    start(async () => {
      const res = await revokeApiKeyAction(id);
      if (res.ok) toast.success("Το κλειδί ανακλήθηκε.");
      else toast.error(res.error);
    });
  };

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API κλειδιά</CardTitle>
        <CardDescription>
          Συνδέστε e-shop, ERP ή δικά σας scripts. Κάθε αίτημα στέλνει header <code className="rounded bg-muted px-1">Authorization: Bearer tc_live_…</code>. Τα κλειδιά αποθηκεύονται κρυπτογραφημένα (SHA-256).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {revealed ? <SecretReveal secret={revealed} label="Νέο API κλειδί" /> : null}
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Δεν υπάρχουν ενεργά κλειδιά. Δημιουργήστε το πρώτο για να δοκιμάσετε το API.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Όνομα</TableHead>
                <TableHead>Κλειδί</TableHead>
                <TableHead className="hidden sm:table-cell">Τελευταία χρήση</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("el-GR") : "Ποτέ"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label="Ανάκληση" disabled={pending} onClick={() => revoke(k.id)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus data-icon="inline-start" /> Νέο κλειδί
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Νέο API κλειδί</DialogTitle>
              <DialogDescription>Δώστε ένα περιγραφικό όνομα ώστε να ξέρετε ποια εφαρμογή το χρησιμοποιεί. Βάση API: {appUrl}/api/v1</DialogDescription>
            </DialogHeader>
            <ActionForm action={action} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="key-name">Όνομα</Label>
                <Input id="key-name" name="name" required placeholder="π.χ. WooCommerce e-shop" autoFocus />
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
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Δημιουργία
                </Button>
              </DialogFooter>
            </ActionForm>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

export function WebhooksCard({ hooks, events }: { hooks: Webhook[]; events: { code: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [state, action, submitting] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await createWebhookAction(prev, fd);
    if (res.ok && res.id) {
      setRevealed(res.id);
      setOpen(false);
      setSelected([]);
    }
    return res;
  }, null);

  const run = (fn: () => Promise<ActionResult>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(msg);
      else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
        <CardDescription>
          Λάβετε HTTP POST σε δικό σας URL όταν συμβαίνει κάτι (έκδοση, διαβίβαση, είσπραξη). Κάθε αίτημα υπογράφεται με HMAC-SHA256 στο header <code className="rounded bg-muted px-1">X-TC-Signature</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {revealed ? <SecretReveal secret={revealed} label="Signing secret του webhook" /> : null}
        {hooks.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Δεν έχετε ορίσει webhooks.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Γεγονότα</TableHead>
                <TableHead className="hidden sm:table-cell">Τελευταία παράδοση</TableHead>
                <TableHead>Ενεργό</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {hooks.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="max-w-64 truncate font-mono text-xs" title={h.url}>
                    {h.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {h.events === "*" ? <Badge variant="secondary">Όλα</Badge> : h.events.split(",").map((e) => <Badge key={e} variant="outline" className="font-mono text-[10px]">{e}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    {h.lastDeliveredAt ? (
                      <>
                        {new Date(h.lastDeliveredAt).toLocaleString("el-GR")} <Badge variant={h.lastStatus?.startsWith("2") ? "secondary" : "destructive"}>{h.lastStatus}</Badge>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={h.active} disabled={pending} onCheckedChange={() => run(() => toggleWebhookAction(h.id), "Ενημερώθηκε.")} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Διαγραφή"
                      disabled={pending}
                      onClick={() => {
                        if (confirm("Να διαγραφεί το webhook;")) run(() => deleteWebhookAction(h.id), "Το webhook διαγράφηκε.");
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <WebhookIcon data-icon="inline-start" /> Νέο webhook
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Νέο webhook</DialogTitle>
              <DialogDescription>Το URL πρέπει να απαντά με 2xx εντός 10 δευτερολέπτων.</DialogDescription>
            </DialogHeader>
            <ActionForm action={action} className="grid gap-4">
              <input type="hidden" name="events" value={selected.length === 0 ? "*" : selected.join(",")} />
              <div className="grid gap-2">
                <Label htmlFor="wh-url">Endpoint URL</Label>
                <Input id="wh-url" name="url" type="url" required placeholder="https://example.gr/webhooks/timologio" autoFocus />
              </div>
              <div className="grid gap-2">
                <Label>Γεγονότα (κενό = όλα)</Label>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {events.map((e) => {
                    const on = selected.includes(e.code);
                    return (
                      <label key={e.code} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${on ? "border-primary bg-primary/5" : ""}`}>
                        <input type="checkbox" className="accent-primary" checked={on} onChange={() => setSelected((s) => (on ? s.filter((x) => x !== e.code) : [...s, e.code]))} />
                        <span>
                          <span className="font-mono text-xs">{e.code}</span>
                          <span className="block text-xs text-muted-foreground">{e.label}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
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
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Δημιουργία
                </Button>
              </DialogFooter>
            </ActionForm>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

export function ApiDocsCard({ appUrl }: { appUrl: string }) {
  const base = `${appUrl}/api/v1`;
  const create = `curl -X POST ${base}/invoices \\
  -H "Authorization: Bearer tc_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "series": "ΤΠΥ",
    "customerId": "<customer-id>",
    "issueDate": "${new Date().toISOString().slice(0, 10)}",
    "paymentMethod": 6,
    "issue": true,
    "transmit": true,
    "lines": [{
      "description": "Συμβουλευτικές υπηρεσίες",
      "quantity": 2, "unitPrice": 65, "vatCategory": 1,
      "measurementUnit": 7,
      "classificationCategory": "category1_3",
      "classificationType": "E3_561_001"
    }]
  }'`;
  const verify = `const sig = req.headers["x-tc-signature"]; // "sha256=<hex>"
const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
if (sig !== expected) return res.status(401).end();`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Τεκμηρίωση API v1</CardTitle>
        <CardDescription>REST/JSON. Όλα τα endpoints απαιτούν Bearer API κλειδί και επιστρέφουν μόνο δεδομένα της επιχείρησής σας.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 text-sm">
        <div>
          <h4 className="mb-2 font-medium">Endpoints</h4>
          <Table>
            <TableBody>
              {[
                ["GET", "/invoices", "Λίστα παραστατικών · φίλτρα: status, q, from, to, customerId, kind, page, pageSize"],
                ["POST", "/invoices", "Δημιουργία πρόχειρου · issue=true για έκδοση · transmit=true για myDATA"],
                ["GET", "/invoices/{id}", "Παραστατικό με γραμμές, MARK, QR και δημόσιο σύνδεσμο"],
                ["POST", "/invoices/{id}", "Ενέργειες: { \"action\": \"issue\" | \"transmit\" | \"cancel\" | \"email\", \"to\": \"...\" }"],
                ["GET", "/customers", "Λίστα πελατών (q για αναζήτηση)"],
                ["POST", "/customers", "Δημιουργία πελάτη"],
                ["GET", "/products", "Λίστα ειδών/υπηρεσιών"],
                ["POST", "/products", "Δημιουργία είδους"],
              ].map(([m, p, d]) => (
                <TableRow key={m + p}>
                  <TableCell className="w-16">
                    <Badge variant={m === "GET" ? "secondary" : "default"} className="font-mono">
                      {m}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-medium">Παράδειγμα: έκδοση & διαβίβαση ΤΠΥ</h4>
            <CopyButton text={create} />
          </div>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{create}</pre>
        </div>
        <div>
          <h4 className="mb-2 font-medium">Επαλήθευση υπογραφής webhook (Node.js)</h4>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{verify}</pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Σώμα webhook: <code className="rounded bg-muted px-1">{`{ "id", "event", "createdAt", "data" }`}</code>. Τα σφάλματα του API επιστρέφουν <code className="rounded bg-muted px-1">{`{ "error": "...", "details"? }`}</code> με κωδικούς 400/401/404/422.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
