import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { expenses, invoiceLines, invoices, series } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import { f2Report, vatReport } from "@/lib/services/reports";
import { inputVatSummary } from "@/lib/services/expenses";

export type CloseStatus = "ok" | "warn" | "blocker";

export interface CloseItem {
  key: string;
  title: string;
  status: CloseStatus;
  detail: string;
  count: number;
  href?: string;
}

export function monthPeriod(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function currentMonth(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

export async function monthlyClose(db: Db, org: Organization, month: string) {
  const period = monthPeriod(month);
  const [invRows, expRows, seriesRows, vat, f2, input] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to))),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), ne(expenses.status, "rejected"), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to))),
    db.select().from(series).where(eq(series.orgId, org.id)),
    vatReport(db, org.id, period),
    f2Report(db, org.id, period),
    inputVatSummary(db, org.id, period),
  ]);

  const issued = invRows.filter((i) => i.status !== "draft" && i.status !== "cancelled");
  const transmittable = issued.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.expenseSide;
  });
  const items: CloseItem[] = [];
  const label = (i: (typeof invRows)[number]) => `${i.seriesCode} ${i.number ?? "—"}`;

  // 1. Διαβίβαση myDATA
  const notSent = transmittable.filter((i) => !i.mydataMark && i.mydataStatus !== "sent");
  items.push({
    key: "mydata",
    title: "Διαβίβαση παραστατικών στο myDATA",
    status: notSent.length ? "blocker" : "ok",
    detail: notSent.length ? `${notSent.length} παραστατικά του μήνα δεν έχουν ΜΑΡΚ: ${notSent.slice(0, 5).map(label).join(", ")}${notSent.length > 5 ? "…" : ""}` : `Όλα τα ${transmittable.length} παραστατικά έχουν διαβιβαστεί.`,
    count: notSent.length,
    href: "/mydata",
  });

  // 2. Σφάλματα διαβίβασης
  const failed = transmittable.filter((i) => i.mydataStatus === "error");
  items.push({
    key: "mydata_errors",
    title: "Απορρίψεις από την ΑΑΔΕ",
    status: failed.length ? "blocker" : "ok",
    detail: failed.length ? `${failed.length} παραστατικά απορρίφθηκαν και χρειάζονται διόρθωση: ${failed.slice(0, 5).map(label).join(", ")}` : "Καμία απόρριψη στον μήνα.",
    count: failed.length,
    href: "/mydata",
  });

  // 3. Πρόχειρα
  const drafts = invRows.filter((i) => i.status === "draft");
  items.push({
    key: "drafts",
    title: "Πρόχειρα παραστατικά του μήνα",
    status: drafts.length ? "warn" : "ok",
    detail: drafts.length ? `${drafts.length} πρόχειρα δεν έχουν εκδοθεί – εκδώστε ή διαγράψτε τα πριν κλείσει ο μήνας.` : "Δεν υπάρχουν πρόχειρα.",
    count: drafts.length,
    href: "/invoices?status=draft",
  });

  // 4. Κενά αρίθμησης
  const gaps: string[] = [];
  for (const s of seriesRows) {
    const nums = issued.filter((i) => i.seriesCode === s.code && i.number !== null).map((i) => i.number as number).sort((a, b) => a - b);
    for (let k = 1; k < nums.length; k++) {
      if (nums[k] - nums[k - 1] > 1) gaps.push(`${s.code}: ${nums[k - 1]} → ${nums[k]}`);
    }
  }
  items.push({
    key: "numbering",
    title: "Συνέχεια αρίθμησης σειρών",
    status: gaps.length ? "warn" : "ok",
    detail: gaps.length ? `Κενά: ${gaps.slice(0, 5).join(" · ")}` : "Η αρίθμηση είναι συνεχής σε όλες τις σειρές.",
    count: gaps.length,
    href: "/invoices",
  });

  // 5. Χαρακτηρισμοί εσόδων
  const ids = issued.map((i) => i.id);
  const lines = ids.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)) : [];
  const unclassified = lines.filter((l) => !l.classificationCategory || !l.classificationType);
  items.push({
    key: "income_classification",
    title: "Χαρακτηρισμοί εσόδων (Ε3)",
    status: unclassified.length ? "blocker" : "ok",
    detail: unclassified.length ? `${unclassified.length} γραμμές χωρίς κατηγορία/τύπο χαρακτηρισμού.` : `Όλες οι ${lines.length} γραμμές έχουν χαρακτηρισμό.`,
    count: unclassified.length,
    href: "/invoices",
  });

  // 6. Χαρακτηρισμοί εξόδων
  const expPending = expRows.filter((e) => e.status === "pending" || !e.classificationCategory || !e.classificationType);
  items.push({
    key: "expense_classification",
    title: "Χαρακτηρισμοί εξόδων",
    status: expPending.length ? "warn" : "ok",
    detail: expPending.length ? `${expPending.length} έξοδα χωρίς πλήρη χαρακτηρισμό ή σε εκκρεμότητα.` : `Όλα τα ${expRows.length} έξοδα του μήνα είναι χαρακτηρισμένα.`,
    count: expPending.length,
    href: "/expenses",
  });

  // 7. Ασυμφωνία βιβλίων ↔ myDATA
  const bookNet = round2(transmittable.reduce((s, i) => s + (getDocumentType(i.invoiceType).credit ? -1 : 1) * i.totalNetValue, 0));
  const sentNet = round2(transmittable.filter((i) => i.mydataMark).reduce((s, i) => s + (getDocumentType(i.invoiceType).credit ? -1 : 1) * i.totalNetValue, 0));
  const diff = round2(bookNet - sentNet);
  const diffPct = bookNet > 0 ? Math.abs((diff / bookNet) * 100) : 0;
  items.push({
    key: "reconciliation",
    title: "Συμφωνία βιβλίων με myDATA",
    status: diffPct >= 30 ? "blocker" : diffPct > 0 ? "warn" : "ok",
    detail: diff === 0 ? `Βιβλία και myDATA συμφωνούν (${bookNet.toFixed(2)} €).` : `Διαφορά ${diff.toFixed(2)} € (${diffPct.toFixed(1)}%) – βιβλία ${bookNet.toFixed(2)} €, διαβιβασμένα ${sentNet.toFixed(2)} €.`,
    count: diff === 0 ? 0 : 1,
    href: "/mydata",
  });

  // 8. ΦΠΑ
  const position = round2(vat.totalVat - input.vat);
  items.push({
    key: "vat",
    title: "Θέση ΦΠΑ μήνα",
    status: "ok",
    detail: `ΦΠΑ εκροών ${vat.totalVat.toFixed(2)} € – ΦΠΑ εισροών ${input.vat.toFixed(2)} € = ${position >= 0 ? "χρεωστικό" : "πιστωτικό"} ${Math.abs(position).toFixed(2)} €. Μη εκπιπτόμενος ΦΠΑ: ${input.nonDeductible.toFixed(2)} €.`,
    count: 0,
    href: `/reports?from=${period.from}&to=${period.to}`,
  });

  // 9. Παρακρατήσεις & χαρτόσημο
  items.push({
    key: "withholding",
    title: "Παρακρατήσεις & χαρτόσημο",
    status: "ok",
    detail: `Παρακρατήσεις ${vat.withheld.toFixed(2)} €, χαρτόσημο ${vat.stampDuty.toFixed(2)} €.`,
    count: 0,
    href: "/reports/withholding",
  });

  const blockers = items.filter((i) => i.status === "blocker").length;
  const warnings = items.filter((i) => i.status === "warn").length;
  return {
    month,
    period,
    items,
    blockers,
    warnings,
    canClose: blockers === 0,
    totals: {
      documents: issued.length,
      net: bookNet,
      vatOut: vat.totalVat,
      vatIn: input.vat,
      position,
      expenses: round2(expRows.reduce((s, e) => s + e.netValue, 0)),
      f2Payable: f2.payable,
    },
  };
}

export type MonthlyClose = Awaited<ReturnType<typeof monthlyClose>>;
