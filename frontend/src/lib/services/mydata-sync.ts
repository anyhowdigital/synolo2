import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { expenses, invoices, type Invoice, type Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import {
  buildExpensesClassificationXml,
  requestMyIncome,
  requestTransmittedDocs,
  sendExpensesClassification,
  type MyIncomeRow,
  type TransmittedDoc,
} from "@/lib/mydata/client";
import { audit } from "./audit";
import { resolveActor } from "./actor";
import { orgMyDataCredentials } from "./org";
import { transmitToMyData } from "./invoices";

export interface Period {
  from: string;
  to: string;
}

/* ---------- Χαρακτηρισμός εξόδων προς ΑΑΔΕ ---------- */

export async function sendExpenseClassification(db: Db, org: Organization, expenseId: string) {
  const exp = await db.query.expenses.findFirst({ where: and(eq(expenses.id, expenseId), eq(expenses.orgId, org.id)) });
  if (!exp) throw new Error("Το έξοδο δεν βρέθηκε.");
  if (!exp.mark) throw new Error("Ο χαρακτηρισμός διαβιβάζεται μόνο για παραστατικά με MARK (που ήρθαν από το myDATA).");
  if (!exp.classificationCategory || !exp.classificationType) throw new Error("Συμπληρώστε πρώτα κατηγορία και τύπο χαρακτηρισμού.");

  const xml = buildExpensesClassificationXml(exp.mark, [
    {
      lineNumber: 1,
      classificationType: exp.classificationType,
      classificationCategory: exp.classificationCategory,
      amount: exp.netValue,
      vatAmount: exp.vatDeductible ? exp.vatAmount : undefined,
      vatCategory: exp.vatDeductible ? exp.vatCategory : undefined,
    },
  ]);
  const result = await sendExpensesClassification(orgMyDataCredentials(org), xml);
  if (!result.ok) {
    const msg = result.errors?.map((e) => `${e.code}: ${e.message}`).join(" · ") ?? "Άγνωστο σφάλμα";
    await audit(db, org.id, "expense", exp.id, "mydata_error", msg, await resolveActor(db));
    throw new Error(`Η ΑΑΔΕ απέρριψε τον χαρακτηρισμό – ${msg}`);
  }
  await db
    .update(expenses)
    .set({ classificationSentAt: new Date().toISOString(), status: exp.status === "pending" ? "classified" : exp.status })
    .where(eq(expenses.id, exp.id));
  await audit(db, org.id, "expense", exp.id, "expense_classified", `MARK ${exp.mark} · ${exp.classificationCategory}/${exp.classificationType}`, await resolveActor(db));
  return { ok: true };
}

/** Μαζική διαβίβαση χαρακτηρισμών για όλα τα χαρακτηρισμένα-μη-διαβιβασμένα έξοδα περιόδου. */
export async function sendPendingExpenseClassifications(db: Db, org: Organization, period: Period) {
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, period.from), lte(expenses.issueDate, period.to), isNotNull(expenses.mark)));
  const targets = rows.filter((e) => e.classificationCategory && e.classificationType && !e.classificationSentAt);
  let sent = 0;
  const errors: string[] = [];
  for (const e of targets) {
    try {
      await sendExpenseClassification(db, org, e.id);
      sent++;
    } catch (err) {
      errors.push(`${e.supplierName}: ${(err as Error).message}`);
    }
  }
  return { sent, failed: errors.length, errors };
}

/* ---------- Συμφωνία διαβιβασμένων (RequestTransmittedDocs) ---------- */

export interface ReconciliationResult {
  period: Period;
  mock: boolean;
  /** Τοπικά παραστατικά με MARK που επιβεβαιώθηκαν από την ΑΑΔΕ. */
  matched: number;
  /** Τοπικά με MARK που ΔΕΝ βρέθηκαν στην ΑΑΔΕ. */
  missingRemote: Invoice[];
  /** Παραστατικά στην ΑΑΔΕ που δεν υπάρχουν τοπικά (π.χ. από ταμειακή/άλλο σύστημα). */
  missingLocal: TransmittedDoc[];
  /** Ακυρωμένα στην ΑΑΔΕ αλλά ενεργά τοπικά – ενημερώθηκαν αυτόματα. */
  cancelledRemote: Invoice[];
  /** Τοπικά εκδοθέντα χωρίς διαβίβαση. */
  notTransmitted: Invoice[];
}

