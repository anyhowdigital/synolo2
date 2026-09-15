import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { invoices } from "@/db/schema";
import { f2Report } from "@/lib/services/reports";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";

export interface F2ReconLine {
  label: string;
  books: number;
  mydata: number;
  diff: number;
  diffPct: number;
  status: "ok" | "warn" | "blocker";
  hint: string;
}

/** Προσυμπληρωμένο Φ2 με συμφωνία βιβλίων ↔ διαβιβασμένων στο myDATA, γραμμή-γραμμή. */
export async function f2Reconciliation(db: Db, org: Organization, period: { from: string; to: string }) {
  const [f2, invRows] = await Promise.all([
    f2Report(db, org.id, period),
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to))),
  ]);

  const income = invRows.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return i.status !== "draft" && i.status !== "cancelled" && dt.kind === "invoice" && !dt.expenseSide;
  });
  const sign = (t: string) => (getDocumentType(t).credit ? -1 : 1);
  const booksNet = round2(income.reduce((s, i) => s + sign(i.invoiceType) * i.totalNetValue, 0));
  const booksVat = round2(income.reduce((s, i) => s + sign(i.invoiceType) * i.totalVatAmount, 0));
  const sent = income.filter((i) => !!i.mydataMark);
  const sentNet = round2(sent.reduce((s, i) => s + sign(i.invoiceType) * i.totalNetValue, 0));
  const sentVat = round2(sent.reduce((s, i) => s + sign(i.invoiceType) * i.totalVatAmount, 0));

  const mk = (label: string, books: number, mydata: number, hint: string): F2ReconLine => {
    const diff = round2(books - mydata);
    const diffPct = books !== 0 ? round2((diff / Math.abs(books)) * 100) : mydata !== 0 ? 100 : 0;
    return {
      label,
      books,
      mydata,
      diff,
      diffPct,
      status: Math.abs(diffPct) < 0.5 ? "ok" : Math.abs(diffPct) >= 30 ? "blocker" : "warn",
      hint,
    };
  };

  const lines: F2ReconLine[] = [
    mk("Καθαρά έσοδα (κωδ. 301-310)", booksNet, sentNet, "Διαβιβάστε τα εκκρεμή παραστατικά ή ακυρώστε όσα δεν ισχύουν."),
    mk("ΦΠΑ εκροών (κωδ. 331-340)", booksVat, sentVat, "Η διαφορά μεταφέρεται αυτόματα ως απόκλιση στο προσυμπληρωμένο Φ2."),
  ];

  const codeAmount = (c: string) => f2.codes.find((x) => x.code === c)?.amount ?? 0;

  return {
    period,
    lines,
    notTransmitted: income.length - sent.length,
    f2: {
      outputsNet: codeAmount("312"),
      outputsVat: codeAmount("337"),
      inputsNet: codeAmount("367"),
      inputsVat: codeAmount("387"),
      deductibleVat: codeAmount("470"),
      payable: f2.payable,
      credit: f2.credit,
      invoiceCount: f2.invoiceCount,
      expenseCount: f2.expenseCount,
      codes: f2.codes.filter((c) => c.amount !== 0),
    },
    verdict: lines.some((l) => l.status === "blocker") ? "blocker" : lines.some((l) => l.status === "warn") ? "warn" : "ok",
  };
}
