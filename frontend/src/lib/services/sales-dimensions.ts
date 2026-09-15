import { inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, products } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import { isIncomeDocument, listIncomeDocuments, type ReportPeriod } from "./reports";
import { parseTags } from "./custom-fields";
import { listOrgMembers } from "./dimensions";

export const SALES_DIMENSIONS = [
  { id: "salesperson", label: "Πωλητής" },
  { id: "channel", label: "Κανάλι" },
  { id: "category", label: "Κατηγορία είδους" },
  { id: "product", label: "Είδος" },
  { id: "tag", label: "Ετικέτα" },
  { id: "customer", label: "Πελάτης" },
  { id: "geography", label: "Γεωγραφία" },
] as const;

export type SalesDimension = (typeof SALES_DIMENSIONS)[number]["id"];

export function isSalesDimension(v: unknown): v is SalesDimension {
  return SALES_DIMENSIONS.some((d) => d.id === v);
}

export interface DimensionRow {
  key: string;
  label: string;
  documents: number;
  net: number;
  vat: number;
  gross: number;
  share: number;
}

export interface SalesByDimension {
  dimension: SalesDimension;
  rows: DimensionRow[];
  totalNet: number;
  totalGross: number;
  documents: number;
}

const UNASSIGNED = "— Χωρίς τιμή —";

/**
 * Πωλήσεις (φορολογικά παραστατικά εσόδων, πιστωτικά αφαιρούνται) ομαδοποιημένες ανά διάσταση.
 * Οι διαστάσεις γραμμής (κατηγορία, είδος) υπολογίζονται από τις γραμμές· οι υπόλοιπες από την κεφαλίδα.
 */
export async function salesByDimension(db: Db, orgId: string, period: ReportPeriod, dimension: SalesDimension): Promise<SalesByDimension> {
  const { rows, lines } = await listIncomeDocuments(db, orgId, period);
  const income = rows.filter(isIncomeDocument);
  const sign = (invoiceType: string) => (getDocumentType(invoiceType).credit ? -1 : 1);

  const buckets = new Map<string, { label: string; docs: Set<string>; net: number; vat: number; gross: number }>();
  const add = (key: string, label: string, docId: string, net: number, vat: number, gross: number) => {
    const b = buckets.get(key) ?? { label, docs: new Set<string>(), net: 0, vat: 0, gross: 0 };
    b.docs.add(docId);
    b.net += net;
    b.vat += vat;
    b.gross += gross;
    buckets.set(key, b);
  };

  if (dimension === "category" || dimension === "product") {
    const productIds = Array.from(new Set(lines.map((l) => l.productId).filter((p): p is string => !!p)));
    const productRows = productIds.length ? await db.select({ id: products.id, name: products.name, category: products.category }).from(products).where(inArray(products.id, productIds)) : [];
    const byId = new Map(productRows.map((p) => [p.id, p]));
    const invById = new Map(income.map((i) => [i.id, i]));
    for (const l of lines) {
      const inv = invById.get(l.invoiceId);
      if (!inv) continue;
      const s = sign(inv.invoiceType);
      const p = l.productId ? byId.get(l.productId) : undefined;
      const key = dimension === "category" ? p?.category || "" : l.productId || `desc:${l.description}`;
      const label = dimension === "category" ? p?.category || UNASSIGNED : p?.name || l.description;
      add(key || "__none", label, inv.id, s * l.netValue, s * l.vatAmount, s * l.grossValue);
    }
  } else {
    const members = dimension === "salesperson" ? await listOrgMembers(db, orgId) : [];
    const customerIds = Array.from(new Set(income.map((i) => i.customerId).filter((c): c is string => !!c)));
    const customerRows =
      dimension === "geography" && customerIds.length
        ? await db.select({ id: customers.id, city: customers.city, country: customers.country }).from(customers).where(inArray(customers.id, customerIds))
        : [];
    const custById = new Map(customerRows.map((c) => [c.id, c]));
    for (const inv of income) {
      const s = sign(inv.invoiceType);
      const net = s * inv.totalNetValue;
      const vat = s * inv.totalVatAmount;
      const gross = s * inv.totalGrossValue;
      if (dimension === "salesperson") {
        const m = inv.salespersonId ? members.find((x) => x.id === inv.salespersonId) : undefined;
        add(inv.salespersonId || "__none", m ? m.name || m.email : UNASSIGNED, inv.id, net, vat, gross);
      } else if (dimension === "channel") {
        add(inv.channel || "__none", inv.channel || UNASSIGNED, inv.id, net, vat, gross);
      } else if (dimension === "customer") {
        add(inv.customerId || "__retail", inv.customerName || "Λιανική", inv.id, net, vat, gross);
      } else if (dimension === "geography") {
        const c = inv.customerId ? custById.get(inv.customerId) : undefined;
        const country = c?.country || inv.customerCountry || "GR";
        const label = c?.city ? `${c.city} (${country})` : country === "GR" ? "Ελλάδα (χωρίς πόλη)" : country;
        add(`${country}:${c?.city ?? ""}`, label, inv.id, net, vat, gross);
      } else {
        const tags = parseTags(inv.tags);
        if (!tags.length) add("__none", UNASSIGNED, inv.id, net, vat, gross);
        for (const t of tags) add(t.toLowerCase(), t, inv.id, net, vat, gross);
      }
    }
  }

  const totalNet = round2(income.reduce((s, i) => s + sign(i.invoiceType) * i.totalNetValue, 0));
  const totalGross = round2(income.reduce((s, i) => s + sign(i.invoiceType) * i.totalGrossValue, 0));
  const result: DimensionRow[] = Array.from(buckets.entries())
    .map(([key, b]) => ({
      key,
      label: b.label,
      documents: b.docs.size,
      net: round2(b.net),
      vat: round2(b.vat),
      gross: round2(b.gross),
      share: totalNet ? round2((b.net / totalNet) * 100) : 0,
    }))
    .sort((a, b) => b.net - a.net);
  return { dimension, rows: result, totalNet, totalGross, documents: income.length };
}

export function dimensionCsv(report: SalesByDimension) {
  const label = SALES_DIMENSIONS.find((d) => d.id === report.dimension)?.label ?? report.dimension;
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [[label, "Παραστατικά", "Καθαρή αξία", "ΦΠΑ", "Σύνολο", "Μερίδιο %"].map(esc).join(";")];
  for (const r of report.rows) lines.push([r.label, r.documents, r.net.toFixed(2), r.vat.toFixed(2), r.gross.toFixed(2), r.share.toFixed(1)].map(esc).join(";"));
  lines.push(["Σύνολο", report.documents, report.totalNet.toFixed(2), "", report.totalGross.toFixed(2), "100"].map(esc).join(";"));
  return "\uFEFF" + lines.join("\r\n");
}
