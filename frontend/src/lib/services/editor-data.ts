import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, invoices, products, series } from "@/db/schema";
import { DOCUMENT_TYPES } from "@/lib/greek/document-types";
import { defsFor } from "./custom-fields";
import { loadFormExtras, parseChannels } from "./dimensions";
import { businessDate } from "@/lib/invoice/totals";
import { listWarehouses } from "./inventory";
import { creditExposureByCustomer } from "./credit-profile";

/** Δεδομένα αναφοράς που χρειάζεται ο editor παραστατικών. */
export async function loadEditorData(db: Db, orgId: string, customFieldDefsJson?: string | null, salesChannels?: string | null) {
  const [customerRows, productRows, seriesRows, issued, formExtras, warehouseRows] = await Promise.all([
    db.select().from(customers).where(and(eq(customers.orgId, orgId), ne(customers.stage, "inactive"))).orderBy(asc(customers.name)),
    db.select().from(products).where(eq(products.orgId, orgId)).orderBy(asc(products.name)),
    db.select().from(series).where(eq(series.orgId, orgId)).orderBy(asc(series.code)),
    db.select().from(invoices).where(and(eq(invoices.orgId, orgId), eq(invoices.mydataStatus, "sent"))),
    loadFormExtras(db, orgId, "invoice"),
    listWarehouses(db, orgId),
  ]);
  const extras = { ...formExtras, defs: defsFor(customFieldDefsJson, "invoice"), channels: parseChannels(salesChannels), warehouses: warehouseRows };
  const creditCodes = new Set(DOCUMENT_TYPES.filter((d) => d.credit).map((d) => d.code));
  const correlatable = issued.filter((i) => !creditCodes.has(i.invoiceType as never) && i.status !== "cancelled");
  return { initialDate: businessDate(), customers: customerRows, products: productRows, seriesList: seriesRows, correlatable, extras, exposure: Object.fromEntries(await creditExposureByCustomer(db, orgId)) };
}
