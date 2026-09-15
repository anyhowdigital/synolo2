"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, Wallet } from "lucide-react";
import { portalBulkCheckoutAction, portalPayWithSavedCardAction } from "@/app/actions/portal-bulk";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney } from "@/lib/invoice/totals";

export type BulkRow = { id: string; label: string; remaining: number; overdue: boolean; currency: string };

export function PortalBulkPay({ token, rows, hasCard, cardLabel }: { token: string; rows: BulkRow[]; hasCard: boolean; cardLabel: string }) {
  const [selected, setSelected] = useState<string[]>(rows.map((r) => r.id));
  const [pending, start] = useTransition();
  const total = useMemo(() => rows.filter((r) => selected.includes(r.id)).reduce((s, r) => s + r.remaining, 0), [rows, selected]);
  const currency = rows[0]?.currency ?? "EUR";
  if (rows.length === 0) return null;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = selected.length === rows.length;

  const payOnline = () =>
    start(async () => {
      const res = await portalBulkCheckoutAction(token, selected);
      if (!res.ok) { toast.error(res.error); return; }
      if ("url" in res) window.location.href = res.url;
    });

  const payWithCard = () =>
    start(async () => {
      const res = await portalPayWithSavedCardAction(token, selected);
      if (!res.ok) { toast.error(res.error); return; }
      if ("message" in res) {
        if (res.failed > 0) toast.error(res.message);
        else toast.success(res.message);
        setTimeout(() => window.location.reload(), 1200);
      }
    });

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="portal-bulk-pay">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Wallet className="size-4 text-primary" /> Πληρωμή όλων με μία κίνηση
            </div>
            <p className="text-sm text-muted-foreground">Επιλέξτε τα παραστατικά που θέλετε να εξοφλήσετε και πληρώστε τα μαζί.</p>
          </div>
          <button type="button" className="text-xs font-medium underline" onClick={() => setSelected(allSelected ? [] : rows.map((r) => r.id))} data-testid="portal-bulk-toggle-all">
            {allSelected ? "Καμία επιλογή" : "Επιλογή όλων"}
          </button>
        </div>

        <ul className="divide-y rounded-lg border bg-background">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} id={`bulk-${r.id}`} data-testid={`portal-bulk-check-${r.id}`} />
              <label htmlFor={`bulk-${r.id}`} className="flex-1 cursor-pointer">
                {r.label}
                {r.overdue ? <span className="ml-2 text-xs font-medium text-red-600">ληξιπρόθεσμο</span> : null}
              </label>
              <span className="tabular-nums">{formatMoney(r.remaining, r.currency)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            Σύνολο επιλογής: <strong className="tabular-nums" data-testid="portal-bulk-total">{formatMoney(total, currency)}</strong>
            <span className="ml-2 text-xs text-muted-foreground">({selected.length} από {rows.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasCard ? (
              <Button onClick={payWithCard} disabled={pending || selected.length === 0} variant="outline" data-testid="portal-pay-saved-card">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} Πληρωμή με {cardLabel}
              </Button>
            ) : null}
            <Button onClick={payOnline} disabled={pending || selected.length === 0} data-testid="portal-bulk-pay-btn">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />} Πληρωμή {formatMoney(total, currency)}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
