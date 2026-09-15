"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function presets() {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const start = (yy: number, mm: number, dd = 1) => iso(new Date(Date.UTC(yy, mm, dd)));
  const end = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm + 1, 0)));
  const quarter = Math.floor(m / 3);
  return [
    { key: "today", label: "Σήμερα", from: iso(today), to: iso(today) },
    { key: "7d", label: "7 ημέρες", from: iso(new Date(today.getTime() - 6 * 86400000)), to: iso(today) },
    { key: "30d", label: "30 ημέρες", from: iso(new Date(today.getTime() - 29 * 86400000)), to: iso(today) },
    { key: "month", label: "Τρέχων μήνας", from: start(y, m), to: end(y, m) },
    { key: "prev-month", label: "Προηγούμενος μήνας", from: start(y, m - 1), to: end(y, m - 1) },
    { key: "quarter", label: "Τρίμηνο", from: start(y, quarter * 3), to: end(y, quarter * 3 + 2) },
    { key: "year", label: "Έτος", from: start(y, 0), to: end(y, 11) },
  ];
}

/** Κοινός επιλογέας εύρους ημερομηνιών: γράφει ?from=&to= (και ?cmp=1 για σύγκριση). */
export function DateRangePicker({ from, to, compare = false, showCompare = true, className }: { from: string; to: string; compare?: boolean; showCompare?: boolean; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const apply = (nf: string, nt: string, cmp = compare) => {
    const q = new URLSearchParams(params.toString());
    q.set("from", nf);
    q.set("to", nt);
    if (cmp) q.set("cmp", "1");
    else q.delete("cmp");
    setOpen(false);
    router.push(`${pathname}?${q.toString()}`);
  };

  const label = from === to ? from : `${from} → ${to}`;
  const active = presets().find((p) => p.from === from && p.to === to);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="date-range-trigger">
            <CalendarRange data-icon="inline-start" />
            {active ? active.label : label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 space-y-3 p-3">
          <div className="grid grid-cols-2 gap-1.5">
            {presets().map((p) => (
              <Button key={p.key} variant={active?.key === p.key ? "default" : "ghost"} size="sm" className="justify-start" onClick={() => apply(p.from, p.to)} data-testid={`date-preset-${p.key}`}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="dr-from">
                  Από
                </label>
                <Input id="dr-from" type="date" value={f} onChange={(e) => setF(e.target.value)} data-testid="date-from" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="dr-to">
                  Έως
                </label>
                <Input id="dr-to" type="date" value={t} onChange={(e) => setT(e.target.value)} data-testid="date-to" />
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={() => apply(f, t)} data-testid="date-apply">
              Εφαρμογή
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {showCompare ? (
        <Button variant={compare ? "secondary" : "ghost"} size="sm" onClick={() => apply(from, to, !compare)} data-testid="date-compare-toggle">
          {compare ? "Σύγκριση: ναι" : "Σύγκριση με προηγ."}
        </Button>
      ) : null}
    </div>
  );
}
