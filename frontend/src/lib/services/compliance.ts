import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { invoiceLines, invoices } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { getWithholdingTax } from "@/lib/greek/classifications";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Συγκεντρωτικά παρακρατούμενων φόρων & χαρτοσήμου ανά αντισυμβαλλόμενο (βεβαιώσεις). */
export async function withholdingCertificates(db: Db, orgId: string, year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const invRows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), gte(invoices.issueDate, from), lte(invoices.issueDate, to), inArray(invoices.status, ["issued", "partially_paid", "paid"])));
  const income = invRows.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && !dt.expenseSide;
  });
  if (income.length === 0) return { rows: [], totals: { net: 0, withheld: 0, stampDuty: 0 } };

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(
      inArray(
        invoiceLines.invoiceId,
        income.map((i) => i.id),
      ),
    );
  const byInvoice = new Map(income.map((i) => [i.id, i]));

  const map = new Map<string, { key: string; customerName: string; afm: string; withholdingLabel: string; net: number; withheld: number; stampDuty: number; invoices: Set<string> }>();
  for (const line of lines) {
    const inv = byInvoice.get(line.invoiceId);
    if (!inv) continue;
    const credit = getDocumentType(inv.invoiceType).credit ? -1 : 1;
    if (line.withheldAmount <= 0 && line.stampDutyAmount <= 0) continue;
    const wh = getWithholdingTax(line.withholdingCategory || 0);
    const key = `${inv.customerId ?? "retail"}-${line.withholdingCategory || 0}`;
    const next = map.get(key) ?? { key, customerName: inv.customerName || "Λιανική", afm: inv.customerAfm ?? "", withholdingLabel: wh.label, net: 0, withheld: 0, stampDuty: 0, invoices: new Set<string>() };
    next.net = round2(next.net + credit * line.netValue);
    next.withheld = round2(next.withheld + credit * line.withheldAmount);
    next.stampDuty = round2(next.stampDuty + credit * line.stampDutyAmount);
    next.invoices.add(inv.id);
    map.set(key, next);
  }

  const rows = Array.from(map.values())
    .map((r) => ({ ...r, invoiceCount: r.invoices.size }))
    .sort((a, b) => b.withheld - a.withheld);
  const totals = {
    net: round2(rows.reduce((s, r) => s + r.net, 0)),
    withheld: round2(rows.reduce((s, r) => s + r.withheld, 0)),
    stampDuty: round2(rows.reduce((s, r) => s + r.stampDuty, 0)),
  };
  return { rows, totals };
}

export interface TaxDeadline {
  code: string;
  title: string;
  date: string;
  days: number;
  note: string;
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

/** Ημερολόγιο φορολογικών/ασφαλιστικών προθεσμιών για τους επόμενους 12 μήνες. */
export function taxDeadlines(org: Organization, reference = new Date()) {
  const today = reference.toISOString().slice(0, 10);
  const items: TaxDeadline[] = [];
  const quarterly = true; // Προεπιλογή: τριμηνιαία υποβολή Φ2 (απλογραφικά βιβλία)

  for (let k = 0; k < 13; k++) {
    const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + k, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const end = lastDayOfMonth(y, m);

    // ΦΠΑ (Φ2): μηνιαία ή τριμηνιαία υποβολή έως το τέλος του επόμενου μήνα.
    if (!quarterly || [0, 3, 6, 9].includes(m)) {
      const periodLabel = quarterly ? `${Math.floor(((m + 11) % 12) / 3) + 1}ο τρίμηνο` : "προηγούμενος μήνας";
      items.push({ code: "Φ2", title: "Δήλωση ΦΠΑ (έντυπο Φ2)", date: end, days: 0, note: `Υποβολή και καταβολή ΦΠΑ για ${periodLabel}.` });
    }
    // ΦΜΥ: απόδοση παρακρατούμενου φόρου μισθωτών υπηρεσιών έως το τέλος του δεύτερου μήνα.
    items.push({ code: "ΦΜΥ", title: "Απόδοση ΦΜΥ & παρακρατούμενων φόρων", date: end, days: 0, note: "Απόδοση φόρου μισθωτών υπηρεσιών και λοιπών παρακρατήσεων του προ-προηγούμενου μήνα." });
    // ΑΠΔ / ασφαλιστικές εισφορές ΕΦΚΑ.
    items.push({ code: "ΑΠΔ", title: "ΑΠΔ & εισφορές ΕΦΚΑ", date: end, days: 0, note: "Υποβολή Αναλυτικής Περιοδικής Δήλωσης και καταβολή εισφορών προηγούμενου μήνα." });
    // Ε3/Ε1: ετήσιες δηλώσεις.
    if (m === 5) items.push({ code: "Ε3/Ε1", title: "Δήλωση φορολογίας εισοδήματος (Ε1/Ε3)", date: `${y}-06-30`, days: 0, note: "Υποβολή δήλωσης εισοδήματος και εντύπου Ε3 για την προηγούμενη χρήση." });
    if (m === 1) items.push({ code: "ΜΥΦ", title: "Συγκεντρωτικές καταστάσεις / κλείσιμο myDATA", date: lastDayOfMonth(y, 1), days: 0, note: "Οριστικοποίηση διαβιβάσεων myDATA για την προηγούμενη χρήση." });
  }

  const withDays = items
    .filter((i) => i.date >= today)
    .map((i) => ({ ...i, days: Math.round((new Date(`${i.date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
    .slice(0, 12);

  return { from: today, items: withDays };
}
