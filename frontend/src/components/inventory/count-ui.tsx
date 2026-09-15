"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2, ClipboardList, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createStockCountAction, deleteStockCountAction, postStockCountAction, setCountLineAction } from "@/app/actions/inventory";
import type { StockCountLine, Warehouse } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { cn } from "@/lib/utils";

export function NewCountDialog({ warehouses }: { warehouses: Warehouse[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "");
  const [countedAt, setCountedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClipboardList data-icon="inline-start" /> Νέα απογραφή
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Νέα απογραφή</DialogTitle>
          <DialogDescription>Δημιουργείται φύλλο καταμέτρησης με όλα τα είδη που παρακολουθούν απόθεμα και την αναμενόμενη ποσότητα της αποθήκης.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createStockCountAction({ warehouseId, countedAt, note });
              if (res.ok && res.id) {
                toast.success("Το φύλλο απογραφής δημιουργήθηκε.");
                setOpen(false);
                router.push(`/inventory/counts/${res.id}`);
              } else if (!res.ok) toast.error(res.error);
            });
          }}
        >
          <div className="grid gap-2">
            <Label>Αποθήκη</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger aria-label="Αποθήκη απογραφής">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cnt-date">Ημερομηνία καταμέτρησης</Label>
            <Input id="cnt-date" type="date" value={countedAt} onChange={(e) => setCountedAt(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cnt-note">Σημείωση</Label>
            <Input id="cnt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="π.χ. Απογραφή τέλους χρήσης 2026" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !warehouseId}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Δημιουργία
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface CountLineRow extends StockCountLine {
  productName: string;
  sku: string;
  barcode: string;
  unitCost: number;
}

function CountedInput({ line, onSaved }: { line: CountLineRow; onSaved: (v: number | null) => void }) {
  const [value, setValue] = useState(line.countedQuantity == null ? "" : String(line.countedQuantity));
  const [pending, start] = useTransition();
  const save = () => {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed != null && !Number.isFinite(parsed)) return;
    if ((parsed ?? null) === (line.countedQuantity ?? null)) return;
    start(async () => {
      const res = await setCountLineAction(line.id, parsed);
      if (res.ok) onSaved(parsed);
      else toast.error(res.error);
    });
  };
  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        step="0.001"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-28 text-right"
        aria-label={`Καταμέτρηση ${line.productName}`}
        placeholder="—"
      />
      {pending ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

export function CountLinesEditor({ countId, lines: initial, editable }: { countId: string; lines: CountLineRow[]; editable: boolean }) {
  const [lines, setLines] = useState(initial);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const filtered = q ? lines.filter((l) => l.productName.toLowerCase().includes(q.toLowerCase()) || l.sku.toLowerCase().includes(q.toLowerCase()) || l.barcode === q.trim()) : lines;
  const counted = lines.filter((l) => l.countedQuantity != null);
  const diffValue = counted.reduce((s, l) => s + ((l.countedQuantity ?? 0) - l.expectedQuantity) * l.unitCost, 0);
  const diffs = counted.filter((l) => Math.abs((l.countedQuantity ?? 0) - l.expectedQuantity) > 0.0005).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Φίλτρο / σάρωση barcode…" className="w-full sm:w-72" aria-label="Φίλτρο ειδών" />
        <div className="text-sm text-muted-foreground">
          Καταμετρήθηκαν {counted.length}/{lines.length} · {diffs} με διαφορά · αξία διαφορών <span className={cn("tabular-nums font-medium", diffValue < 0 ? "text-red-700" : diffValue > 0 ? "text-emerald-700" : "text-foreground")}>{formatMoney(diffValue)}</span>
        </div>
        {editable ? (
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteStockCountAction(countId);
                  if (res.ok) {
                    toast.success("Η απογραφή διαγράφηκε.");
                    router.push("/inventory?tab=counts");
                  } else toast.error(res.error);
                })
              }
            >
              <Trash2 data-icon="inline-start" /> Διαγραφή
            </Button>
            <Button
              disabled={pending || counted.length === 0}
              onClick={() =>
                start(async () => {
                  const res = await postStockCountAction(countId);
                  if (res.ok) {
                    toast.success(`Η απογραφή οριστικοποιήθηκε – ${res.id} διορθωτικές κινήσεις.`);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
              Οριστικοποίηση
            </Button>
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Είδος</TableHead>
              <TableHead className="hidden md:table-cell">SKU / barcode</TableHead>
              <TableHead className="text-right">Αναμενόμενο</TableHead>
              <TableHead className="text-right">Καταμέτρηση</TableHead>
              <TableHead className="text-right">Διαφορά</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Αξία διαφοράς</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => {
              const diff = l.countedQuantity == null ? null : Math.round(((l.countedQuantity ?? 0) - l.expectedQuantity) * 1000) / 1000;
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.productName}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {l.sku || "—"}
                    {l.barcode ? ` · ${l.barcode}` : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.expectedQuantity}</TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <CountedInput line={l} onSaved={(v) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, countedQuantity: v } : x)))} />
                    ) : (
                      <span className="tabular-nums">{l.countedQuantity ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", diff == null ? "text-muted-foreground" : diff < 0 ? "font-medium text-red-700" : diff > 0 ? "font-medium text-emerald-700" : "")}>
                    {diff == null ? "—" : diff > 0 ? `+${diff}` : diff}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{diff == null ? "—" : formatMoney(diff * l.unitCost)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {editable ? <p className="text-xs text-muted-foreground">Πληκτρολογήστε την καταμετρημένη ποσότητα και πατήστε Enter/Tab – αποθηκεύεται αυτόματα. Αφήστε κενό ό,τι δεν καταμετρήθηκε (δεν θα διορθωθεί). Κατά την οριστικοποίηση δημιουργούνται κινήσεις «Απογραφή» για τις διαφορές.</p> : null}
    </div>
  );
}
