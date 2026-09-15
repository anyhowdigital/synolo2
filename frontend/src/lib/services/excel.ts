import ExcelJS from "exceljs";
import type { Db } from "@/db";
import { expenses, type Organization } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDocumentType } from "@/lib/greek/document-types";
import { getVatCategory } from "@/lib/greek/vat";
import { EXPENSE_CLASSIFICATION_CATEGORIES } from "@/lib/services/expense-labels";
import { ACCOUNT_KEYS, buildJournal, type AccountKey } from "@/lib/accounting/bridge";
import { classificationReport, customerStatement, f2Report, listIncomeDocuments, vatReport, type ReportPeriod } from "./reports";

const MONEY = "#,##0.00 [$€-408]";

function sheetWithHeader(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number; money?: boolean }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.money ? { numFmt: MONEY } : undefined }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function newWorkbook(org: Organization, subject: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = org.name;
  wb.created = new Date();
  wb.subject = subject;
  return wb;
}

/** Πλήρες βιβλίο περιόδου για λογιστή: παραστατικά, γραμμές, ΦΠΑ, Φ2, Ε3, έξοδα, ημερολόγιο ΕΛΠ. */
export async function buildReportsWorkbook(db: Db, org: Organization, period: ReportPeriod) {
  const wb = newWorkbook(org, `Έσοδα-Έξοδα ${period.from} – ${period.to}`);
  const [{ rows, lines }, vat, cls, f2, exps, journal] = await Promise.all([
    listIncomeDocuments(db, org.id, period),
    vatReport(db, org.id, period),
    classificationReport(db, org.id, period),
    f2Report(db, org.id, period),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to))),
    buildJournal(db, org, period),
  ]);
  const byInvoice = new Map(rows.map((r) => [r.id, r]));
  const sign = (t: string) => (getDocumentType(t).credit ? -1 : 1);

  const wsInv = sheetWithHeader(wb, "Παραστατικά", [
    { header: "Ημερομηνία", key: "date", width: 12 },
    { header: "Παραστατικό", key: "num", width: 14 },
    { header: "Τύπος myDATA", key: "type", width: 10 },
    { header: "Περιγραφή τύπου", key: "typeName", width: 34 },
    { header: "Πελάτης", key: "customer", width: 32 },
    { header: "ΑΦΜ", key: "afm", width: 12 },
    { header: "Χώρα", key: "country", width: 6 },
    { header: "Καθαρή αξία", key: "net", money: true },
    { header: "ΦΠΑ", key: "vat", money: true },
    { header: "Παρακράτηση", key: "withheld", money: true },
    { header: "Χαρτόσημο", key: "stamp", money: true },
    { header: "Σύνολο", key: "gross", money: true },
    { header: "Εισπραχθέν", key: "paid", money: true },
    { header: "Κατάσταση", key: "status", width: 14 },
    { header: "MARK", key: "mark", width: 18 },
    { header: "Ημ. διαβίβασης", key: "sentAt", width: 12 },
  ]);
  for (const r of [...rows].sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number - b.number)) {
    const s = sign(r.invoiceType);
    wsInv.addRow({
      date: r.issueDate,
      num: `${r.seriesCode}-${String(r.number).padStart(4, "0")}`,
      type: r.invoiceType,
      typeName: getDocumentType(r.invoiceType).name,
      customer: r.customerName,
      afm: r.customerAfm,
      country: r.customerCountry,
      net: s * r.totalNetValue,
      vat: s * r.totalVatAmount,
      withheld: s * r.totalWithheldAmount,
      stamp: s * r.totalStampDutyAmount,
      gross: s * r.totalGrossValue,
      paid: s * r.paidAmount,
      status: r.status,
      mark: r.mydataMark ?? "",
      sentAt: r.mydataSentAt?.slice(0, 10) ?? "",
    });
  }

  const wsLines = sheetWithHeader(wb, "Γραμμές", [
    { header: "Ημερομηνία", key: "date", width: 12 },
    { header: "Παραστατικό", key: "num", width: 14 },
    { header: "Πελάτης", key: "customer", width: 30 },
    { header: "Γραμμή", key: "ln", width: 7 },
    { header: "Περιγραφή", key: "desc", width: 40 },
    { header: "Ποσότητα", key: "qty", width: 9 },
    { header: "Καθαρή αξία", key: "net", money: true },
    { header: "Κατ. ΦΠΑ", key: "vatCat", width: 10 },
    { header: "ΦΠΑ", key: "vat", money: true },
    { header: "Χαρακτηρισμός Ε3", key: "clsType", width: 14 },
    { header: "Κατηγορία", key: "clsCat", width: 14 },
  ]);
  for (const l of lines) {
    const inv = byInvoice.get(l.invoiceId)!;
    const s = sign(inv.invoiceType);
    wsLines.addRow({
      date: inv.issueDate,
      num: `${inv.seriesCode}-${String(inv.number).padStart(4, "0")}`,
      customer: inv.customerName,
      ln: l.lineNumber,
      desc: l.description,
      qty: l.quantity,
      net: s * l.netValue,
      vatCat: getVatCategory(l.vatCategory).label,
      vat: s * l.vatAmount,
      clsType: l.classificationType,
      clsCat: l.classificationCategory,
    });
  }

  const wsVat = sheetWithHeader(wb, "ΦΠΑ εκροών", [
    { header: "Συντελεστής", key: "rate", width: 16 },
    { header: "Φορολογητέα αξία", key: "net", money: true },
    { header: "ΦΠΑ", key: "vat", money: true },
    { header: "Γραμμές", key: "count", width: 9 },
  ]);
  for (const r of vat.rows) wsVat.addRow({ rate: r.rate < 0 ? "Χωρίς ΦΠΑ (κατ. 8)" : `${r.rate}%`, net: r.net, vat: r.vat, count: r.count });
  wsVat.addRow({ rate: "Σύνολο", net: vat.totalNet, vat: vat.totalVat }).font = { bold: true };

  const wsF2 = sheetWithHeader(wb, "Φ2", [
    { header: "Κωδικός", key: "code", width: 9 },
    { header: "Περιγραφή", key: "label", width: 60 },
    { header: "Ποσό", key: "amount", money: true },
  ]);
  for (const c of f2.codes) {
    const row = wsF2.addRow({ code: c.code, label: c.label, amount: c.amount });
    if (["307", "312", "337", "367", "387", "483", "484"].includes(c.code)) row.font = { bold: true };
  }
  wsF2.addRow({});
  wsF2.addRow({ label: "Ενδεικτικοί υπολογισμοί από τα παραστατικά της περιόδου – οριστικοποίηση από τον λογιστή (διακανονισμοί, pro-rata, πιστωτικό προηγούμενης περιόδου)." }).font = { italic: true, color: { argb: "FF666666" } };

  const wsE3 = sheetWithHeader(wb, "Ε3 έσοδα", [
    { header: "Κωδικός Ε3", key: "type", width: 12 },
    { header: "Περιγραφή", key: "typeLabel", width: 44 },
    { header: "Κατηγορία", key: "category", width: 12 },
    { header: "Περιγραφή κατηγορίας", key: "categoryLabel", width: 36 },
    { header: "Ποσό", key: "amount", money: true },
  ]);
  for (const c of cls) wsE3.addRow(c);

  const wsExp = sheetWithHeader(wb, "Έξοδα", [
    { header: "Ημερομηνία", key: "date", width: 12 },
    { header: "Προμηθευτής", key: "supplier", width: 32 },
    { header: "ΑΦΜ", key: "afm", width: 12 },
    { header: "Χώρα", key: "country", width: 6 },
    { header: "Τύπος", key: "type", width: 8 },
    { header: "Παραστατικό", key: "num", width: 14 },
    { header: "Περιγραφή", key: "desc", width: 30 },
    { header: "Καθαρή αξία", key: "net", money: true },
    { header: "Κατ. ΦΠΑ", key: "vatCat", width: 10 },
    { header: "ΦΠΑ", key: "vat", money: true },
    { header: "Εκπίπτει ΦΠΑ", key: "deductible", width: 10 },
    { header: "Παρακράτηση", key: "withheld", money: true },
    { header: "Σύνολο", key: "gross", money: true },
    { header: "Κατηγορία ecls", key: "cat", width: 36 },
    { header: "Τύπος Ε3", key: "clsType", width: 14 },
    { header: "MARK", key: "mark", width: 18 },
    { header: "Χαρακτηρισμός διαβιβάστηκε", key: "sent", width: 12 },
    { header: "Κατάσταση", key: "status", width: 12 },
  ]);
  for (const e of exps.sort((a, b) => a.issueDate.localeCompare(b.issueDate))) {
    wsExp.addRow({
      date: e.issueDate,
      supplier: e.supplierName,
      afm: e.supplierAfm,
      country: e.supplierCountry,
      type: e.invoiceType,
      num: [e.series, e.number].filter(Boolean).join("-"),
      desc: e.description,
      net: e.netValue,
      vatCat: getVatCategory(e.vatCategory).label,
      vat: e.vatAmount,
      deductible: e.vatDeductible ? "Ναι" : "Όχι",
      withheld: e.withheldAmount,
      gross: e.grossValue,
      cat: EXPENSE_CLASSIFICATION_CATEGORIES.find((c) => c.code === e.classificationCategory)?.label ?? e.classificationCategory,
      clsType: e.classificationType,
      mark: e.mark ?? "",
      sent: e.classificationSentAt?.slice(0, 10) ?? "",
      status: e.status,
    });
  }

  addJournalSheet(wb, journal.lines);
  return wb;
}

