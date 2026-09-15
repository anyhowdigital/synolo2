"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/invoice/totals";

const BRACKETS: [number, number][] = [
  [10000, 0.09],
  [20000, 0.2],
  [30000, 0.26],
  [40000, 0.34],
  [60000, 0.39],
  [Infinity, 0.44],
];

function incomeTax(t: number): number {
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of BRACKETS) {
    if (t <= prev) break;
    tax += (Math.min(t, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}

/** Συνολικός φόρος για μείγμα μισθού/μερίσματος σε ΙΚΕ/ΕΠΕ/ΑΕ με κέρδος profit. */
function totalTaxFor(profit: number, salary: number): number {
  const corpBase = Math.max(0, profit - salary);
  const corpTax = 0.22 * corpBase;
  const divTax = 0.05 * corpBase * 0.78;
  const salaryTax = incomeTax(Math.max(0, salary));
  return corpTax + divTax + salaryTax;
}

export function SalaryDividendSimulator({ netProfit }: { netProfit: number }) {
  const profit = Math.max(0, Math.round(netProfit));
  const [salary, setSalary] = useState(() => Math.round(profit / 2));

  const { totalTax, optimum, optimumTax } = useMemo(() => {
    const tt = totalTaxFor(profit, salary);
    let best = 0;
    let bestTax = Infinity;
    const step = Math.max(500, Math.round(profit / 40));
    for (let s = 0; s <= profit; s += step) {
      const t = totalTaxFor(profit, s);
      if (t < bestTax) {
        bestTax = t;
        best = s;
      }
    }
    return { totalTax: tt, optimum: best, optimumTax: bestTax };
  }, [profit, salary]);

  if (profit <= 0) return null;

  return (
    <Card className="mt-6" data-testid="salary-dividend-card">
      <CardHeader>
        <CardTitle>Προσομοίωση μισθού / μερίσματος (ΙΚΕ)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Για κέρδος {formatMoney(profit)}: σύρετε τον μισθό ιδιοκτήτη και δείτε τον συνολικό φόρο (εταιρικός 22% + μέρισμα 5% + φόρος μισθού).
        </p>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Μισθός ιδιοκτήτη</span>
            <span className="font-medium tabular-nums" data-testid="sd-salary">{formatMoney(salary)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={profit}
            step={Math.max(100, Math.round(profit / 100))}
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            className="w-full accent-primary"
            data-testid="sd-slider"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <span className="text-sm text-muted-foreground">Συνολικός φόρος</span>
          <span className="text-xl font-semibold tabular-nums" data-testid="sd-total-tax">{formatMoney(totalTax)}</span>
        </div>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:bg-emerald-950" data-testid="sd-optimum">
          Βέλτιστο μείγμα: μισθός ~{formatMoney(optimum)} → φόρος {formatMoney(optimumTax)}
          {optimumTax < totalTax ? ` (−${formatMoney(totalTax - optimumTax)} έναντι της τρέχουσας επιλογής)` : ""}
        </div>
        <p className="text-xs text-muted-foreground">Απλοποιημένος υπολογισμός (χωρίς εισφορές/αφορολόγητα) — επιβεβαιώστε με τον λογιστή σας.</p>
      </CardContent>
    </Card>
  );
}
