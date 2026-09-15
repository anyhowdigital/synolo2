import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { orgHasFeature } from "@/lib/billing/limits";
import { measurementUnitShort } from "@/lib/greek/classifications";
import { MOVEMENT_KIND_LABELS, backfillOpeningMovements, ensureDefaultWarehouse, inventoryValuation, listMovements, listStockCounts, listWarehouses, stockByWarehouse, type MovementKind } from "@/lib/services/inventory";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteWarehouseButton, WarehouseDialog } from "@/components/inventory/warehouse-dialog";
import { DeleteMovementButton, MovementDialog, TransferDialog } from "@/components/inventory/movement-dialog";
import { NewCountDialog } from "@/components/inventory/count-ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Αποθήκη" };

const TABS = [
  { key: "stock", label: "Απόθεμα & αποτίμηση" },
  { key: "movements", label: "Κινήσεις" },
  { key: "counts", label: "Απογραφές" },
  { key: "warehouses", label: "Αποθήκες" },
];

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "stock";
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  await ensureDefaultWarehouse(db, org.id);
  await backfillOpeningMovements(db, org.id);
  const filters = {
    productId: typeof sp.product === "string" ? sp.product : "",
    warehouseId: typeof sp.warehouse === "string" ? sp.warehouse : "",
    kind: typeof sp.kind === "string" ? sp.kind : "",
    from: typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : "",
    to: typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : "",
  };
  const [warehousesAll, valuation, byWh, movements, counts, allProducts] = await Promise.all([
    listWarehouses(db, org.id, { includeInactive: true }),
    inventoryValuation(db, org.id),
    stockByWarehouse(db, org.id),
    tab === "movements" ? listMovements(db, org.id, { ...filters, limit: 300 }) : listMovements(db, org.id, { limit: 8 }),
    listStockCounts(db, org.id),
    db.select().from(products).where(eq(products.orgId, org.id)).orderBy(asc(products.name)),
  ]);
  const warehousesActive = warehousesAll.filter((w) => w.active);
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const warehouseById = new Map(warehousesAll.map((w) => [w.id, w]));
  const stockProducts = allProducts
    .filter((p) => p.trackStock)
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, stockQuantity: p.stockQuantity, costPrice: p.costPrice, avgCost: p.avgCost }));
  const tabHref = (key: string) => (key === "stock" ? "/inventory" : `/inventory?tab=${key}`);
  const hasInventory = orgHasFeature(org, "inventory");

  return (
    <>
      <PageHeader title="Αποθήκη" description="Απόθεμα ανά αποθηκευτικό χώρο, αποτίμηση με μέσο σταθμικό κόστος (ΕΛΠ), κινήσεις από παραστατικά και απογραφές.">
        <Button asChild variant="ghost">
          <Link href="/products">Είδη</Link>
        </Button>
        {canWrite && hasInventory && stockProducts.length > 0 ? (
          <>
            <TransferDialog products={stockProducts} warehouses={warehousesActive} />
            <MovementDialog products={stockProducts} warehouses={warehousesActive} />
          </>
        ) : null}
      </PageHeader>
      {!hasInventory ? <UpgradeNotice capability="inventory" compact className="mb-4" /> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Αξία αποθέματος (ΜΣΚ)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(valuation.totalValue)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">Μέσο σταθμικό κόστος · {valuation.items.length} είδη με παρακολούθηση</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Αξία σε τιμές πώλησης</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(valuation.totalSalesValue)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Δυνητικό μικτό κέρδος {formatMoney(valuation.totalSalesValue - valuation.totalValue)}
          </CardContent>
        </Card>
        <Card className={valuation.lowStock > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Χαμηλό απόθεμα</CardDescription>
            <CardTitle className={cn("text-2xl tabular-nums", valuation.lowStock > 0 ? "text-amber-700" : "")}>{valuation.lowStock}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{valuation.negative > 0 ? <span className="text-red-700">{valuation.negative} με αρνητικό υπόλοιπο</span> : "Κάτω από το όριο επαναπαραγγελίας"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Αποθήκες</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{warehousesActive.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {counts.filter((c) => c.status === "draft").length > 0 ? `${counts.filter((c) => c.status === "draft").length} απογραφή σε εξέλιξη` : "Καμία απογραφή σε εξέλιξη"}
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", tab === t.key ? "bg-foreground text-background" : "hover:bg-muted")}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "stock" ? (
        valuation.items.length === 0 ? (
          <EmptyState
            title="Κανένα είδος με παρακολούθηση αποθέματος"
            description="Ενεργοποιήστε την «Παρακολούθηση αποθέματος» σε εμπορεύματα από τη σελίδα Είδη. Οι πωλήσεις και οι αγορές θα κινούν αυτόματα το απόθεμα."
            action={
              <Button asChild>
                <Link href="/products">Μετάβαση στα Είδη</Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Είδος</TableHead>
                  {warehousesActive.map((w) => (
                    <TableHead key={w.id} className="hidden text-right lg:table-cell">
                      {w.name}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Σύνολο</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Κόστος μον. (ΜΣΚ)</TableHead>
                  <TableHead className="text-right">Αξία</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Αξία πώλησης</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuation.items.map((row) => {
                  const p = row.product;
                  const low = p.stockQuantity <= p.reorderLevel;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/inventory?tab=movements&product=${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {p.sku || "—"}
                          {p.barcode ? ` · ${p.barcode}` : ""}
                          {low ? <span className="ml-2 font-sans text-amber-700">όριο {p.reorderLevel}</span> : null}
                        </div>
                      </TableCell>
                      {warehousesActive.map((w) => (
                        <TableCell key={w.id} className="hidden text-right tabular-nums lg:table-cell">
                          {byWh.get(p.id)?.get(w.id) ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className={cn("text-right tabular-nums font-medium", p.stockQuantity < 0 ? "text-red-700" : low ? "text-amber-700" : "")}>
                        {p.stockQuantity} <span className="text-xs font-normal text-muted-foreground">{measurementUnitShort(p.measurementUnit)}</span>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMoney(row.unitCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.value)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">{formatMoney(row.salesValue)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell>Σύνολο</TableCell>
                  {warehousesActive.map((w) => (
                    <TableCell key={w.id} className="hidden lg:table-cell" />
                  ))}
                  <TableCell />
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="text-right tabular-nums">{formatMoney(valuation.totalValue)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums xl:table-cell">{formatMoney(valuation.totalSalesValue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )
      ) : null}

      {tab === "movements" ? (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <input type="hidden" name="tab" value="movements" />
            <div className="grid gap-1.5">
              <Label htmlFor="mf-product">Είδος</Label>
              <select id="mf-product" name="product" defaultValue={filters.productId} className="h-9 w-56 rounded-md border bg-background px-2 text-sm">
                <option value="">Όλα</option>
                {allProducts
                  .filter((p) => p.trackStock)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mf-wh">Αποθήκη</Label>
              <select id="mf-wh" name="warehouse" defaultValue={filters.warehouseId} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Όλες</option>
                {warehousesAll.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mf-kind">Τύπος</Label>
              <select id="mf-kind" name="kind" defaultValue={filters.kind} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Όλοι</option>
                {Object.entries(MOVEMENT_KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mf-from">Από</Label>
              <Input id="mf-from" name="from" type="date" defaultValue={filters.from} className="w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mf-to">Έως</Label>
              <Input id="mf-to" name="to" type="date" defaultValue={filters.to} className="w-40" />
            </div>
            <Button type="submit" variant="secondary">
              Φίλτρο
            </Button>
            {filters.productId || filters.warehouseId || filters.kind || filters.from || filters.to ? (
              <Button asChild variant="ghost">
                <Link href="/inventory?tab=movements">Καθαρισμός</Link>
              </Button>
            ) : null}
          </form>
          {movements.length === 0 ? (
            <EmptyState title="Δεν υπάρχουν κινήσεις" description="Οι κινήσεις δημιουργούνται από την έκδοση παραστατικών, τα τιμολόγια αγορών με είδη, τις απογραφές και τις χειροκίνητες καταχωρήσεις." />
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead>Είδος</TableHead>
                    <TableHead className="hidden md:table-cell">Αποθήκη</TableHead>
                    <TableHead>Τύπος</TableHead>
                    <TableHead className="text-right">Ποσότητα</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Κόστος μον.</TableHead>
                    <TableHead className="hidden lg:table-cell">Σημείωση</TableHead>
                    {canWrite ? <TableHead className="w-10" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => {
                    const p = productById.get(m.productId);
                    const locked = m.refType === "invoice" || m.refType === "count" || m.refType === "expense";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(m.movedAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{p?.name ?? "—"}</div>
                          {m.refType === "invoice" && m.refId ? (
                            <Link href={`/invoices/${m.refId}`} className="text-xs text-muted-foreground hover:underline">
                              Παραστατικό
                            </Link>
                          ) : m.refType === "count" && m.refId ? (
                            <Link href={`/inventory/counts/${m.refId}`} className="text-xs text-muted-foreground hover:underline">
                              Απογραφή
                            </Link>
                          ) : m.refType === "expense" ? (
                            <Link href="/expenses" className="text-xs text-muted-foreground hover:underline">
                              Τιμολόγιο αγοράς
                            </Link>
                          ) : null}
                        </TableCell>
                        <TableCell className="hidden text-sm md:table-cell">{warehouseById.get(m.warehouseId)?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{MOVEMENT_KIND_LABELS[m.kind as MovementKind] ?? m.kind}</Badge>
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", m.quantity < 0 ? "text-red-700" : "text-emerald-700")}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{m.unitCost != null ? formatMoney(m.unitCost) : "—"}</TableCell>
                        <TableCell className="hidden max-w-[260px] truncate text-xs text-muted-foreground lg:table-cell" title={m.note}>
                          {m.note}
                          {m.actor ? ` · ${m.actor}` : ""}
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <DeleteMovementButton id={m.id} disabled={locked} reason="Αναιρείται μόνο από το παραστατικό/απογραφή προέλευσης" />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : null}

      {tab === "counts" ? (
        <>
          <div className="mb-4 flex justify-end">{canWrite && hasInventory ? <NewCountDialog warehouses={warehousesActive} /> : null}</div>
          {counts.length === 0 ? (
            <EmptyState title="Δεν έχουν γίνει απογραφές" description="Η απογραφή δημιουργεί φύλλο καταμέτρησης ανά αποθήκη και, κατά την οριστικοποίηση, διορθωτικές κινήσεις για τις διαφορές." action={canWrite && hasInventory ? <NewCountDialog warehouses={warehousesActive} /> : undefined} />
          ) : (
            <div className="rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead>Αποθήκη</TableHead>
                    <TableHead className="hidden md:table-cell">Σημείωση</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Οριστικοποίηση</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/inventory/counts/${c.id}`} className="font-medium hover:underline">
                          {formatDate(c.countedAt)}
                        </Link>
                      </TableCell>
                      <TableCell>{warehouseById.get(c.warehouseId)?.name ?? "—"}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{c.note || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={c.status === "posted" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}>
                          {c.status === "posted" ? "Οριστικοποιημένη" : "Σε εξέλιξη"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground sm:table-cell">{c.postedAt ? formatDate(c.postedAt.slice(0, 10)) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : null}

      {tab === "warehouses" ? (
        <>
          <div className="mb-4 flex justify-end">{canWrite && hasInventory ? <WarehouseDialog /> : null}</div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Αποθήκη</TableHead>
                  <TableHead className="hidden md:table-cell">Διεύθυνση</TableHead>
                  <TableHead className="text-right">Είδη με απόθεμα</TableHead>
                  <TableHead className="text-right">Αξία (ΜΣΚ)</TableHead>
                  {canWrite ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {warehousesAll.map((w) => {
                  let items = 0;
                  let value = 0;
                  for (const row of valuation.items) {
                    const q = byWh.get(row.product.id)?.get(w.id) ?? 0;
                    if (q !== 0) items += 1;
                    value += Math.max(0, q) * row.unitCost;
                  }
                  return (
                    <TableRow key={w.id} className={!w.active ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {w.name}
                          {w.code ? <span className="font-mono text-xs text-muted-foreground">{w.code}</span> : null}
                          {w.isDefault ? <Badge variant="secondary">Προεπιλογή</Badge> : null}
                          {!w.active ? <Badge variant="outline">Ανενεργή</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{w.address || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{items}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(value)}</TableCell>
                      {canWrite ? (
                        <TableCell>
                          <div className="flex justify-end">
                            <WarehouseDialog warehouse={w} />
                            {!w.isDefault ? <DeleteWarehouseButton id={w.id} /> : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Η προεπιλεγμένη αποθήκη χρησιμοποιείται για πωλήσεις και αγορές όταν δεν επιλεγεί άλλη στο παραστατικό. Αποθήκες με κινήσεις δεν διαγράφονται – απενεργοποιούνται.</p>
        </>
      ) : null}
    </>
  );
}
