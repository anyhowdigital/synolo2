"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutGrid, Loader2, Maximize2, Minimize2, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { saveDashboardAction, type WidgetPref, type WidgetSize } from "@/app/actions/office-dashboard";
import type { WidgetData, WidgetDef } from "@/lib/services/office-widgets";

const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "md:col-span-3 lg:col-span-4",
};

const SEV_CLASS = {
  high: "text-destructive",
  medium: "text-amber-700 dark:text-amber-500",
  low: "text-muted-foreground",
} as const;

export function OfficeDashboardGrid({ prefs, data, catalog }: { prefs: WidgetPref[]; data: Record<string, WidgetData>; catalog: WidgetDef[] }) {
  const router = useRouter();
  const [items, setItems] = useState<WidgetPref[]>(prefs);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const persist = (next: WidgetPref[]) => {
    setItems(next);
    start(async () => {
      const res = await saveDashboardAction(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  const available = catalog.filter((c) => !items.some((i) => i.id === c.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending || available.length === 0} data-testid="dashboard-add-widget">
              <Plus data-icon="inline-start" /> Προσθήκη widget
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Διαθέσιμα widgets</DropdownMenuLabel>
            {available.map((c) => (
              <DropdownMenuItem key={c.id} onClick={() => persist([...items, { id: c.id, size: c.defaultSize }])} data-testid={`dashboard-add-${c.id}`}>
                <div>
                  <div className="text-sm">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing((e) => !e)} data-testid="dashboard-edit-toggle">
          <LayoutGrid data-icon="inline-start" /> {editing ? "Τέλος διάταξης" : "Διάταξη"}
        </Button>
        {editing ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => persist(catalog.slice(0, 6).map((c) => ({ id: c.id, size: c.defaultSize })))} data-testid="dashboard-reset">
            <RotateCcw data-icon="inline-start" /> Επαναφορά
          </Button>
        ) : null}
        {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="office-dashboard-grid">
        {items.map((w, idx) => {
          const def = catalog.find((c) => c.id === w.id);
          const d = data[w.id];
          if (!def) return null;
          return (
            <Card key={w.id} className={cn("flex flex-col", SIZE_CLASS[w.size])} data-testid={`widget-${w.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm">{def.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{d?.headline ?? def.description}</p>
                  </div>
                  {editing ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label="Πάνω" onClick={() => move(idx, -1)} data-testid={`widget-up-${w.id}`}>
                        <ArrowUp />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Κάτω" onClick={() => move(idx, 1)} data-testid={`widget-down-${w.id}`}>
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Μέγεθος"
                        onClick={() => persist(items.map((i) => (i.id === w.id ? { ...i, size: i.size === "sm" ? "md" : i.size === "md" ? "lg" : "sm" } : i)))}
                        data-testid={`widget-size-${w.id}`}
                      >
                        {w.size === "lg" ? <Minimize2 /> : <Maximize2 />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Αφαίρεση" onClick={() => persist(items.filter((i) => i.id !== w.id))} data-testid={`widget-remove-${w.id}`}>
                        <X />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex-1 pt-0">
                {!d || d.rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{d?.empty ?? "Δεν υπάρχουν δεδομένα."}</p>
                ) : (
                  <div className="divide-y">
                    {d.rows.map((r, i) => (
                      <div key={`${r.label}-${i}`} className="flex items-center justify-between gap-2 py-1.5 text-sm first:pt-0">
                        {r.href ? (
                          <Link href={r.href} className="min-w-0 truncate underline-offset-2 hover:underline">
                            {r.label}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate">{r.label}</span>
                        )}
                        <span className={cn("shrink-0 text-xs tabular-nums", SEV_CLASS[r.severity ?? "low"])}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-4">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Το dashboard είναι κενό. Πατήστε «Προσθήκη widget» για να το στήσετε όπως θέλετε.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Το dashboard είναι <Badge variant="outline">προσωπικό</Badge> — κάθε συνεργάτης του γραφείου βλέπει τη δική του διάταξη.
      </p>
    </div>
  );
}