function localFiscal(db: Db, orgId: string, period: Period) {
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to), inArray(invoices.status, ["issued", "partially_paid", "paid", "cancelled"])));
}

export async function reconcileTransmitted(db: Db, org: Organization, period: Period): Promise<ReconciliationResult> {
  const creds = orgMyDataCredentials(org);
  const res = await requestTransmittedDocs(creds, { dateFrom: period.from, dateTo: period.to });
  if (!res.ok) throw new Error(res.error ?? "Αποτυχία επικοινωνίας με το myDATA.");
  const local = (await localFiscal(db, org.id, period)).filter((i) => getDocumentType(i.invoiceType).kind !== "quote");
  const mock = res.docs === null;

  // Στην προσομοίωση η ΑΑΔΕ «έχει» ακριβώς όσα έχουμε διαβιβάσει.
  const remote: TransmittedDoc[] =
    res.docs ??
    local
      .filter((i) => i.mydataMark)
      .map((i) => ({
        mark: i.mydataMark!,
        uid: i.mydataUid ?? "",
        series: i.seriesCode,
        aa: String(i.number),
        issueDate: i.issueDate,
        invoiceType: i.invoiceType,
        totalNetValue: i.totalNetValue,
        totalVatAmount: i.totalVatAmount,
        totalGrossValue: i.totalGrossValue,
        counterpartAfm: i.customerAfm ?? "",
        cancelledByMark: i.mydataCancellationMark ?? null,
      }));

  const remoteByMark = new Map(remote.map((d) => [d.mark, d]));
  const localMarks = new Set(local.map((i) => i.mydataMark).filter(Boolean) as string[]);

  let matched = 0;
  const missingRemote: Invoice[] = [];
  const cancelledRemote: Invoice[] = [];
  for (const inv of local) {
    if (!inv.mydataMark) continue;
    const r = remoteByMark.get(inv.mydataMark);
    if (!r) {
      missingRemote.push(inv);
      continue;
    }
    matched++;
    if (r.cancelledByMark && inv.status !== "cancelled") {
      await db
        .update(invoices)
        .set({ status: "cancelled", mydataStatus: "cancelled", mydataCancellationMark: r.cancelledByMark, updatedAt: new Date().toISOString() })
        .where(eq(invoices.id, inv.id));
      await audit(db, org.id, "invoice", inv.id, "cancelled", `Ακυρώθηκε στην ΑΑΔΕ (MARK ακύρωσης ${r.cancelledByMark}) – συγχρονισμός`, await resolveActor(db));
      cancelledRemote.push(inv);
    }
  }
  const missingLocal = remote.filter((d) => !localMarks.has(d.mark));
  const notTransmitted = local.filter((i) => !i.mydataMark && i.status !== "cancelled" && getDocumentType(i.invoiceType).kind === "invoice");

  await audit(db, org.id, "organization", org.id, "updated", `Συμφωνία myDATA ${period.from}–${period.to}: ${matched} επιβεβαιωμένα, ${missingRemote.length} χωρίς αντιστοιχία, ${missingLocal.length} μόνο στην ΑΑΔΕ`, await resolveActor(db));
  return { period, mock, matched, missingRemote, missingLocal, cancelledRemote, notTransmitted };
}

/* ---------- Έσοδα ΑΑΔΕ (RequestMyIncome) vs τοπικά ---------- */

export interface IncomeComparison {
  mock: boolean;
  byType: { invoiceType: string; name: string; remoteNet: number; remoteVat: number; localNet: number; localVat: number; diffNet: number }[];
  remoteNet: number;
  remoteVat: number;
  localNet: number;
  localVat: number;
  rowCount: number;
}

