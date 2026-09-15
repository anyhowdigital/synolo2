"use client";

import { useState, useTransition, type ReactNode } from "react";
import { format } from "date-fns";
import { ArrowLeftRight, Loader2, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteMovementAction, recordMovementAction, transferStockAction } from "@/app/actions/inventory";
import type { Warehouse } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface StockProductOption {
  id: string;
  name: string;
  sku: string | null;
  stockQuantity: number;
  costPrice: number;
  avgCost: number;
}

const KINDS = [
  { value: "in", label: "Εισαγωγή (παραλαβή)", hint: "Αυξάνει το απόθεμα. Το κόστος μονάδας ενημερώνει το μέσο σταθμικό κόστος." },
  { value: "out", label: "Εξαγωγή (ανάλωση / φύρα)", hint: "Μειώνει το απόθεμα χωρίς παραστατικό πώλησης." },
  { value: "adjustment", label: "Διόρθωση (±)", hint: "Θετική ή αρνητική ποσότητα για διόρθωση υπολοίπου." },
];

export function MovementDialog({ products, warehouses, defaultProductId, defaultWarehouseId, trigger }: { products: StockProductOption[]; warehouses: Warehouse[]; defaultProductId?: string; defaultWarehouseId?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(defaultProductId ?? products[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "");
  const [kind, setKind] = useState("in");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const product = products.find((p) => p.id === productId);

  const submit = () =>
    start(async () => {
      const res = await recordMovementAction({ productId, warehouseId, kind: kind as "in" | "out" | "adjustment", quantity: Number(quantity), unitCost: unitCost ? Number(unitCost) : undefined, note, movedAt });
      if (res.ok) {
        toast.success("Η κίνηση καταχωρήθηκε.");
        setOpen(false);
        setQuantity("1");
        setNote("");
      } else toast.error(res.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PackagePlus data-icon="inline-start" /> Νέα κίνηση
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Κίνηση αποθήκης</DialogTitle>
          <DialogDescription>Χειροκίνητη εισαγωγή, εξαγωγή ή διόρθωση. Οι πωλήσεις και οι αγορές κινούν το απόθεμα αυτόματα από τα παραστατικά.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label>Είδος *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger aria-label="Είδος">
                <SelectValue placeholder="Επιλέξτε είδος" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` · ${p.sku}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {product ? <p className="text-xs text-muted-foreground">Τρέχον συνολικό απόθεμα: {product.stockQuantity}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Αποθήκη *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger aria-label="Αποθήκη">
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
              <Label>Τύπος κίνησης</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger aria-label="Τύπος κίνησης">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-qty">Ποσότητα *</Label>
              <Input id="mv-qty" type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mv-date">Ημερομηνία</Label>
              <Input id="mv-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} />
            </div>
            {kind === "in" ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="mv-cost">Κόστος μονάδας € (προαιρετικό)</Label>
                <Input id="mv-cost" type="number" step="0.0001" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={product ? String(product.avgCost || product.costPrice) : "0,00"} />
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.value === kind)?.hint}</p>
          <div className="grid gap-2">
            <Label htmlFor="mv-note">Σημείωση</Label>
            <Textarea id="mv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="π.χ. Παραλαβή από μεταφορική / Φύρα / Δώρο σε πελάτη" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !productId || !warehouseId}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Καταχώρηση
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({ products, warehouses, defaultProductId, trigger }: { products: StockProductOption[]; warehouses: Warehouse[]; defaultProductId?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(defaultProductId ?? products[0]?.id ?? "");
  const [from, setFrom] = useState(warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "");
  const [to, setTo] = useState(warehouses.find((w) => w.id !== (warehouses.find((x) => x.isDefault)?.id ?? warehouses[0]?.id))?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [movedAt, setMovedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");

  const submit = () =>
    start(async () => {
      const res = await transferStockAction({ productId, fromWarehouseId: from, toWarehouseId: to, quantity: Number(quantity), note, movedAt });
      if (res.ok) {
        toast.success("Η μεταφορά καταχωρήθηκε.");
        setOpen(false);
      } else toast.error(res.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={warehouses.length < 2} title={warehouses.length < 2 ? "Χρειάζονται τουλάχιστον δύο αποθήκες" : undefined}>
            <ArrowLeftRight data-icon="inline-start" /> Μεταφορά
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Μεταφορά μεταξύ αποθηκών</DialogTitle>
          <DialogDescription>Ενδοδιακίνηση ποσότητας χωρίς αλλαγή του συνολικού αποθέματος.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2">
            <Label>Είδος *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger aria-label="Είδος μεταφοράς">
                <SelectValue placeholder="Επιλέξτε είδος" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` · ${p.sku}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Από αποθήκη</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger aria-label="Από αποθήκη">
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
              <Label>Προς αποθήκη</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger aria-label="Προς αποθήκη">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === from}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-qty">Ποσότητα *</Label>
              <Input id="tr-qty" type="number" step="0.001" min={0.001} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tr-date">Ημερομηνία</Label>
              <Input id="tr-date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tr-note">Σημείωση</Label>
            <Input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="π.χ. Ανεφοδιασμός καταστήματος" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending || !productId || !from || !to || from === to}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ArrowLeftRight data-icon="inline-start" />}
              Μεταφορά
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteMovementButton({ id, disabled, reason }: { id: string; disabled?: boolean; reason?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      disabled={pending || disabled}
      title={disabled ? reason : "Αναίρεση κίνησης"}
      aria-label="Αναίρεση κίνησης"
      onClick={() =>
        start(async () => {
          const res = await deleteMovementAction(id);
          if (res.ok) toast.success("Η κίνηση αναιρέθηκε.");
          else toast.error(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
