"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/invoice/totals";

export interface MonthPoint {
  key: string;
  label: string;
  net: number;
  vat: number;
  collected: number;
  expenses: number;
}

const SERIES: Record<string, string> = { net: "Καθαρά έσοδα", expenses: "Έξοδα", collected: "Εισπράξεις" };

function compact(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString("el-GR", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("el-GR", { maximumFractionDigits: 0 });
}

export function RevenueChart({ data }: { data: MonthPoint[] }) {
  const empty = data.every((d) => d.net === 0 && d.expenses === 0 && d.collected === 0);
  if (empty) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Δεν υπάρχουν κινήσεις τους τελευταίους 12 μήνες.</div>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
            formatter={(value, name) => [formatMoney(Number(value)), SERIES[String(name)] ?? String(name)]}
            labelFormatter={(label, payload) => {
              const p = payload?.[0]?.payload as MonthPoint | undefined;
              return p ? `${label} · ΦΠΑ εκροών ${formatMoney(p.vat)}` : String(label);
            }}
          />
          <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{SERIES[v] ?? v}</span>} iconType="circle" iconSize={8} />
          <Bar dataKey="net" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expenses" fill="var(--chart-2, #f59e0b)" radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.85} />
          <Line type="monotone" dataKey="collected" stroke="var(--chart-3, #10b981)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
