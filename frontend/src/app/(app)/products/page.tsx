import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { History } from "lucide-react";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatMoney } from "@/lib/invoice/totals";
import { getVatCategory } from "@/lib/greek/vat";
import { measurementUnitShort } from "@/lib/greek/classifications";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { orgHasFeature } from "@/lib/billing/limits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductDialog } from "@/components/products/product-dialog";
import { ImportDialog } from "@/components/import-dialog";
import { DeleteProductButton, StockButtons } from "@/components/products/stock-buttons";
import { cn } from "@/lib/utils";
import { TagList } from "@/components/tags/tag-input";
import { defsFor, parseTags } from "@/lib/services/custom-fields";
import { collectTags } from "@/lib/services/dimensions";

export const metadata = { title: "Είδη & Αποθήκη" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const kindF = typeof sp.kind === "string" ? sp.kind : "";
  const pageSize = parsePageSize(sp.pageSize);
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith("/products", { q, kind: kindF, pageSize: pageSize === 25 ? "" : pageSize }, patch);
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const allRows = await db.select().from(products).where(eq(products.orgId, org.id)).orderBy(asc(products.kind), asc(products.name));
  const filtered = allRows.filter((p) => (!kindF || p.kind === kindF) && (!q || [p.name, p.sku, p.barcode, p.category].some((v) => String(v ?? "").toLowerCase().includes(q))));
  const paged = paginate(filtered, parsePage(sp.page), pageSize);
  const rows = paged.rows;
  const tagSuggestions = await collectTags(db, org.id, "product");
  const extras = {
    defs: defsFor(org.customFieldDefsJson, "product"),
    tagSuggestions,
    categories: Array.from(new Set(allRows.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "el")),
  };
  const stockItems = allRows.filter((p) => p.trackStock);
  const stockValue = stockItems.reduce((s, p) => s + Math.max(0, p.stockQuantity) * (p.avgCost > 0 ? p.avgCost : p.costPrice), 0);
  const lowStock = stockItems.filter((p) => p.stockQuantity <= p.reorderLevel).length;

  return (
    <>
      <PageHeader title="Είδη" description="Υπηρεσίες και εμπορεύματα με προ-ρυθμισμένο ΦΠΑ, μονάδα μέτρησης, barcode και χαρακτηρισμό myDATA.">
        <Button asChild variant="ghost">
          <Link href="/inventory">
            <History data-icon="inline-start" /> Αποθήκη & κινήσεις
          </Link>
        </Button>
        {canWrite ? (
          <>
            <ImportDialog kind="products" />
            <ProductDialog extras={extras} />
          </>
        ) : null}
      </PageHeader>
      {!orgHasFeature(org, "inventory") ? <UpgradeNotice capability="inventory" compact className="mb-4" /> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Σύνολο ειδών</CardDescription>
            <CardTitle className="text-2xl">{allRows.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {allRows.filter((p) => p.kind === "service").length} υπηρεσίες · {allRows.filter((p) => p.kind === "product").length} εμπορεύματα
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Αξία αποθέματος (ΜΣΚ)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(stockValue)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stockItems.length} είδη με παρακολούθηση ·{" "}
            <Link href="/inventory" className="underline-offset-2 hover:underline">
              αποτίμηση ανά αποθήκη
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Χαμηλό απόθεμα</CardDescription>
            <CardTitle className={cn("text-2xl", lowStock > 0 ? "text-amber-700" : "")}>{lowStock}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">Κάτω από το όριο επαναπαραγγελίας</CardContent>
        </Card>
      </div>

      <FilterBar
        action="/products"
        q={q}
        showDates={false}
        searchPlaceholder="Αναζήτηση: περιγραφή, κωδικός, barcode, κατηγορία…"
        hidden={{ kind: kindF, pageSize: pageSize === 25 ? "" : String(pageSize) }}
        clearHref="/products"
        chips={[{ key: "", label: "Όλα", href: linkFor({ kind: "", page: "" }), active: !kindF }, { key: "service", label: "Υπηρεσίες", href: linkFor({ kind: "service", page: "" }), active: kindF === "service" }, { key: "product", label: "Εμπορεύματα", href: linkFor({ kind: "product", page: "" }), active: kindF === "product" }]}
      />

      {rows.length === 0 ? (
        <EmptyState title="Δεν υπάρχουν είδη" description="Δημιουργήστε υπηρεσίες ή εμπορεύματα για γρήγορη επιλογή στα παραστατικά." action={canWrite ? <ProductDialog extras={extras} /> : undefined} />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Είδος</TableHead>
                <TableHead className="hidden md:table-cell">SKU / barcode</TableHead>
                <TableHead className="text-right">Τιμή</TableHead>
                <TableHead>ΦΠΑ</TableHead>
                <TableHead className="hidden lg:table-cell">Χαρακτηρισμός</TableHead>
                <TableHead className="text-right">Απόθεμα</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className={cn(!p.active ? "opacity-50" : "")}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.kind === "service" ? "Υπηρεσία" : "Εμπόρευμα"} · {measurementUnitShort(p.measurementUnit)}
                      {p.category ? ` · ${p.category}` : ""}
                      {!p.active ? " · Ανενεργό" : ""}
                    </div>
                    <TagList tags={parseTags(p.tags)} max={3} />
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    <div>{p.sku || "—"}</div>
                    {p.barcode ? <div className="text-muted-foreground">{p.barcode}</div> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.unitPrice)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getVatCategory(p.vatCategory).label}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {p.classificationType} · {p.classificationCategory.replace("category", "κατ. ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.trackStock ? (
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/inventory?tab=movements&product=${p.id}`} className={cn("tabular-nums hover:underline", p.stockQuantity <= p.reorderLevel ? "font-medium text-amber-700" : "")} title="Κινήσεις είδους">
                          {p.stockQuantity}
                        </Link>
                        {canWrite ? <StockButtons id={p.id} /> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {canWrite ? (
                      <div className="flex justify-end">
                        <ProductDialog product={p} extras={extras} />
                        <DeleteProductButton id={p.id} />
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={(p) => linkFor(p)} noun="είδη" />
        </div>
      )}
    </>
  );
}
