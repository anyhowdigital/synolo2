"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function preset(kind: "month" | "quarter" | "year" | "prevMonth"): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (kind === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (kind === "prevMonth") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (kind === "quarter") { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
  return [`${y}-01-01`, `${y}-12-31`];
}

/** Ενιαία πεδία εύρους ημερομηνιών (name=from/to) με placeholder «από — έως» και presets. Χρήση μέσα σε GET form. */
export function DateRangeFields({ from = "", to = "", className }: { from?: string; to?: string; className?: string }) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const apply = (e: React.MouseEvent<HTMLButtonElement>, kind: Parameters<typeof preset>[0]) => {
    const [a, b] = preset(kind);
    setF(a);
    setT(b);
    const form = e.currentTarget.form;
    if (form) requestAnimationFrame(() => form.requestSubmit());
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-testid="date-range-fields">
      <div className="relative flex min-w-0 w-full items-center gap-1 rounded-md border bg-background px-2 sm:w-auto">
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
        {!f && !t ? (
          <span className="pointer-events-none absolute left-8 text-sm text-muted-foreground" data-testid="date-range-placeholder">από — έως</span>
        ) : null}
        <Input name="from" type="date" value={f} onChange={(e) => setF(e.target.value)} aria-label="Από" title="Από" className={cn("h-8 min-w-0 w-0 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 sm:w-[9.5rem] sm:flex-none", !f && "text-transparent focus-visible:text-foreground")} data-testid="filter-from" />
        <span className="text-xs text-muted-foreground">—</span>
        <Input name="to" type="date" value={t} onChange={(e) => setT(e.target.value)} aria-label="Έως" title="Έως" className={cn("h-8 min-w-0 w-0 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 sm:w-[9.5rem] sm:flex-none", !t && "text-transparent focus-visible:text-foreground")} data-testid="filter-to" />
      </div>
      <div className="flex gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={(e) => apply(e, "month")} data-testid="preset-month">Μήνας</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={(e) => apply(e, "prevMonth")} data-testid="preset-prev-month">Προηγ.</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={(e) => apply(e, "quarter")} data-testid="preset-quarter">Τρίμηνο</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={(e) => apply(e, "year")} data-testid="preset-year">Έτος</Button>
      </div>
    </div>
  );
}
