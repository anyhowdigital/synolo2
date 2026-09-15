import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { expenses, invoices } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";

export interface Anomaly {
  code: string;
  title: string;
  severity: "high" | "medium" | "low";
  detail: string;
  action: string;
  href: string;
}

const MONTHS = 13;

function monthKeys(count: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= count; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out.reverse();
}

/** Διάμεσος και MAD (robust στατιστικά – δεν παρασύρονται από ακραίες τιμές). */
function medianMad(values: number[]) {
  if (!values.length) return { median: 0, mad: 0 };
  const s = [...values].sort((a, b) => a - b);
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const dev = s.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = dev.length % 2 ? dev[(dev.length - 1) / 2] : (dev[dev.length / 2 - 1] + dev[dev.length / 2]) / 2;
  return { median: med, mad };
}

/** Στατιστικός ανιχνευτής ανωμαλιών στα δεδομένα της επιχείρησης (robust z-score σε 12μηνο). */
export async function detectAnomalies(db: Db, org: Organization): Promise<Anomaly[]> {
  const keys = monthKeys(MONTHS);
  const from = `${keys[0]}-01`;
  const to = new Date().toISOString().slice(0, 10);
  const [invRows, expRows] = await Promise.all([
    db.select().from(invoices).where(and(eq(invoices.orgId, org.id), gte(invoices.issueDate, from), lte(invoices.issueDate, to))),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), gte(expenses.issueDate, from), lte(expenses.issueDate, to))),
  ]);

  const income = invRows.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return i.status !== "draft" && i.status !== "cancelled" && dt.kind === "invoice" && !dt.credit && !dt.expenseSide;
  });

  const salesByMonth = new Map<string, number>();
  const vatOutByMonth = new Map<string, number>();
  const cashByMonth = new Map<string, number>();
  for (const i of income) {
    const k = i.issueDate.slice(0, 7);
    salesByMonth.set(k, round2((salesByMonth.get(k) ?? 0) + i.totalNetValue));
    vatOutByMonth.set(k, round2((vatOutByMonth.get(k) ?? 0) + i.totalVatAmount));
    if (i.paymentMethod === 3) cashByMonth.set(k, round2((cashByMonth.get(k) ?? 0) + i.totalGrossValue));
  }
  const expByMonth = new Map<string, number>();
  for (const e of expRows.filter((e) => e.status !== "rejected")) {
    const k = e.issueDate.slice(0, 7);
    expByMonth.set(k, round2((expByMonth.get(k) ?? 0) + e.netValue));
  }

  const anomalies: Anomaly[] = [];
  const history = keys.slice(0, -1);
  const last = keys[keys.length - 1];
  const label = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("el-GR", { month: "long", year: "numeric", timeZone: "UTC" });

  // 1. Απόκλιση τζίρου από το εποχικό/ιστορικό μοτίβο
  const salesHist = history.map((k) => salesByMonth.get(k) ?? 0).filter((v) => v > 0);
  const salesLast = salesByMonth.get(last) ?? 0;
  if (salesHist.length >= 4) {
    const { median, mad } = medianMad(salesHist);
    const scale = mad || median * 0.15 || 1;
    const z = (salesLast - median) / (1.4826 * scale);
    const pct = median > 0 ? ((salesLast - median) / median) * 100 : 0;
    if (Math.abs(z) >= 2.5 && Math.abs(pct) >= 25) {
      anomalies.push({
        code: "sales_deviation",
        title: `Τζίρος ${label(last)}: ${pct > 0 ? "+" : ""}${pct.toFixed(0)}% από το σύνηθες`,
        severity: pct < 0 ? "high" : "medium",
        detail: `${salesLast.toFixed(2)} € έναντι διάμεσου 12μήνου ${median.toFixed(2)} € (robust z=${z.toFixed(1)}).`,
        action: pct < 0 ? "Έλεγξε αν λείπουν εκδόσεις ή διαβιβάσεις του μήνα πριν κλείσει η περίοδος." : "Επιβεβαίωσε ότι τα έσοδα είναι πραγματικά και σωστά χαρακτηρισμένα – ο μήνας θα ξεχωρίζει στις διασταυρώσεις.",
        href: "/reports/closing",
      });
    }
  }

  // 2. Έκρηξη εξόδων
  const expHist = history.map((k) => expByMonth.get(k) ?? 0).filter((v) => v > 0);
  const expLast = expByMonth.get(last) ?? 0;
  if (expHist.length >= 4 && expLast > 0) {
    const { median, mad } = medianMad(expHist);
    const scale = mad || median * 0.15 || 1;
    const z = (expLast - median) / (1.4826 * scale);
    if (z >= 3 && expLast > median * 1.5) {
      anomalies.push({
        code: "expense_spike",
        title: `Έξοδα ${label(last)}: +${(((expLast - median) / median) * 100).toFixed(0)}% από το σύνηθες`,
        severity: "medium",
        detail: `${expLast.toFixed(2)} € έναντι διάμεσου ${median.toFixed(2)} €.`,
        action: "Έλεγξε αν υπάρχουν διπλοεγγραφές ή δαπάνες που δεν αφορούν την επιχείρηση – είναι κλασικό σημείο ελέγχου.",
        href: "/expenses",
      });
    }
  }

  // 3. Νέος προμηθευτής με δυσανάλογα μεγάλα ποσά
  const supplierFirstSeen = new Map<string, { first: string; total: number; recent: number; name: string }>();
  for (const e of expRows) {
    const key = e.supplierAfm || e.supplierName;
    if (!key) continue;
    const cur = supplierFirstSeen.get(key) ?? { first: e.issueDate, total: 0, recent: 0, name: e.supplierName };
    cur.first = e.issueDate < cur.first ? e.issueDate : cur.first;
    cur.total = round2(cur.total + e.netValue);
    if (e.issueDate.slice(0, 7) === last) cur.recent = round2(cur.recent + e.netValue);
    supplierFirstSeen.set(key, cur);
  }
  const totalExp = round2([...supplierFirstSeen.values()].reduce((s, v) => s + v.total, 0));
  for (const [, v] of supplierFirstSeen) {
    const newSupplier = v.first >= `${last}-01`;
    if (newSupplier && totalExp > 0 && v.recent >= 3000 && v.recent / totalExp >= 0.25) {
      anomalies.push({
        code: "new_supplier_large",
        title: `Νέος προμηθευτής με μεγάλα ποσά: ${v.name}`,
        severity: "high",
        detail: `Πρώτη συναλλαγή ${v.first} και ήδη ${v.recent.toFixed(2)} € (${((v.recent / totalExp) * 100).toFixed(0)}% των αγορών).`,
        action: "Επιβεβαίωσε υπόσταση (ΑΦΜ, ΓΕΜΗ, τραπεζικό λογαριασμό) και κράτησε αποδεικτικά παράδοσης – τυπικό μοτίβο εικονικών τιμολογίων.",
        href: "/suppliers",
      });
    }
  }

  // 4. Μεταβολή στη σχέση ΦΠΑ εκροών/εισροών
  const ratioHist = history
    .map((k) => {
      const out = vatOutByMonth.get(k) ?? 0;
      const inp = expByMonth.get(k) ?? 0;
      return inp > 0 ? out / inp : null;
    })
    .filter((v): v is number => v !== null);
  const outLast = vatOutByMonth.get(last) ?? 0;
  const inpLast = expByMonth.get(last) ?? 0;
  if (ratioHist.length >= 4 && inpLast > 0) {
    const ratioLast = outLast / inpLast;
    const { median, mad } = medianMad(ratioHist);
    const scale = mad || median * 0.2 || 1;
    const z = (ratioLast - median) / (1.4826 * scale);
    if (Math.abs(z) >= 3) {
      anomalies.push({
        code: "vat_ratio_shift",
        title: "Απότομη μεταβολή στη σχέση ΦΠΑ εκροών / εισροών",
        severity: "medium",
        detail: `Δείκτης ${ratioLast.toFixed(2)} έναντι διάμεσου ${median.toFixed(2)} (z=${z.toFixed(1)}).`,
        action: "Έλεγξε χαρακτηρισμούς και εκπιπτόμενο ΦΠΑ πριν την υποβολή του Φ2 – συχνή αιτία σημειώματος συμμόρφωσης.",
        href: "/reports",
      });
    }
  }

  // 5. Απότομη αύξηση εισπράξεων σε μετρητά
  const cashHist = history.map((k) => (cashByMonth.get(k) ?? 0) / Math.max(1, salesByMonth.get(k) ?? 0));
  const cashLastRatio = (cashByMonth.get(last) ?? 0) / Math.max(1, salesLast);
  if (cashHist.length >= 4 && cashLastRatio > 0.3) {
    const { median } = medianMad(cashHist.filter((v) => v >= 0));
    if (cashLastRatio - median >= 0.25) {
      anomalies.push({
        code: "cash_ratio_jump",
        title: `Αύξηση πωλήσεων με μετρητά: ${(cashLastRatio * 100).toFixed(0)}% του μήνα`,
        severity: "high",
        detail: `Ιστορικός μέσος ${(median * 100).toFixed(0)}%. Το μοτίβο «αύξηση μετρητών» μοριοδοτείται στην ανάλυση κινδύνου της ΑΑΔΕ.`,
        action: "Επιβεβαίωσε ότι δεν υπάρχουν συναλλαγές ≥ 500 € σε μετρητά και ότι οι εισπράξεις καταχωρούνται στο ταμείο.",
        href: "/risks",
      });
    }
  }

  return anomalies.sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity]);
}
