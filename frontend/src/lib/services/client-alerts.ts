import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { employees, expenses, invoices, payments, payrollRuns, periodLocks } from "@/db/schema";
import type { Organization } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { BONUS_LABEL, bonusDeadline, bonusRunKey, type BonusKind } from "@/lib/services/bonuses";
import { getDocumentType } from "@/lib/greek/document-types";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";

export type AlertSeverity = "high" | "medium" | "low";

export interface ClientAlert {
  code: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
  entity?: { type: "invoice" | "expense" | "payment" | "bank"; id: string; label: string };
  fixable?: "classify" | "transmit" | null;
}

const H = "high" as const;
const M = "medium" as const;
const L = "low" as const;

/**
 * Εντοπίζει λάθη/παρατυπίες που έκανε η επιχείρηση στα βιβλία της.
 * Χρησιμοποιείται από την πύλη λογιστή και το πάνελ της επιχείρησης.
 */
export async function clientAlerts(db: Db, org: Organization): Promise<ClientAlert[]> {
  const out: ClientAlert[] = [];
  const [inv, exp, pays, locks] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.orgId, org.id)),
    db.select().from(expenses).where(eq(expenses.orgId, org.id)),
    db.select().from(payments).where(eq(payments.orgId, org.id)),
    db.select().from(periodLocks).where(eq(periodLocks.orgId, org.id)),
  ]);
  const issued = inv.filter((i) => i.status !== "draft" && i.status !== "cancelled");
  const now = Date.now();
  const lockedMonths = new Set(locks.map((l) => l.month));

  // 1. Κενά / διπλά στην αρίθμηση ανά σειρά
  const bySeries = new Map<string, typeof issued>();
  for (const i of issued) {
    const key = `${i.seriesCode || "—"}`;
    bySeries.set(key, [...(bySeries.get(key) ?? []), i]);
  }
  for (const [series, rows] of bySeries) {
    const nums = rows.map((r) => Number(r.number)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    const dupes = nums.filter((n, idx) => idx > 0 && n === nums[idx - 1]);
    if (dupes.length) {
      out.push({ code: "numbering_duplicate", title: `Διπλή αρίθμηση στη σειρά ${series}`, detail: `Αριθμοί που επαναλαμβάνονται: ${[...new Set(dupes)].slice(0, 5).join(", ")}`, severity: H });
    }
    const gaps: number[] = [];
    for (let k = 1; k < nums.length; k++) {
      if (nums[k] - nums[k - 1] > 1) for (let g = nums[k - 1] + 1; g < nums[k] && gaps.length < 8; g++) gaps.push(g);
    }
    if (gaps.length) {
      out.push({ code: "numbering_gap", title: `Κενά στην αρίθμηση της σειράς ${series}`, detail: `Λείπουν οι αριθμοί: ${gaps.join(", ")}`, severity: M });
    }
  }

  // 2. Παραστατικά σε κλειδωμένη περίοδο
  for (const i of issued) {
    if (lockedMonths.has(i.issueDate.slice(0, 7)) && Date.parse(i.createdAt) > Date.parse(`${i.issueDate}T00:00:00Z`) + 5 * 86400000) {
      out.push({
        code: "invoice_in_locked_period",
        title: "Παραστατικό σε κλειδωμένη περίοδο",
        detail: `${i.seriesCode}-${i.number} με ημερομηνία ${i.issueDate} καταχωρήθηκε μετά το κλείσιμο.`,
        severity: H,
        entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` },
      });
    }
  }

  // 3. myDATA: μη διαβιβασμένα > 24 ώρες, απορρίψεις, χωρίς ΜΑΡΚ (όχι προσφορές — δεν διαβιβάζονται)
  for (const i of issued) {
    if (getDocumentType(i.invoiceType).kind === "quote") continue;
    const age = (now - Date.parse(i.createdAt)) / 3600000;
    if (i.mydataStatus === "rejected") {
      out.push({ code: "mydata_rejected", title: "Απόρριψη από ΑΑΔΕ", detail: `${i.seriesCode}-${i.number}: ${i.mydataError || "χωρίς λεπτομέρεια"} — χρειάζεται διόρθωση.`, severity: H, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` }, fixable: "transmit" });
    } else if (i.mydataStatus !== "sent" && age > 24) {
      out.push({ code: "mydata_pending_24h", title: "Μη διαβιβασμένο παραστατικό >24 ώρες", detail: `${i.seriesCode}-${i.number} (${i.issueDate}) δεν έχει διαβιβαστεί στο myDATA.`, severity: H, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` }, fixable: "transmit" });
    } else if (i.mydataStatus === "sent" && !i.mydataMark) {
      out.push({ code: "mydata_missing_mark", title: "Διαβιβασμένο χωρίς ΜΑΡΚ", detail: `${i.seriesCode}-${i.number}: λείπει ο ΜΑΡΚ — ελέγξτε την απάντηση της ΑΑΔΕ.`, severity: M, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` } });
    }
  }

  // 4. Τιμολόγια χωρίς ΑΦΜ πελάτη ή με μη έγκυρο ΑΦΜ (B2B)
  for (const i of issued) {
    const dt = getDocumentType(i.invoiceType);
    if (dt.kind !== "invoice") continue;
    const afm = normalizeAfm(i.customerAfm ?? "");
    if (!afm) {
      out.push({ code: "customer_afm_missing", title: "Τιμολόγιο χωρίς ΑΦΜ πελάτη", detail: `${i.seriesCode}-${i.number} · ${i.customerName}`, severity: M, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` } });
    } else if (i.customerCountry === "GR" && !isValidAfm(afm)) {
      out.push({ code: "customer_afm_invalid", title: "Μη έγκυρο ΑΦΜ πελάτη", detail: `${i.seriesCode}-${i.number} · ${i.customerName} (${afm})`, severity: H, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` } });
    }
  }

  // 5. Μηδενικό ΦΠΑ χωρίς αιτιολογία απαλλαγής
  for (const i of issued) {
    if (i.totalVatAmount === 0 && i.totalNetValue > 0 && i.customerCountry === "GR") {
      out.push({ code: "vat_zero_check", title: "Μηδενικό ΦΠΑ σε εγχώριο τιμολόγιο", detail: `${i.seriesCode}-${i.number} · ${i.customerName}: ελέγξτε αν δικαιολογείται απαλλαγή ΦΠΑ.`, severity: M, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` } });
    }
  }

  // 6. Έξοδα: αχαρακτήριστα, χωρίς ΑΦΜ προμηθευτή, χωρίς αριθμό
  const drafts = exp.filter((e) => e.status === "draft" || !e.classificationType);
  if (drafts.length) {
    out.push({ code: "expenses_unclassified", title: `${drafts.length} έξοδα χωρίς χαρακτηρισμό`, detail: "Τα έξοδα δεν έχουν χαρακτηρισμό Ε3/ΦΠΑ και δεν μπαίνουν σωστά στα βιβλία.", severity: M, fixable: "classify" });
  }
  const noAfm = exp.filter((e) => !normalizeAfm(e.supplierAfm ?? "") && e.supplierCountry === "GR");
  if (noAfm.length) {
    out.push({ code: "expense_afm_missing", title: `${noAfm.length} έξοδα χωρίς ΑΦΜ προμηθευτή`, detail: `Π.χ. ${noAfm.slice(0, 3).map((e) => e.supplierName).join(", ")}`, severity: M });
  }
  const noNumber = exp.filter((e) => !(e.number ?? "").trim());
  if (noNumber.length) {
    out.push({ code: "expense_number_missing", title: `${noNumber.length} έξοδα χωρίς αριθμό παραστατικού`, detail: "Μη αποδεκτά σε έλεγχο — συμπληρώστε αριθμό/σειρά.", severity: L });
  }

  // 7. Πληρωμές: υπερείσπραξη ή πληρωμή σε ανύπαρκτο τιμολόγιο
  const invById = new Map(inv.map((i) => [i.id, i]));
  const paidByInvoice = new Map<string, number>();
  for (const p of pays) {
    if (p.invoiceId) paidByInvoice.set(p.invoiceId, round2((paidByInvoice.get(p.invoiceId) ?? 0) + p.amount));
    if (p.invoiceId && !invById.has(p.invoiceId)) {
      out.push({ code: "payment_orphan", title: "Πληρωμή σε παραστατικό που δεν υπάρχει", detail: `Ποσό ${round2(p.amount)} € (${p.paidAt})`, severity: H, entity: { type: "payment", id: p.id, label: `${round2(p.amount)} €` } });
    }
  }
  for (const [invoiceId, paid] of paidByInvoice) {
    const i = invById.get(invoiceId);
    if (i && paid > round2(i.totalGrossValue) + 0.01) {
      out.push({ code: "payment_over", title: "Υπερείσπραξη σε τιμολόγιο", detail: `${i.seriesCode}-${i.number}: εισπράχθηκαν ${round2(paid)} € έναντι ${round2(i.totalGrossValue)} €`, severity: H, entity: { type: "invoice", id: i.id, label: `${i.seriesCode}-${i.number}` } });
    }
  }

  // 8. Ληξιπρόθεσμα > 90 ημέρες
  const old = issued.filter((i) => {
    const rem = round2(i.totalGrossValue - (i.paidAmount ?? 0));
    return rem > 0.01 && i.dueDate && (now - Date.parse(i.dueDate)) / 86400000 > 90;
  });
  if (old.length) {
    out.push({ code: "receivables_90", title: `${old.length} τιμολόγια ανείσπρακτα >90 ημέρες`, detail: `Σύνολο ${round2(old.reduce((s, i) => s + (i.totalGrossValue - (i.paidAmount ?? 0)), 0))} € — κίνδυνος επισφάλειας.`, severity: M });
  }

  // 9. Μισθοδοσία: προθεσμίες δώρων/ΑΠΔ (15 ημέρες πριν) με τα υπολογισμένα ποσά
  out.push(...(await payrollAlerts(db, org.id)));

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : b.severity === "high" ? 1 : a.severity === "medium" ? -1 : 1));
}

async function payrollAlerts(db: Db, orgId: string): Promise<ClientAlert[]> {
  const staff = await db.select().from(employees).where(and(eq(employees.orgId, orgId), eq(employees.active, true)));
  if (!staff.length) return [];
  const out: ClientAlert[] = [];
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const year = today.getUTCFullYear();
  const daysUntil = (iso: string) => Math.ceil((Date.parse(iso) - Date.parse(todayIso)) / 86400000);
  const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.orgId, orgId));

  for (const kind of ["xmas", "easter"] as BonusKind[]) {
    const deadline = bonusDeadline(kind, year);
    const d = daysUntil(deadline);
    if (d < 0 || d > 15) continue;
    const run = runs.find((r) => r.month === bonusRunKey(year, kind));
    out.push({
      code: `bonus_${kind}`,
      title: `${BONUS_LABEL[kind]} ${year}: πληρωμή έως ${deadline.slice(8, 10)}/${deadline.slice(5, 7)}`,
      detail: run ? `Υπολογισμένο: ακαθάριστα ${round2(run.grossTotal)} € · καθαρά ${round2(run.netTotal)} € για ${staff.length} εργαζόμενους${run.status === "posted" ? " (καταχωρημένο)" : ""}.` : `Δεν έχει υπολογιστεί ακόμη — ${staff.length} εργαζόμενοι.`,
      severity: d <= 5 ? H : M,
    });
  }

  const prev = new Date(Date.UTC(year, today.getUTCMonth() - 1, 1));
  const prevKey = prev.toISOString().slice(0, 7);
  const apdDeadline = new Date(Date.UTC(year, today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const dApd = daysUntil(apdDeadline);
  const prevRun = runs.find((r) => r.month === prevKey);
  if (dApd <= 15 && (!prevRun || prevRun.status !== "posted")) {
    out.push({
      code: "apd_due",
      title: `ΑΠΔ & ΦΜΥ ${prevKey}: υποβολή έως ${apdDeadline.slice(8, 10)}/${apdDeadline.slice(5, 7)}`,
      detail: prevRun ? `Μισθοδοσία υπολογισμένη (εισφορές ${round2(prevRun.efkaEmployee + prevRun.efkaEmployer)} €, ΦΜΥ ${round2(prevRun.taxTotal)} €) — εκκρεμεί λογιστική καταχώρηση/υποβολή.` : `Η μισθοδοσία ${prevKey} δεν έχει υπολογιστεί.`,
      severity: dApd <= 5 ? H : M,
    });
  }
  return out;
}

export async function alertCounts(db: Db, orgs: Organization[]) {
  const rows = await Promise.all(orgs.map(async (org) => ({ orgId: org.id, name: org.name, alerts: await clientAlerts(db, org) })));
  return rows.map((r) => ({ ...r, high: r.alerts.filter((a) => a.severity === "high").length, total: r.alerts.length }));
}
