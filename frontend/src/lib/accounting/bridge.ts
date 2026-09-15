/**
 * Λογιστική γέφυρα ΕΛΠ (Ν. 4308/2014, Παράρτημα Γ' – Σχέδιο Λογαριασμών).
 * Μετατρέπει παραστατικά, έξοδα και εισπράξεις σε άρθρα ημερολογίου (χρέωση/πίστωση)
 * με κωδικούς που παραμετροποιεί η επιχείρηση/ο λογιστής (org.accountingMapJson).
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { expenses, invoiceLines, invoices, payments, type Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { getVatCategory } from "@/lib/greek/vat";
import { round2 } from "@/lib/invoice/totals";
import { accountLabel, parseAccountMap, type AccountKey, type AccountMap } from "./accounts";

export { ACCOUNT_KEYS, DEFAULT_ACCOUNT_MAP, accountLabel, parseAccountMap, type AccountKey, type AccountMap } from "./accounts";

export interface JournalLine {
  date: string;
  /** Α/Α άρθρου – ίδιο για όλες τις γραμμές του ίδιου παραστατικού. */
  entry: number;
  document: string;
  documentType: string;
  account: string;
  accountLabel: string;
  debit: number;
  credit: number;
  counterpart: string;
  counterpartAfm: string;
  mark: string;
  note: string;
}

const isServiceType = (t: string) => t.startsWith("2.") || t === "11.2" || t === "11.4" || t === "8.1" || t === "8.2";

function incomeAccount(map: AccountMap, invoiceType: string, classificationType: string, customerCountry: string | null): AccountKey {
  if (invoiceType === "1.2" || invoiceType === "1.3" || invoiceType === "2.2" || invoiceType === "2.3" || (customerCountry && customerCountry !== "GR")) return "salesIntraEu";
  if (classificationType.startsWith("E3_561_00")) {
    if (isServiceType(invoiceType) || classificationType === "E3_561_003") return "salesServices";
    return "salesGoods";
  }
  if (classificationType.startsWith("E3_562") || classificationType.startsWith("E3_563") || classificationType.startsWith("E3_564") || classificationType.startsWith("E3_565")) return "salesOther";
  return isServiceType(invoiceType) ? "salesServices" : "salesGoods";
}

function vatOutputAccount(rate: number): AccountKey {
  return rate === 24 ? "vatOutput24" : rate === 13 ? "vatOutput13" : rate === 6 ? "vatOutput6" : "vatOutputOther";
}

function expenseAccount(category: string, classificationType: string): AccountKey {
  switch (category) {
    case "category2_1":
      return "expGoods";
    case "category2_2":
      return "expMaterials";
    case "category2_3":
      return "expServices";
    case "category2_6":
      return "expPersonnel";
    case "category2_7":
    case "category2_8":
      return "expAssets";
    default:
      if (["E3_585_010", "E3_585_011", "E3_585_012", "E3_585_013"].includes(classificationType)) return "expUtilities";
      return "expGeneral";
  }
}

function settlementAccount(method: number): AccountKey {
  return method === 3 ? "cash" : "bank";
}