export function addJournalSheet(wb: ExcelJS.Workbook, lines: Awaited<ReturnType<typeof buildJournal>>["lines"]) {
  const ws = sheetWithHeader(wb, "Ημερολόγιο ΕΛΠ", [
    { header: "Ημερομηνία", key: "date", width: 12 },
    { header: "Άρθρο", key: "entry", width: 7 },
    { header: "Παραστατικό", key: "document", width: 18 },
    { header: "Τύπος", key: "documentType", width: 16 },
    { header: "Λογαριασμός", key: "account", width: 14 },
    { header: "Περιγραφή λογαριασμού", key: "accountLabel", width: 36 },
    { header: "Χρέωση", key: "debit", money: true },
    { header: "Πίστωση", key: "credit", money: true },
    { header: "Αντισυμβαλλόμενος", key: "counterpart", width: 30 },
    { header: "ΑΦΜ", key: "counterpartAfm", width: 12 },
    { header: "MARK", key: "mark", width: 18 },
    { header: "Αιτιολογία", key: "note", width: 36 },
  ]);
  for (const l of lines) ws.addRow({ ...l, debit: l.debit || null, credit: l.credit || null });
  return ws;
}

export async function buildJournalWorkbook(db: Db, org: Organization, period: ReportPeriod) {
  const wb = newWorkbook(org, `Ημερολόγιο ΕΛΠ ${period.from} – ${period.to}`);
  const journal = await buildJournal(db, org, period);
  addJournalSheet(wb, journal.lines);
  const wsMap = sheetWithHeader(wb, "Λογαριασμοί", [
    { header: "Κλειδί", key: "key", width: 22 },
    { header: "Περιγραφή", key: "label", width: 44 },
    { header: "Κωδικός", key: "code", width: 14 },
  ]);
  for (const [key, code] of Object.entries(journal.map)) wsMap.addRow({ key, label: ACCOUNT_KEYS.find((k) => k.key === (key as AccountKey))?.label ?? key, code });
  return wb;
}

export async function buildStatementWorkbook(db: Db, org: Organization, customerId: string, period?: Partial<ReportPeriod>) {
  const st = await customerStatement(db, org.id, customerId, period);
  if (!st) return null;
  const wb = newWorkbook(org, `Καρτέλα ${st.customer.name}`);
  const ws = sheetWithHeader(wb, "Καρτέλα", [
    { header: "Ημερομηνία", key: "date", width: 12 },
    { header: "Παραστατικό", key: "reference", width: 16 },
    { header: "Περιγραφή", key: "description", width: 44 },
    { header: "Χρέωση", key: "debit", money: true },
    { header: "Πίστωση", key: "credit", money: true },
    { header: "Υπόλοιπο", key: "balance", money: true },
  ]);
  ws.addRow({ date: period?.from ?? "", reference: "", description: "Υπόλοιπο από μεταφορά", balance: st.opening }).font = { italic: true };
  for (const r of st.rows) ws.addRow({ ...r, debit: r.debit || null, credit: r.credit || null });
  ws.addRow({ description: "Σύνολα περιόδου", debit: st.totalDebit, credit: st.totalCredit, balance: st.closing }).font = { bold: true };
  return { wb, statement: st };
}

export async function workbookResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buf.length),
    },
  });
}
