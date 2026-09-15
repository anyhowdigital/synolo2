import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { cashAccounts, customers, expensePayments, expenses, invoices, payments, suppliers } from "@/db/schema";
import { normalizeAfm } from "@/lib/greek/afm";
import { getDocumentType } from "@/lib/greek/document-types";
import { parseCsv, parseNumber, pick } from "./csv";
import type { ImportResult } from "./importers";

const A_DATE = ["Ημερομηνία", "date", "paidAt", "Ημ/νία", "Ημερομηνία πληρωμής"];
const A_DOCNO = ["Παραστατικό", "Αριθμός", "invoice", "number", "Τιμολόγιο", "Αρ. παραστατικού"];
const A_SERIES = ["Σειρά", "series"];
const A_AFM = ["ΑΦΜ", "afm", "vat", "ΑΦΜ πελάτη", "ΑΦΜ προμηθευτή"];
const A_NAME = ["Επωνυμία", "Πελάτης", "Προμηθευτής", "name", "customer", "supplier"];
const A_AMOUNT = ["Ποσό", "amount", "Αξία", "value", "Πληρωμή"];
const A_METHOD = ["Τρόπος", "Τρόπος πληρωμής", "method", "paymentMethod"];
const A_ACCOUNT = ["Λογαριασμός", "account", "Ταμείο", "Τράπεζα", "IBAN"];
const A_REF = ["Αιτιολογία", "reference", "Σημειώσεις", "notes", "description"];
const A_KIND = ["Τύπος", "type", "kind", "Κατηγορία"];

