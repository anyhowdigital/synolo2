"use server";

import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, expenses, invoices, products } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { getDocumentType } from "@/lib/greek/document-types";
import { formatMoney } from "@/lib/invoice/totals";

export interface SearchHit {
  group: "invoices" | "quotes" | "customers" | "products" | "expenses";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: string;
}

const LIMIT = 6;

/** Καθολική αναζήτηση (Ctrl/⌘+K) σε παραστατικά, πελάτες, είδη και έξοδα του τρέχοντος οργανισμού. */
export async function globalSearchAction(rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];
  const db = await getDb();
  const { org } = await requireContext(db);
  const pat = `%${q}%`;
  const numeric = q.replace(/\D/g, "");
  const numberMatch = /^\d+$/.test(q) ? Number(q) : null;

  const [inv, cust, prod, exp] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, org.id),
          or(
            like(invoices.customerName, pat),
            like(invoices.customerAfm, pat),
            like(invoices.mydataMark, pat),
            like(sql`${invoices.seriesCode} || '-' || printf('%04d', ${invoices.number})`, pat),
            ...(numberMatch !== null ? [eq(invoices.number, numberMatch)] : []),
          ),
        ),
      )
      .orderBy(desc(invoices.issueDate))
      .limit(LIMIT * 2),
    db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, org.id), or(like(customers.name, pat), like(customers.afm, pat), like(customers.email, pat), like(customers.contactPerson, pat))))
      .orderBy(customers.name)
      .limit(LIMIT),
    db
      .select()
      .from(products)
      .where(and(eq(products.orgId, org.id), or(like(products.name, pat), like(products.sku, pat))))
      .orderBy(products.name)
      .limit(LIMIT),
    db
      .select()
      .from(expenses)
      .where(and(eq(expenses.orgId, org.id), or(like(expenses.supplierName, pat), like(expenses.supplierAfm, pat), like(expenses.description, pat), ...(numeric.length >= 6 ? [like(expenses.mark, `%${numeric}%`)] : []))))
      .orderBy(desc(expenses.issueDate))
      .limit(LIMIT),
  ]);

  const hits: SearchHit[] = [];
  let invoiceCount = 0;
  let quoteCount = 0;
  for (const i of inv) {
    const dt = getDocumentType(i.invoiceType);
    const isQuote = dt.kind === "quote";
    if (isQuote ? quoteCount >= LIMIT : invoiceCount >= LIMIT) continue;
    if (isQuote) quoteCount++;
    else invoiceCount++;
    hits.push({
      group: isQuote ? "quotes" : "invoices",
      id: i.id,
      title: `${dt.name} ${invoiceDisplayNumber(i)}`,
      subtitle: `${i.customerName || "—"} · ${i.issueDate}`,
      href: `/invoices/${i.id}`,
      meta: formatMoney(i.totalGrossValue, i.currency),
    });
  }
  for (const c of cust) hits.push({ group: "customers", id: c.id, title: c.name, subtitle: [c.afm, c.email || c.contactPerson].filter(Boolean).join(" · ") || "—", href: `/customers/${c.id}` });
  for (const p of prod) hits.push({ group: "products", id: p.id, title: p.name, subtitle: p.sku || (p.kind === "service" ? "Υπηρεσία" : "Εμπόρευμα"), href: `/products`, meta: formatMoney(p.unitPrice) });
  for (const e of exp) hits.push({ group: "expenses", id: e.id, title: e.supplierName || "Έξοδο", subtitle: `${e.description || e.number || ""} · ${e.issueDate}`.replace(/^ · /, ""), href: `/expenses`, meta: formatMoney(e.grossValue) });
  return hits;
}
