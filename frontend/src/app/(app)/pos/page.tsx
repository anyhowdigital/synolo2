import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { series, products, customers, cashAccounts } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { orgHasFeature } from "@/lib/billing/limits";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { PageHeader } from "@/components/page-header";
import { PosScreen } from "@/components/pos/pos-screen";

export const metadata = { title: "POS · Γρήγορη πώληση" };

export default async function PosPage() {
  const db = await getDb();
  const { org } = await requireContext(db);
  if (!orgHasFeature(org, "pos")) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <UpgradeNotice capability="pos" />
      </div>
    );
  }
  const allSeries = await db.select().from(series).where(and(eq(series.orgId, org.id), eq(series.active, true)));
  // Προτεραιότητα: ΑΛΠ (11.1) και ΑΠΥ (11.2 – απόδειξη παροχής). Fallback: ΤΠ/ΤΠΥ.
  const posSeries = allSeries.filter((s) => s.invoiceType === "11.1" || s.invoiceType === "11.2" || s.invoiceType === "11.3" || s.invoiceType === "11.4" || s.invoiceType === "11.5");
  const otherSeries = allSeries.filter((s) => !posSeries.includes(s) && (s.invoiceType === "1.1" || s.invoiceType === "2.1"));
  const seriesForPos = posSeries.length > 0 ? posSeries : otherSeries;

  const allProducts = await db.select().from(products).where(and(eq(products.orgId, org.id), eq(products.active, true)));
  const allCustomers = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.orgId, org.id));
  const accounts = await db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, org.id), eq(cashAccounts.active, true)));

  const categories = Array.from(new Set(allProducts.map((p) => (p.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "el"));

  return (
    <>
      <PageHeader title="Ταμείο λιανικής (POS)" description="Οθόνη αφής για γρήγορη έκδοση αποδείξεων λιανικής (ΑΛΠ/ΑΠΥ). Επιλέξτε είδη, τρόπο πληρωμής και εκδώστε άμεσα." />
      <PosScreen
        series={seriesForPos.map((s) => ({ id: s.id, code: s.code, name: s.name, invoiceType: s.invoiceType }))}
        products={allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku ?? "", unitPrice: p.unitPrice, vatCategory: p.vatCategory, category: p.category, classificationCategory: p.classificationCategory, classificationType: p.classificationType, measurementUnit: p.measurementUnit }))}
        categories={categories}
        customers={allCustomers}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, isDefault: a.isDefault }))}
      />
    </>
  );
}
