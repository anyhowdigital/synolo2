"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, BadgeEuro, Ban, CalendarClock, Check, Loader2, Mail, Phone, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { executeCollectionAction, proposeCollectionsAction, type CollectionAction, type CollectionActionKind } from "@/app/actions/collections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/invoice/totals";
import { cn } from "@/lib/utils";

const KIND: Record<CollectionActionKind, { label: string; icon: typeof Mail }> = {
  send_reminder: { label: "Υπενθύμιση με email", icon: Mail },
  late_charges: { label: "Χρέωση τόκων υπερημερίας", icon: BadgeEuro },
  credit_limit: { label: "Πιστωτικό όριο", icon: Ban },
  call_task: { label: "Εργασία τηλεφωνήματος", icon: Phone },
  installment_plan: { label: "Διακανονισμός σε δόσεις", icon: CalendarClock },
};

export function CollectionsAgent() {
  const [summary, setSummary] = useState("");
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [done, setDone] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [running, setRunning] = useState<string | null>(null);

  const analyse = () =>
    startLoad(async () => {
      const res = await proposeCollectionsAction();
      if (!res.ok) {
        toast.error(res.error);
        setActions([]);
        setSummary("");
        return;
      }
      setSummary(res.summary);
      setActions(res.actions);
      setDone({});
      toast.success(`${res.actions.length} προτάσεις προς έγκριση.`);
    });

  const patch = (id: string, p: Partial<CollectionAction>) => setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));

  const approve = async (action: CollectionAction, confirmed: boolean) => {
    setRunning(action.id);
    const res = await executeCollectionAction(action, confirmed);
    setRunning(null);
    setConfirming(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.message);
    setDone((d) => ({ ...d, [action.id]: res.message }));
  };

  return (
    <Card data-testid="collections-agent">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Πράκτορας εισπράξεων
          </span>
          <Button size="sm" onClick={analyse} disabled={loading} data-testid="collections-analyse-btn">
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            Ανάλυση κακοπληρωτών
          </Button>
        </CardTitle>
        <CardDescription>
          Ο βοηθός προτείνει ενέργειες για τους ληξιπρόθεσμους πελάτες. <strong>Τίποτα δεν εκτελείται χωρίς τη δική σας έγκριση</strong> – κάθε ενέργεια εγκρίνεται ξεχωριστά και καταγράφεται στο
          ιστορικό ενεργειών.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary ? <p className="rounded-lg border bg-muted/40 p-3 text-sm">{summary}</p> : null}

        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Πατήστε «Ανάλυση κακοπληρωτών» για να δείτε προτεινόμενες ενέργειες.</p>
        ) : (
          actions.map((a) => {
            const meta = KIND[a.kind];
            const Icon = meta.icon;
            const finished = done[a.id];
            return (
              <div
                key={a.id}
                data-testid={`collection-action-${a.kind}`}
                className={cn("rounded-xl border p-3", finished ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20" : a.risk === "high" && "border-amber-300")}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium break-words">
                        {meta.label} · {a.customerName}
                      </div>
                      <div className="text-xs text-muted-foreground break-words">
                        {a.invoiceNumber ? `${a.invoiceNumber} · ` : ""}
                        {a.amount ? formatMoney(a.amount) : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {a.needsDoubleConfirm ? <Badge variant="outline" className="text-amber-700">Διπλή επιβεβαίωση</Badge> : null}
                    <Badge variant={a.risk === "high" ? "destructive" : a.risk === "medium" ? "default" : "secondary"}>
                      {a.risk === "high" ? "Σκληρή" : a.risk === "medium" ? "Μέτρια" : "Ήπια"}
                    </Badge>
                  </div>
                </div>

                <p className="mt-2 text-sm">{a.reason}</p>

                {a.kind === "send_reminder" ? (
                  <div className="mt-3 space-y-2">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Παραλήπτης</Label>
                      <Input value={a.to} onChange={(e) => patch(a.id, { to: e.target.value })} placeholder="email πελάτη" disabled={!!finished} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Θέμα</Label>
                      <Input value={a.subject ?? ""} onChange={(e) => patch(a.id, { subject: e.target.value })} disabled={!!finished} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Κείμενο (μπορείτε να το επεξεργαστείτε πριν την έγκριση)</Label>
                      <Textarea value={a.body ?? ""} onChange={(e) => patch(a.id, { body: e.target.value })} rows={8} disabled={!!finished} data-testid="collection-email-body" />
                    </div>
                  </div>
                ) : null}

                {a.kind === "credit_limit" ? (
                  <div className="mt-3 grid max-w-[220px] gap-1.5">
                    <Label className="text-xs">Νέο πιστωτικό όριο (€)</Label>
                    <Input type="number" min={0} step="50" value={a.creditLimit ?? 0} onChange={(e) => patch(a.id, { creditLimit: Number(e.target.value) })} disabled={!!finished} />
                  </div>
                ) : null}

                {a.kind === "installment_plan" && a.installments?.length ? (
                  <ul className="mt-3 space-y-1 rounded-lg bg-muted/40 p-2 text-xs">
                    {a.installments.map((i, idx) => (
                      <li key={idx} className="flex justify-between gap-2 tabular-nums">
                        <span>{i.date}</span>
                        <span>{formatMoney(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {finished ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700">
                    <Check className="size-4" /> {finished}
                  </p>
                ) : confirming === a.id ? (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:bg-amber-950/20">
                    <p className="flex items-start gap-1.5 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                      Επιβεβαιώνετε την εκτέλεση; {a.amount ? `Αφορά ποσό ${formatMoney(a.amount)}.` : ""} Η ενέργεια δεν αναιρείται αυτόματα.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void approve(a, true)} disabled={running === a.id} data-testid="collection-confirm-btn">
                        {running === a.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                        Ναι, εκτέλεσε
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Άκυρο
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => (a.needsDoubleConfirm ? setConfirming(a.id) : void approve(a, false))}
                      disabled={running === a.id}
                      data-testid={`collection-approve-${a.kind}`}
                    >
                      {running === a.id ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                      Έγκριση & εκτέλεση
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setActions((prev) => prev.filter((x) => x.id !== a.id))} data-testid="collection-reject-btn">
                      <X data-icon="inline-start" /> Απόρριψη
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
