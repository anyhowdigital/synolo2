"use client";

import { useMemo, useState, useTransition } from "react";
import { Banknote, CreditCard, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { posCheckout, type PosInput } from "@/app/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/invoice/totals";

type Product = { id: string; name: string; sku: string; unitPrice: number; vatCategory: number; category: string; classificationCategory: string; classificationType: string; measurementUnit: number };
type Series = { id: string; code: string; name: string; invoiceType: string };
type Customer = { id: string; name: string };
type Account = { id: string; name: string; kind: string; isDefault: boolean };

interface CartItem extends Product {
  quantity: number;
  discountPercent: number;
}

const PAYMENT_METHODS = [
  { value: 3, label: "Μετρητά", icon: Banknote },
  { value: 4, label: "Κάρτα (POS)", icon: CreditCard },
  { value: 1, label: "Τραπεζικός λογ.", icon: CreditCard },
  { value: 5, label: "Επί πιστώσει", icon: ShoppingCart },
];

const vatRate = (cat: number) => (cat === 1 ? 0.24 : cat === 2 ? 0.13 : cat === 3 ? 0.06 : cat === 4 ? 0.17 : cat === 5 ? 0.09 : cat === 6 ? 0.04 : 0);

export function PosScreen({ series, products, categories, customers, accounts }: { series: Series[]; products: Product[]; categories: string[]; customers: Customer[]; accounts: Account[] }) {
  const [seriesId, setSeriesId] = useState(series[0]?.id ?? "");
  const [customerId, setCustomerId] = useState<string>("none");
  const [paymentMethod, setPaymentMethod] = useState<number>(3);
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [accountId, setAccountId] = useState<string>(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "none");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    }).slice(0, 60);
  }, [products, search, category]);

  const totals = useMemo(() => {
    let net = 0, vat = 0;
    for (const item of cart) {
      const lineNet = item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
      net += lineNet;
      vat += lineNet * vatRate(item.vatCategory);
    }
    return { net: +net.toFixed(2), vat: +vat.toFixed(2), gross: +(net + vat).toFixed(2) };
  }, [cart]);

  const change = amountReceived && paymentMethod === 3 ? Math.max(0, Number(amountReceived) - totals.gross) : 0;

  function addProduct(p: Product) {
    setCart((prev) => {
      const existing = prev.find((x) => x.id === p.id);
      if (existing) return prev.map((x) => (x.id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...prev, { ...p, quantity: 1, discountPercent: 0 }];
    });
  }
  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.flatMap((x) => {
      if (x.id !== id) return [x];
      const q = x.quantity + delta;
      return q <= 0 ? [] : [{ ...x, quantity: q }];
    }));
  }
  function removeItem(id: string) {
    setCart((prev) => prev.filter((x) => x.id !== id));
  }
  function clearCart() {
    setCart([]);
    setAmountReceived("");
  }

  function submit() {
    if (cart.length === 0) { toast.error("Το καλάθι είναι άδειο."); return; }
    if (!seriesId) { toast.error("Επιλέξτε σειρά παραστατικού."); return; }
    const payload: PosInput = {
      seriesId,
      customerId: customerId === "none" ? null : customerId,
      paymentMethod,
      amountReceived: paymentMethod === 3 || paymentMethod === 4 ? (Number(amountReceived) || totals.gross) : 0,
      accountId: accountId === "none" ? null : accountId,
      notes: "",
      lines: cart.map((c) => ({
        productId: c.id,
        description: c.name,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        discountPercent: c.discountPercent,
        vatCategory: c.vatCategory,
        classificationCategory: c.classificationCategory,
        classificationType: c.classificationType,
        measurementUnit: c.measurementUnit,
      })),
    };
    startTransition(async () => {
      try {
        const res = await posCheckout(payload);
        if (res && !res.ok) toast.error(res.error);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("NEXT_REDIRECT")) toast.error(msg);
      }
    });
  }

  if (series.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm">
        Δεν βρέθηκε ενεργή σειρά αποδείξεων λιανικής. Δημιουργήστε μία σειρά ΑΛΠ (τύπος 11.1) ή ΑΠΥ (11.2) στις <a className="underline" href="/settings?tab=series">Ρυθμίσεις &gt; Σειρές</a>.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
      {/* Products grid */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Αναζήτηση είδους ή SKU…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="pos-search" />
          </div>
          {categories.length > 0 ? (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-52" data-testid="pos-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλες οι κατηγορίες</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Καμία αντιστοίχιση.</div>
          ) : filteredProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="group flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
              data-testid={`pos-product-${p.id}`}
            >
              <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
              {p.sku ? <div className="text-[11px] text-muted-foreground">{p.sku}</div> : null}
              <div className="mt-auto text-lg font-semibold tabular-nums">{formatMoney(p.unitPrice * (1 + vatRate(p.vatCategory)))}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-4 lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2"><ShoppingCart className="size-4" /> Καλάθι ({cart.length})</h2>
          {cart.length > 0 ? <Button type="button" variant="ghost" size="sm" onClick={clearCart}><X className="size-4" /> Καθαρισμός</Button> : null}
        </div>

        <div className="max-h-[40vh] overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Πατήστε ένα είδος για να το προσθέσετε.</p>
          ) : (
            <ul className="divide-y">
              {cart.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2" data-testid={`cart-item-${c.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{c.quantity} × {formatMoney(c.unitPrice)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => changeQty(c.id, -1)} data-testid={`cart-minus-${c.id}`}><Minus className="size-3" /></Button>
                    <span className="w-6 text-center text-sm tabular-nums">{c.quantity}</span>
                    <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => changeQty(c.id, 1)} data-testid={`cart-plus-${c.id}`}><Plus className="size-3" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeItem(c.id)}><Trash2 className="size-3" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><span>Καθαρή αξία</span><span className="tabular-nums">{formatMoney(totals.net)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>ΦΠΑ</span><span className="tabular-nums">{formatMoney(totals.vat)}</span></div>
          <div className="flex justify-between text-lg font-semibold"><span>Σύνολο</span><span className="tabular-nums" data-testid="pos-total">{formatMoney(totals.gross)}</span></div>
        </div>

        <div className="grid gap-2 border-t pt-3">
          <div className="grid gap-1">
            <Label className="text-xs">Σειρά παραστατικού</Label>
            <Select value={seriesId} onValueChange={setSeriesId}>
              <SelectTrigger data-testid="pos-series"><SelectValue /></SelectTrigger>
              <SelectContent>{series.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name} ({s.invoiceType})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Πελάτης (προαιρετικό)</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="pos-customer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Λιανική (χωρίς όνομα) —</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Τρόπος πληρωμής</Label>
            <div className="grid grid-cols-2 gap-1">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition ${paymentMethod === m.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  data-testid={`pos-payment-${m.value}`}
                >
                  <m.icon className="size-3.5" /> {m.label}
                </button>
              ))}
            </div>
          </div>
          {paymentMethod === 3 ? (
            <>
              <div className="grid gap-1">
                <Label className="text-xs">Καταβληθέν (€)</Label>
                <Input type="number" step="0.01" min="0" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} placeholder={totals.gross.toFixed(2)} data-testid="pos-amount-received" />
              </div>
              {change > 0 ? (
                <div className="flex justify-between rounded-md bg-emerald-50 p-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span>Ρέστα</span>
                  <span className="tabular-nums">{formatMoney(change)}</span>
                </div>
              ) : null}
            </>
          ) : null}
          {(paymentMethod === 3 || paymentMethod === 4 || paymentMethod === 1) && accounts.length > 0 ? (
            <div className="grid gap-1">
              <Label className="text-xs">Λογαριασμός είσπραξης</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger data-testid="pos-account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— (χωρίς λογαριασμό) —</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.kind})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <Button type="button" size="lg" className="w-full text-base" disabled={pending || cart.length === 0} onClick={submit} data-testid="pos-checkout-btn">
          {pending ? "Έκδοση…" : `Έκδοση ${formatMoney(totals.gross)}`}
        </Button>
      </div>
    </div>
  );
}