const METHODS: [RegExp, number][] = [
  [/μετρητ|cash/i, 3],
  [/κάρτ|card|pos/i, 7],
  [/iris/i, 8],
  [/επιταγ|cheque/i, 5],
  [/paypal|ηλεκτρον|web/i, 6],
  [/τράπεζ|bank|έμβασμ|κατάθεσ|iban/i, 1],
];

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (dateRe.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y.length === 2 ? `20${y}` : y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function methodFrom(raw: string): number {
  const n = parseNumber(raw);
  if (n !== null && Number.isInteger(n) && n >= 1 && n <= 8) return n;
  return METHODS.find(([re]) => re.test(raw))?.[1] ?? 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const PAYMENT_COLUMNS_HELP =
  "Τύπος (είσπραξη/εξόφληση), Ημερομηνία *, Παραστατικό (αριθμός), Σειρά, ΑΦΜ, Επωνυμία, Ποσό *, Τρόπος πληρωμής, Λογαριασμός ταμείου/τράπεζας, Αιτιολογία";

/**
 * Εισαγωγή εισπράξεων πελατών και εξοφλήσεων προμηθευτών από CSV.
 * Η ταύτιση γίνεται με σειρά+αριθμό παραστατικού, αλλιώς με ΑΦΜ/επωνυμία και το παλαιότερο ανοιχτό υπόλοιπο.
 */
export async function importPayments(db: Db, org: Organization, csvText: string): Promise<ImportResult> {
  const { rows } = parseCsv(csvText);
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, errors: [], refs: [] };
  if (rows.length === 0) return result;

  const [invRows, expRows, custRows, supRows, accounts] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.orgId, org.id)),
    db.select().from(expenses).where(eq(expenses.orgId, org.id)),
    db.select({ id: customers.id, afm: customers.afm, name: customers.name }).from(customers).where(eq(customers.orgId, org.id)),
    db.select({ id: suppliers.id, afm: suppliers.afm, name: suppliers.name }).from(suppliers).where(eq(suppliers.orgId, org.id)),
    db.select().from(cashAccounts).where(and(eq(cashAccounts.orgId, org.id), eq(cashAccounts.active, true))),
  ]);

  const openInvoices = invRows.filter((i) => i.status !== "draft" && i.status !== "cancelled" && getDocumentType(i.invoiceType).kind === "invoice");
  const invByNumber = new Map<string, (typeof openInvoices)[number]>();
  for (const i of openInvoices) {
    if (i.number === null) continue;
    invByNumber.set(`${(i.seriesCode ?? "").toLowerCase()}|${i.number}`, i);
    if (!invByNumber.has(`|${i.number}`)) invByNumber.set(`|${i.number}`, i);
  }
  const custAfm = new Map(custRows.filter((c) => c.afm).map((c) => [c.afm!, c.id]));
  const custName = new Map(custRows.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const supAfm = new Map(supRows.filter((s) => s.afm).map((s) => [s.afm, s.id]));
  const supName = new Map(supRows.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const paidSoFar = new Map<string, number>();
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = i + 2;
    const paidAt = parseDate(pick(r, A_DATE));
    if (!paidAt) {
      result.errors.push({ row, message: `Μη έγκυρη ημερομηνία «${pick(r, A_DATE)}».` });
      continue;
    }
    const amount = parseNumber(pick(r, A_AMOUNT));
    if (amount === null || amount <= 0) {
      result.errors.push({ row, message: "Μη έγκυρο ή μηδενικό ποσό." });
      continue;
    }
    const method = methodFrom(pick(r, A_METHOD));
    const reference = pick(r, A_REF);
    const accountRaw = pick(r, A_ACCOUNT).trim().toLowerCase();
    const account = accountRaw ? accounts.find((a) => a.name.toLowerCase().includes(accountRaw) || (a.iban ?? "").toLowerCase().includes(accountRaw)) : undefined;
    const kindRaw = pick(r, A_KIND);
    const isExpense = /εξόφλ|προμηθευτ|πληρωμ.?ή προμ|expense|supplier|payable|αγορ/i.test(kindRaw);

    const number = pick(r, A_DOCNO).trim();
    const seriesCode = pick(r, A_SERIES).trim().toLowerCase();
    const afmRaw = pick(r, A_AFM);
    const afm = afmRaw ? normalizeAfm(afmRaw) : "";
    const name = pick(r, A_NAME).trim().toLowerCase();

    if (isExpense) {
      let exp = number ? expRows.find((e) => (e.number ?? "") === number && (!seriesCode || (e.series ?? "").toLowerCase() === seriesCode)) : undefined;
      if (!exp) {
        const supplierId = (afm && supAfm.get(afm)) || supName.get(name);
        const candidates = expRows
          .filter((e) => (supplierId ? e.supplierId === supplierId : afm ? e.supplierAfm === afm : e.supplierName.trim().toLowerCase() === name))
          .filter((e) => round2(e.grossValue - e.paidAmount - (paidSoFar.get(e.id) ?? 0)) > 0.005)
          .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
        exp = candidates[0];
      }
      if (!exp) {
        result.errors.push({ row, message: `Δεν βρέθηκε ανοιχτό τιμολόγιο αγοράς για «${pick(r, A_NAME) || number || afm}».` });
        continue;
      }
      const remaining = round2(exp.grossValue - exp.paidAmount - (paidSoFar.get(exp.id) ?? 0));
      if (amount > remaining + 0.005) {
        result.errors.push({ row, message: `Το ποσό ${amount.toFixed(2)} € υπερβαίνει το υπόλοιπο ${remaining.toFixed(2)} € του εξόδου ${exp.series ?? ""}${exp.number ?? ""}.` });
        continue;
      }
      const id = randomUUID();
      await db.insert(expensePayments).values({ id, orgId: org.id, expenseId: exp.id, amount: round2(amount), paidAt, method, reference, accountId: account?.id ?? null, createdAt: now });
      const paid = round2(exp.paidAmount + (paidSoFar.get(exp.id) ?? 0) + amount);
      await db
        .update(expenses)
        .set({ paidAmount: paid, status: paid >= exp.grossValue - 0.005 ? "paid" : "partially_paid", paidAt: paid >= exp.grossValue - 0.005 ? paidAt : null })
        .where(eq(expenses.id, exp.id));
      paidSoFar.set(exp.id, (paidSoFar.get(exp.id) ?? 0) + amount);
      result.refs!.push({ t: "expense_payment", id });
      result.created++;
      continue;
    }

    let inv = number ? (invByNumber.get(`${seriesCode}|${number}`) ?? invByNumber.get(`|${number}`)) : undefined;
    if (!inv) {
      const customerId = (afm && custAfm.get(afm)) || custName.get(name);
      const candidates = openInvoices
        .filter((v) => (customerId ? v.customerId === customerId : afm ? v.customerAfm === afm : (v.customerName ?? "").trim().toLowerCase() === name))
        .filter((v) => round2(v.totalGrossValue - v.paidAmount - (paidSoFar.get(v.id) ?? 0)) > 0.005)
        .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
      inv = candidates[0];
    }
    if (!inv) {
      result.errors.push({ row, message: `Δεν βρέθηκε ανοιχτό παραστατικό για «${pick(r, A_NAME) || number || afm}».` });
      continue;
    }
    const remaining = round2(inv.totalGrossValue - inv.paidAmount - (paidSoFar.get(inv.id) ?? 0));
    if (remaining <= 0.005) {
      result.skipped++;
      continue;
    }
    if (amount > remaining + 0.005) {
      result.errors.push({ row, message: `Το ποσό ${amount.toFixed(2)} € υπερβαίνει το υπόλοιπο ${remaining.toFixed(2)} € του παραστατικού ${inv.seriesCode ?? ""} ${inv.number ?? ""}.` });
      continue;
    }
    const id = randomUUID();
    await db.insert(payments).values({ id, orgId: org.id, invoiceId: inv.id, amount: round2(amount), paidAt, method, reference, accountId: account?.id ?? null, createdAt: now });
    const paid = round2(inv.paidAmount + (paidSoFar.get(inv.id) ?? 0) + amount);
    await db
      .update(invoices)
      .set({ paidAmount: paid, status: paid >= inv.totalGrossValue - 0.005 ? "paid" : "partially_paid", updatedAt: now })
      .where(eq(invoices.id, inv.id));
    paidSoFar.set(inv.id, (paidSoFar.get(inv.id) ?? 0) + amount);
    result.refs!.push({ t: "payment", id });
    result.created++;
  }
  return result;
}

export function paymentsTemplateCsv() {
  return (
    "\uFEFF" +
    [
      "Τύπος;Ημερομηνία;Παραστατικό;Σειρά;ΑΦΜ;Επωνυμία;Ποσό;Τρόπος;Λογαριασμός;Αιτιολογία",
      "Είσπραξη;20/03/2026;12;ΤΠΥ;999888771;Παράδειγμα Α.Ε.;954,80;Τράπεζα;Εθνική;Εξόφληση ΤΠΥ 12",
      "Εξόφληση;22/03/2026;778;ΤΠ;999888783;Γραφική Ύλη ΕΠΕ;297,60;Μετρητά;Ταμείο;Πληρωμή προμηθευτή",
    ].join("\r\n")
  );
}
