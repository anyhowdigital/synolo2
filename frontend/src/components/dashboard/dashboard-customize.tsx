"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, LayoutGrid, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { saveDashboardPrefs } from "@/app/actions/dashboard-prefs";
import { DASHBOARD_WIDGETS, type DashboardWidgetKey } from "@/lib/services/dashboard-prefs";

const LABELS = new Map(DASHBOARD_WIDGETS.map((w) => [w.key, w.label]));
const DEFAULT_ORDER = DASHBOARD_WIDGETS.map((w) => w.key) as DashboardWidgetKey[];

export function DashboardCustomize({ hidden, order }: { hidden: DashboardWidgetKey[]; order: DashboardWidgetKey[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DashboardWidgetKey[]>(order);
  const [off, setOff] = useState<DashboardWidgetKey[]>(hidden);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function move(index: number, dir: -1 | 1) {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function save() {
    startTransition(async () => {
      const res = await saveDashboardPrefs(off, rows);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Η αρχική σελίδα ενημερώθηκε.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="customize-dashboard-btn">
          <LayoutGrid data-icon="inline-start" /> Προσαρμογή
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="customize-dashboard-dialog">
        <DialogHeader>
          <DialogTitle>Προσαρμογή αρχικής σελίδας</DialogTitle>
          <DialogDescription>Επιλέξτε ποια πλαίσια εμφανίζονται και με ποια σειρά. Η ρύθμιση αφορά μόνο τον δικό σας λογαριασμό.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map((key, i) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-lg border p-2.5" data-testid={`widget-row-${key}`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-5 text-center text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate text-sm">{LABELS.get(key)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => move(i, -1)} aria-label="Μετακίνηση πάνω" data-testid={`widget-up-${key}`}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => move(i, 1)} aria-label="Μετακίνηση κάτω" data-testid={`widget-down-${key}`}>
                  <ArrowDown className="size-4" />
                </Button>
                <Switch
                  checked={!off.includes(key)}
                  onCheckedChange={(v) => setOff((prev) => (v ? prev.filter((k) => k !== key) : [...prev, key]))}
                  aria-label={`Εμφάνιση: ${LABELS.get(key)}`}
                  data-testid={`widget-toggle-${key}`}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRows(DEFAULT_ORDER);
              setOff([]);
            }}
            data-testid="reset-dashboard-btn"
          >
            <RotateCcw data-icon="inline-start" /> Επαναφορά προεπιλογών
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-dashboard-prefs">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Αποθήκευση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