export async function buildJournal(db: Db, org: Organization, period: { from: string; to: string }) {
  const map = parseAccountMap(org.accountingMapJson);
  const lines: JournalLine[] = [];
  let entry = 0;
  const push = (base: Omit<JournalLine, "account" | "accountLabel" | "debit" | "credit" | "entry">, key: AccountKey, debit: number, credit: number) => {
    if (round2(debit) === 0 && round2(credit) === 0) return;
    lines.push({ ...base, entry, account: map[key], accountLabel: accountLabel(key), debit: round2(debit), credit: round2(credit) });
  };

  const invs = (
    await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to), inArray(invoices.status, ["issued", "partially_paid", "paid"])))
  ).filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.expenseSide;
  });
  const ilines = invs.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invs.map((i) => i.id))) : [];
  const linesByInv = new Map<string, typeof ilines>();
  for (const l of ilines) linesByInv.set(l.invoiceId, [...(linesByInv.get(l.invoiceId) ?? []), l]);

  invs.sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number - b.number);
  for (const inv of invs) {
    const dt = getDocumentType(inv.invoiceType);
    const s = dt.credit ? -1 : 1; // πιστωτικό: αντίστροφες εγγραφές
    entry++;
    const base = {
      date: inv.issueDate,
      document: `${inv.seriesCode}-${String(inv.number).padStart(4, "0")}`,
      documentType: `${inv.invoiceType} ${dt.short}`,
      counterpart: inv.customerName ?? "",
      counterpartAfm: inv.customerAfm ?? "",
      mark: inv.mydataMark ?? "",
      note: dt.name,
    };
    // Πελάτης χρεώνεται με το πληρωτέο (μετά παρακράτηση), η παρακράτηση είναι απαίτηση από το Δημόσιο.
    const receivable = inv.totalGrossValue;
    push(base, "customers", s > 0 ? receivable : 0, s > 0 ? 0 : receivable);
    if (inv.totalWithheldAmount) push(base, "withheldTax", s > 0 ? inv.totalWithheldAmount : 0, s > 0 ? 0 : inv.totalWithheldAmount);

    const byIncome = new Map<AccountKey, number>();
    const byVat = new Map<AccountKey, number>();
    for (const l of linesByInv.get(inv.id) ?? []) {
      const k = incomeAccount(map, inv.invoiceType, l.classificationType, inv.customerCountry);
      byIncome.set(k, round2((byIncome.get(k) ?? 0) + l.netValue));
      if (l.vatAmount) {
        const vk = vatOutputAccount(getVatCategory(l.vatCategory).rate);
        byVat.set(vk, round2((byVat.get(vk) ?? 0) + l.vatAmount));
      }
    }
    for (const [k, amt] of byIncome) push(base, k, s > 0 ? 0 : amt, s > 0 ? amt : 0);
    for (const [k, amt] of byVat) push(base, k, s > 0 ? 0 : amt, s > 0 ? amt : 0);
    if (inv.totalStampDutyAmount) push(base, "stampDuty", s > 0 ? 0 : inv.totalStampDutyAmount, s > 0 ? inv.totalStampDutyAmount : 0);
  }

  // Εισπράξεις
  const pays = invs.length ? await db.select().from(payments).where(and(eq(payments.orgId, org.id), gte(payments.paidAt, period.from), lte(payments.paidAt, period.to))) : [];
  const invById = new Map(invs.map((i) => [i.id, i]));
  const allInvIds = pays.map((p) => p.invoiceId).filter((id) => !invById.has(id));
  if (allInvIds.length) for (const i of await db.select().from(invoices).where(inArray(invoices.id, allInvIds))) invById.set(i.id, i);
  pays.sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  for (const p of pays) {
    const inv = invById.get(p.invoiceId);
    if (!inv) continue;
    const dt = getDocumentType(inv.invoiceType);
    if (dt.kind !== "invoice" || dt.expenseSide) continue;
    entry++;
    const base = {
      date: p.paidAt,
      document: p.reference || `Είσπραξη ${inv.seriesCode}-${String(inv.number).padStart(4, "0")}`,
      documentType: "Είσπραξη",
      counterpart: inv.customerName ?? "",
      counterpartAfm: inv.customerAfm ?? "",
      mark: "",
      note: `Έναντι ${inv.seriesCode}-${String(inv.number).padStart(4, "0")}`,
    };
    const refund = dt.credit;
    push(base, settlementAccount(p.method), refund ? 0 : p.amount, refund ? p.amount : 0);
    push(base, "customers", refund ? p.amount : 0, refund ? 0 : p.amount);
  }

  // Έξοδα
  const exps = (await db.select().from(expenses).where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to)))).filter((e) => e.status !== "rejected");
  exps.sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  for (const e of exps) {
    entry++;
    const base = {
      date: e.issueDate,
      document: [e.series, e.number].filter(Boolean).join("-") || (e.mark ? `MARK ${e.mark}` : "—"),
      documentType: `${e.invoiceType} (έξοδο)`,
      counterpart: e.supplierName,
      counterpartAfm: e.supplierAfm,
      mark: e.mark ?? "",
      note: e.description || "",
    };
    const credit = e.invoiceType.startsWith("5.") || e.invoiceType === "1.6" || e.invoiceType === "2.4";
    const s = credit ? -1 : 1;
    const expKey = expenseAccount(e.classificationCategory ?? "", e.classificationType ?? "");
    const vatKey: AccountKey = e.vatDeductible ? "vatInput" : "vatInputNonDeductible";
    push(base, expKey, s > 0 ? e.netValue : 0, s > 0 ? 0 : e.netValue);
    if (e.vatAmount) push(base, vatKey, s > 0 ? e.vatAmount : 0, s > 0 ? 0 : e.vatAmount);
    const payable = round2(e.netValue + e.vatAmount - e.withheldAmount);
    push(base, "suppliers", s > 0 ? 0 : payable, s > 0 ? payable : 0);
    if (e.withheldAmount) push(base, "withheldTax", s > 0 ? 0 : e.withheldAmount, s > 0 ? e.withheldAmount : 0);
  }

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { lines, entries: entry, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01, map };
}

export function journalToCsv(lines: JournalLine[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "");
  const header = ["Ημερομηνία", "Α/Α άρθρου", "Παραστατικό", "Τύπος", "Λογαριασμός", "Περιγραφή λογαριασμού", "Χρέωση", "Πίστωση", "Αντισυμβαλλόμενος", "ΑΦΜ", "MARK", "Αιτιολογία"];
  const out = [header.map(esc).join(";")];
  for (const l of lines) out.push([l.date, l.entry, l.document, l.documentType, l.account, l.accountLabel, num(l.debit), num(l.credit), l.counterpart, l.counterpartAfm, l.mark, l.note].map(esc).join(";"));
  return "\uFEFF" + out.join("\r\n");
}