export async function compareMyIncome(db: Db, org: Organization, period: Period): Promise<IncomeComparison> {
  const res = await requestMyIncome(orgMyDataCredentials(org), { dateFrom: period.from, dateTo: period.to });
  if (!res.ok) throw new Error(res.error ?? "Αποτυχία επικοινωνίας με το myDATA.");
  const local = (await localFiscal(db, org.id, period)).filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.expenseSide && i.status !== "cancelled";
  });
  const sign = (t: string) => (getDocumentType(t).credit ? -1 : 1);

  const remoteRows: MyIncomeRow[] =
    res.rows ??
    local
      .filter((i) => i.mydataMark)
      .map((i) => ({
        counterVatNumber: i.customerAfm ?? "",
        issueDate: i.issueDate,
        invType: i.invoiceType,
        selfPricing: i.selfPricing,
        classificationType: "",
        classificationCategory: "",
        netValue: i.totalNetValue,
        vatAmount: i.totalVatAmount,
        withheldAmount: i.totalWithheldAmount,
        grossValue: i.totalGrossValue,
        minMark: i.mydataMark!,
        maxMark: i.mydataMark!,
      }));

  const types = new Map<string, IncomeComparison["byType"][number]>();
  const get = (t: string) => {
    let e = types.get(t);
    if (!e) {
      let name = t;
      try {
        name = getDocumentType(t).name;
      } catch {
        /* άγνωστος τύπος από ΑΑΔΕ */
      }
      e = { invoiceType: t, name, remoteNet: 0, remoteVat: 0, localNet: 0, localVat: 0, diffNet: 0 };
      types.set(t, e);
    }
    return e;
  };
  for (const r of remoteRows) {
    const e = get(r.invType);
    const s = (() => {
      try {
        return sign(r.invType);
      } catch {
        return 1;
      }
    })();
    e.remoteNet = round2(e.remoteNet + s * r.netValue);
    e.remoteVat = round2(e.remoteVat + s * r.vatAmount);
  }
  for (const i of local) {
    const e = get(i.invoiceType);
    e.localNet = round2(e.localNet + sign(i.invoiceType) * i.totalNetValue);
    e.localVat = round2(e.localVat + sign(i.invoiceType) * i.totalVatAmount);
  }
  const byType = [...types.values()].map((e) => ({ ...e, diffNet: round2(e.localNet - e.remoteNet) })).sort((a, b) => a.invoiceType.localeCompare(b.invoiceType));
  return {
    mock: res.rows === null,
    byType,
    remoteNet: round2(byType.reduce((s, e) => s + e.remoteNet, 0)),
    remoteVat: round2(byType.reduce((s, e) => s + e.remoteVat, 0)),
    localNet: round2(byType.reduce((s, e) => s + e.localNet, 0)),
    localVat: round2(byType.reduce((s, e) => s + e.localVat, 0)),
    rowCount: remoteRows.length,
  };
}

/* ---------- Μαζική διαβίβαση ---------- */

/** Εκδοθέντα φορολογικά παραστατικά που δεν έχουν (επιτυχώς) διαβιβαστεί. */
export async function listPendingTransmissions(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.status, ["issued", "partially_paid", "paid"]), inArray(invoices.mydataStatus, ["not_sent", "error"])));
  return rows.filter((i) => getDocumentType(i.invoiceType).kind !== "quote");
}

export async function transmitAllPending(db: Db, org: Organization, ids?: string[]) {
  const targets = (await listPendingTransmissions(db, org.id)).filter((i) => !ids || ids.includes(i.id));
  let sent = 0;
  const errors: { id: string; number: string; error: string }[] = [];
  for (const inv of targets) {
    try {
      await transmitToMyData(db, org, inv.id);
      sent++;
    } catch (err) {
      errors.push({ id: inv.id, number: `${inv.seriesCode}-${inv.number}`, error: (err as Error).message });
    }
  }
  return { total: targets.length, sent, errors };
}
