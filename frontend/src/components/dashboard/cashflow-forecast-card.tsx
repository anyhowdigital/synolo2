"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CashflowChart } from "@/components/reports/cashflow-chart";
import { formatDate, formatMoney } from "@/lib/invoice/totals";

type Point = { label: string; inflow: number; outflow: number; running: number };
export interface Scenario {
  key: string;
  label: string;
  delayDays: number;
  points: Point[];
  totalIn: number;
  totalOut: number;
  projected: number;
  lowest: Point;
}

export function CashflowForecastCard({
  startingCash,
  scenarios,
  vatOutflow,
  predicted,
}: {
  startingCash: number;
  scenarios: Scenario[];
  vatOutflow: { date: string; amount: number } | null;
  predicted?: { invoices: number; avgDaysLate: number };
}) {
  const [active, setActive] = useState(scenarios[0]?.key ?? "base");
  const s = scenarios.find((x) => x.key === active) ?? scenarios[0];
  const negative = s.lowest && s.lowest.running < 0;

  return (
    <Card data-testid="cashflow-forecast-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Πρόβλεψη ρευστότητας 90 ημερών</CardTitle>
            <CardDescription>
              Αναμενόμενες εισπράξεις από ανεξόφλητα τιμολόγια και συνδρομές, μείον πληρωμές προμηθευτών
              {vatOutflow ? " και την απόδοση ΦΠΑ του τριμήνου" : ""}, ανά εβδομάδα.
              {predicted && predicted.invoices > 0 ? (
                <span className="mt-1 block text-xs" data-testid="cashflow-prediction-note">
                  Οι εισπράξεις τοποθετούνται στην <strong>προβλεπόμενη</strong> ημερομηνία πληρωμής: {predicted.invoices} τιμολόγια μετατοπίστηκαν κατά ~{predicted.avgDaysLate} ημέρες
                  βάσει της συνέπειας κάθε πελάτη.
                </span>
              ) : null}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/cashflow">
              Αναλυτικά <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-1.5" data-testid="cashflow-scenarios">
          {scenarios.map((sc) => (
            <Button key={sc.key} size="sm" variant={sc.key === active ? "default" : "outline"} onClick={() => setActive(sc.key)} data-testid={`scenario-${sc.key}`}>
              {sc.label}
            </Button>
          ))}
        </div>
        {vatOutflow ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="cashflow-vat-note">
            <Receipt className="size-3.5" /> Περιλαμβάνεται απόδοση ΦΠΑ {formatMoney(vatOutflow.amount)} στις {formatDate(vatOutflow.date)}.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-4">
          <Figure label="Διαθέσιμο σήμερα" value={formatMoney(startingCash)} />
          <Figure label="Αναμενόμενες εισπράξεις" value={formatMoney(s.totalIn)} tone="pos" />
          <Figure label="Αναμενόμενες πληρωμές" value={formatMoney(s.totalOut)} tone="neg" />
          <Figure label="Πρόβλεψη σε 90 ημέρες" value={formatMoney(s.projected)} tone={s.projected >= startingCash ? "pos" : "neg"} />
        </div>
        <CashflowChart data={s.points} startingCash={startingCash} />
        {s.lowest ? (
          <p className={negative ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"} data-testid="cashflow-lowest">
            {negative
              ? `Προσοχή: στο σενάριο «${s.label}» το ταμείο εμφανίζεται αρνητικό την εβδομάδα ${s.lowest.label} (${formatMoney(s.lowest.running)}). Εξετάστε υπενθυμίσεις σε πελάτες ή αναδιάταξη πληρωμών.`
              : `Χαμηλότερο σημείο ταμείου: ${formatMoney(s.lowest.running)} την εβδομάδα ${s.lowest.label}.`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const Icon = tone === "pos" ? TrendingUp : tone === "neg" ? TrendingDown : null;
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums ${tone === "pos" ? "text-emerald-700" : tone === "neg" ? "text-amber-700" : ""}`}>
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        {value}
      </div>
    </div>
  );
}
