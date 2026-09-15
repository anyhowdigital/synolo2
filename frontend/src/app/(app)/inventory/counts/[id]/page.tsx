import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { products, warehouses } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatDate } from "@/lib/invoice/totals";
import { getStockCount, valuationCost } from "@/lib/services/inventory";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountLinesEditor, type CountLineRow } from "@/components/inventory/count-ui";

export default async function StockCountPage({ params }: PageProps<"/inventory/counts/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const count = await getStockCount(db, org.id, id);
  if (!count) notFound();
  const wh = await db.query.warehouses.findFirst({ where: eq(warehouses.id, count.warehouseId) });
  const prods = count.lines.length ? await db.select().from(products).where(inArray(products.id, count.lines.map((l) => l.productId))) : [];
  const byId = new Map(prods.map((p) => [p.id, p]));
  const rows: CountLineRow[] = count.lines
    .map((l) => {
      const p = byId.get(l.productId);
      return { ...l, productName: p?.name ?? "—", sku: p?.sku ?? "", barcode: p?.barcode ?? "", unitCost: p ? valuationCost(p) : 0 };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName, "el"));
  const editable = can(role, "write") && count.status === "draft";

  return (
    <>
      <PageHeader title={`Απογραφή ${formatDate(count.countedAt)}`} description={`${wh?.name ?? "Αποθήκη"}${count.note ? ` · ${count.note}` : ""}`}>
        <Badge variant="secondary" className={count.status === "posted" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}>
          {count.status === "posted" ? `Οριστικοποιήθηκε ${count.postedAt ? formatDate(count.postedAt.slice(0, 10)) : ""}` : "Σε εξέλιξη"}
        </Badge>
        <Button asChild variant="ghost">
          <Link href="/inventory?tab=counts">
            <ArrowLeft data-icon="inline-start" /> Απογραφές
          </Link>
        </Button>
      </PageHeader>
      <CountLinesEditor countId={count.id} lines={rows} editable={editable} />
    </>
  );
}
