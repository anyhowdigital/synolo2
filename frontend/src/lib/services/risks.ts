import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { bankTransactions, cashAccounts, cashEntries, customers, expensePayments, expenses, invoiceLines, invoices, payments, products, riskSnapshots, series } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { getWithholdingTax } from "@/lib/greek/classifications";
import { precheckMyData } from "@/lib/mydata/rules";
import { taxDeadlines } from "@/lib/services/compliance";
import { quarterPeriod, vatReport } from "@/lib/services/reports";
import { round2 } from "@/lib/invoice/totals";
import { randomUUID } from "node:crypto";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface RiskFinding {
  code: string;
  title: string;
  severity: RiskSeverity;
  /** Πόσες εγγραφές αφορά. */
  count: number;
  /** Χρηματικό μέγεθος έκθεσης (προαιρετικό). */
  amount?: number;
  /** Γιατί είναι κίνδυνος – νομική βάση. */
  why: string;
  legal: string;
  href: string;
  hrefLabel: string;
  /** Παραδείγματα εγγραφών (έως 5). */
  samples: string[];
  group: "mydata" | "numbering" | "vat" | "counterparty" | "withholding" | "vatReturn" | "cash" | "behavior";
}

export interface RiskReport {
  score: number;
  level: "green" | "amber" | "red";
  findings: RiskFinding[];
  counts: Record<RiskSeverity, number>;
  checkedAt: string;
  /** Σύνολο ελέγχων που εκτελέστηκαν. */
  checksRun: number;
}

export const RISK_GROUP_LABELS: Record<RiskFinding["group"], string> = {
  mydata: "Διαβίβαση myDATA",
  numbering: "Αρίθμηση & διπλοεγγραφές",
  vat: "ΦΠΑ & απαλλαγές",
  counterparty: "Στοιχεία αντισυμβαλλομένων",
  withholding: "Παρακρατήσεις & χαρτόσημο",
  vatReturn: "Φ2 / ΦΠΑ & προθεσμίες",
  cash: "Ταμείο & απαιτήσεις",
  behavior: "Μοτίβα συμπεριφοράς (profiling ΑΑΔΕ)",
};

const SEVERITY_WEIGHT: Record<RiskSeverity, number> = { critical: 26, high: 15, medium: 8, low: 3 };
const TOTAL_CHECKS = 25;

const daysBetween = (a: string, b: string) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const today = () => new Date().toISOString().slice(0, 10);
const label = (i: { seriesCode: string; number: number }) => `${i.seriesCode} ${String(i.number).padStart(4, "0")}`;

/** Κεντρικό radar συμμόρφωσης: ελέγχει myDATA, αρίθμηση, ΦΠΑ, αντισυμβαλλόμενους, παρακρατήσεις, Φ2 και ταμείο. */
export async function riskReport(db: Db, org: Organization): Promise<RiskReport> {
  const findings: RiskFinding[] = [];
  const now = today();

  const [invRows, seriesRows, custRows, expRows, accounts, entries, pays, exPays, txs, productRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.orgId, org.id)),
    db.select().from(series).where(eq(series.orgId, org.id)),
    db.select().from(customers).where(eq(customers.orgId, org.id)),
    db.select().from(expenses).where(and(eq(expenses.orgId, org.id), ne(expenses.status, "rejected"))),
    db.select().from(cashAccounts).where(eq(cashAccounts.orgId, org.id)),
    db.select().from(cashEntries).where(eq(cashEntries.orgId, org.id)),
    db.select().from(payments).where(eq(payments.orgId, org.id)),
    db.select().from(expensePayments).where(eq(expensePayments.orgId, org.id)),
    db.select().from(bankTransactions).where(and(eq(bankTransactions.orgId, org.id), eq(bankTransactions.status, "unmatched"))),
    db.select({ id: products.id, name: products.name, costPrice: products.costPrice, avgCost: products.avgCost }).from(products).where(eq(products.orgId, org.id)),
  ]);

  const fiscal = invRows.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return dt.kind === "invoice" && i.status !== "cancelled";
  });
  const transmittable = fiscal.filter((i) => i.status !== "draft");
  const lines = transmittable.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, transmittable.map((i) => i.id))) : [];
  const linesByInvoice = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = linesByInvoice.get(l.invoiceId) ?? [];
    arr.push(l);
    linesByInvoice.set(l.invoiceId, arr);
  }

  /* 1. Μη διαβιβασμένα στο myDATA */
  const notSent = transmittable.filter((i) => !i.mydataMark && i.mydataStatus !== "sent");
  if (notSent.length) {
    findings.push({
      code: "mydata_not_sent",
      title: "Εκδοθέντα παραστατικά χωρίς διαβίβαση στο myDATA",
      severity: "critical",
      count: notSent.length,
      amount: round2(notSent.reduce((s, i) => s + i.totalGrossValue, 0)),
      why: "Κάθε εκδοθέν παραστατικό πρέπει να διαβιβαστεί στην ΑΑΔΕ. Χωρίς MARK το παραστατικό δεν αναγνωρίζεται φορολογικά και ο λήπτης δεν μπορεί να εκπέσει τη δαπάνη.",
      legal: "Α.1138/2020, άρθρο 5 – προθεσμίες διαβίβασης",
      href: "/invoices?mydata=pending",
      hrefLabel: "Διαβίβαση τώρα",
      samples: notSent.slice(0, 5).map((i) => `${label(i)} · ${i.customerName || "Λιανική"} · ${i.issueDate}`),
      group: "mydata",
    });
  }

  /* 2. Σφάλματα διαβίβασης */
  const mydataErrors = transmittable.filter((i) => i.mydataStatus === "error");
  if (mydataErrors.length) {
    findings.push({
      code: "mydata_error",
      title: "Απορρίψεις/σφάλματα από την ΑΑΔΕ",
      severity: "critical",
      count: mydataErrors.length,
      why: "Η ΑΑΔΕ απέρριψε τη διαβίβαση. Το παραστατικό θεωρείται μη διαβιβασμένο μέχρι να διορθωθεί το σφάλμα και να επαναληφθεί η αποστολή.",
      legal: "Α.1138/2020 · κανόνες επικύρωσης myDATA (σφάλματα 2xx/3xx)",
      href: "/invoices?mydata=error",
      hrefLabel: "Δες τα σφάλματα",
      samples: mydataErrors.slice(0, 5).map((i) => `${label(i)} · ${(i.mydataError || "").slice(0, 120)}`),
      group: "mydata",
    });
  }

  /* 3. Εκπρόθεσμη διαβίβαση */
  const late = transmittable.filter((i) => i.mydataSentAt && daysBetween(i.issueDate, i.mydataSentAt.slice(0, 10)) > 2);
  if (late.length) {
    findings.push({
      code: "mydata_late",
      title: "Εκπρόθεσμες διαβιβάσεις (πάνω από 2 ημέρες από την έκδοση)",
      severity: "medium",
      count: late.length,
      why: "Η καθυστερημένη διαβίβαση δημιουργεί ευρήματα σε έλεγχο και πρόστιμα ανά παραστατικό. Αν επαναλαμβάνεται, ρυθμίστε αυτόματη διαβίβαση κατά την έκδοση.",
      legal: "Α.1138/2020 · άρθρο 54Ζ ΚΦΔ (πρόστιμα μη/εκπρόθεσμης διαβίβασης)",
      href: "/mydata",
      hrefLabel: "Ρυθμίσεις myDATA",
      samples: late.slice(0, 5).map((i) => `${label(i)} · έκδοση ${i.issueDate} → διαβίβαση ${i.mydataSentAt!.slice(0, 10)}`),
      group: "mydata",
    });
  }

  /* 4. Πρόχειρα παραστατικά με παλιά ημερομηνία */
  const staleDrafts = fiscal.filter((i) => i.status === "draft" && daysBetween(i.issueDate, now) > 7);
  if (staleDrafts.length) {
    findings.push({
      code: "stale_drafts",
      title: "Πρόχειρα παραστατικά με ημερομηνία άνω των 7 ημερών",
      severity: "medium",
      count: staleDrafts.length,
      amount: round2(staleDrafts.reduce((s, i) => s + i.totalGrossValue, 0)),
      why: "Αν η συναλλαγή έγινε, το παραστατικό πρέπει να εκδοθεί εμπρόθεσμα. Πρόχειρα με παλιά ημερομηνία σημαίνουν είτε ξεχασμένη έκδοση είτε λανθασμένη ημερομηνία.",
      legal: "ν. 4308/2014 (ΕΛΠ), άρθρο 11 – χρόνος έκδοσης",
      href: "/invoices?status=draft",
      hrefLabel: "Δες τα πρόχειρα",
      samples: staleDrafts.slice(0, 5).map((i) => `${label(i)} · ${i.issueDate} · ${i.customerName || "—"}`),
      group: "mydata",
    });
  }

  /* 5. Κενά αρίθμησης */
  const gaps: string[] = [];
  const dupes: string[] = [];
  for (const s of seriesRows) {
    const byYear = new Map<string, number[]>();
    for (const i of invRows.filter((x) => x.seriesId === s.id && x.status !== "draft")) {
      const y = i.issueDate.slice(0, 4);
      const arr = byYear.get(y) ?? [];
      arr.push(i.number);
      byYear.set(y, arr);
    }
    for (const [year, numbers] of byYear) {
      const sorted = [...numbers].sort((a, b) => a - b);
      const seen = new Set<number>();
      for (const n of sorted) {
        if (seen.has(n)) dupes.push(`${s.code} ${n} (${year})`);
        seen.add(n);
      }
      for (let n = sorted[0]!; n < sorted[sorted.length - 1]!; n++) {
        if (!seen.has(n)) gaps.push(`${s.code} ${n} (${year})`);
      }
    }
  }
  if (gaps.length) {
    findings.push({
      code: "numbering_gaps",
      title: "Κενά στην αρίθμηση σειρών",
      severity: "high",
      count: gaps.length,
      why: "Η αρίθμηση κάθε σειράς πρέπει να είναι συνεχής και αδιάσπαστη ανά έτος. Τα κενά είναι το πρώτο πράγμα που εντοπίζει ο έλεγχος και θεωρούνται ένδειξη μη έκδοσης ή απόκρυψης παραστατικών.",
      legal: "ν. 4308/2014, άρθρο 9 – μοναδική & συνεχής αρίθμηση",
      href: "/invoices",
      hrefLabel: "Έλεγχος παραστατικών",
      samples: gaps.slice(0, 5),
      group: "numbering",
    });
  }
  if (dupes.length) {
    findings.push({
      code: "numbering_duplicates",
      title: "Διπλοί αριθμοί παραστατικών στην ίδια σειρά",
      severity: "critical",
      count: dupes.length,
      why: "Δύο παραστατικά με τον ίδιο αριθμό στην ίδια σειρά και έτος οδηγούν σε απόρριψη διαβίβασης και σε αμφισβήτηση των βιβλίων.",
      legal: "ν. 4308/2014, άρθρο 9",
      href: "/invoices",
      hrefLabel: "Έλεγχος παραστατικών",
      samples: dupes.slice(0, 5),
      group: "numbering",
    });
  }

  /* 6. Λάθη ΦΠΑ / απαλλαγών / χαρακτηρισμών (κανόνες myDATA) */
  const ruleIssues: string[] = [];
  for (const inv of transmittable) {
    const invLines = linesByInvoice.get(inv.id) ?? [];
    if (!invLines.length) continue;
    const errors = precheckMyData({ invoice: inv, lines: invLines, correlatedType: null });
    for (const e of errors) ruleIssues.push(`${label(inv)}: ${e}`);
  }
  if (ruleIssues.length) {
    findings.push({
      code: "vat_rule_violations",
      title: "Παραβιάσεις κανόνων ΦΠΑ / χαρακτηρισμού σε εκδοθέντα παραστατικά",
      severity: "high",
      count: ruleIssues.length,
      why: "Λάθος συνδυασμός τύπου παραστατικού, ΦΠΑ, αιτίας απαλλαγής ή χαρακτηρισμού Ε3 οδηγεί σε απόρριψη από την ΑΑΔΕ και σε λάθος Φ2.",
      legal: "Κανόνες επικύρωσης myDATA 215/216/218/308 · Κώδικας ΦΠΑ",
      href: "/invoices",
      hrefLabel: "Διόρθωση παραστατικών",
      samples: ruleIssues.slice(0, 5),
      group: "vat",
    });
  }

  /* 7. Ενδοκοινοτικά χωρίς αιτία απαλλαγής (ειδικός έλεγχος) */
  const intraNoReason: string[] = [];
  for (const inv of transmittable) {
    const dt = getDocumentType(inv.invoiceType);
    if (!["1.2", "2.2", "1.3", "2.3"].includes(dt.code)) continue;
    for (const l of linesByInvoice.get(inv.id) ?? []) {
      if (l.vatCategory === 7 && !l.vatExemptionCategory) intraNoReason.push(`${label(inv)} γραμμή ${l.lineNumber}`);
      if (l.vatCategory !== 7 && l.vatCategory !== 8) intraNoReason.push(`${label(inv)} γραμμή ${l.lineNumber}: χρεώθηκε ΦΠΑ σε συναλλαγή εξωτερικού`);
    }
  }
  if (intraNoReason.length) {
    findings.push({
      code: "intra_eu_exemption",
      title: "Συναλλαγές εξωτερικού χωρίς σωστή απαλλαγή ΦΠΑ",
      severity: "high",
      count: intraNoReason.length,
      why: "Στις ενδοκοινοτικές παραδόσεις (άρθρο 28) και στις εξαγωγές (άρθρο 24) το παραστατικό εκδίδεται χωρίς ΦΠΑ με ρητή αναφορά της απαλλαγής. Λάθος χειρισμός σημαίνει καταβολή ΦΠΑ που δεν εισπράχθηκε.",
      legal: "Κώδικας ΦΠΑ άρθρα 24, 28 · άρθρο 14 για υπηρεσίες",
      href: "/invoices",
      hrefLabel: "Δες τα παραστατικά",
      samples: intraNoReason.slice(0, 5),
      group: "vat",
    });
  }

  /* 8. Ελλιπή στοιχεία πελατών */
  const usedCustomerIds = new Set(transmittable.map((i) => i.customerId).filter(Boolean) as string[]);
  const badCustomers = custRows.filter((c) => usedCustomerIds.has(c.id) && c.stage !== "lead" && (!c.afm || (c.country === "GR" && !c.doy)));
  if (badCustomers.length) {
    findings.push({
      code: "customer_missing_data",
      title: "Πελάτες με τιμολόγηση και ελλιπή φορολογικά στοιχεία",
      severity: "medium",
      count: badCustomers.length,
      why: "Χωρίς ΑΦΜ/ΔΟΥ ή με λάθος χώρα, η διαβίβαση απορρίπτεται και το παραστατικό δεν είναι νόμιμο για τον λήπτη. Για πελάτες ΕΕ απαιτείται έγκυρο VAT (VIES).",
      legal: "ν. 4308/2014, άρθρο 9 · Κανόνες myDATA 242-244",
      href: "/customers",
      hrefLabel: "Συμπλήρωση στοιχείων",
      samples: badCustomers.slice(0, 5).map((c) => `${c.name}${c.afm ? ` · ΑΦΜ ${c.afm}` : " · χωρίς ΑΦΜ"}${c.country !== "GR" ? ` · ${c.country}` : ""}`),
      group: "counterparty",
    });
  }

  /* 9. Πελάτες ΕΕ σε εγχώριο τύπο (λάθος τύπος) */
  const wrongCountry = transmittable.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    const c = (i.customerCountry || "GR").toUpperCase();
    return !dt.retail && c !== "GR" && ["1.1", "2.1"].includes(dt.code);
  });
  if (wrongCountry.length) {
    findings.push({
      code: "wrong_type_for_country",
      title: "Πελάτες εξωτερικού τιμολογημένοι με εγχώριο τύπο (1.1/2.1)",
      severity: "high",
      count: wrongCountry.length,
      why: "Για πελάτη ΕΕ απαιτείται τύπος 1.2/2.2 και για τρίτη χώρα 1.3/2.3. Ο λάθος τύπος στέλνει τη συναλλαγή σε λάθος κωδικό Φ2 και ΦΠΑ.",
      legal: "Τύποι παραστατικών myDATA · Κώδικας ΦΠΑ άρθρα 14, 24, 28",
      href: "/invoices",
      hrefLabel: "Δες τα παραστατικά",
      samples: wrongCountry.slice(0, 5).map((i) => `${label(i)} · ${i.customerName} · χώρα ${i.customerCountry}`),
      group: "counterparty",
    });
  }

  /* 10. Παρακρατήσεις/χαρτόσημο με λάθος ποσό */
  const whIssues: string[] = [];
  for (const inv of transmittable) {
    for (const l of linesByInvoice.get(inv.id) ?? []) {
      if (l.withholdingCategory > 0) {
        const wh = getWithholdingTax(l.withholdingCategory);
        const expected = wh.rate ? round2((l.netValue * Math.abs(wh.rate)) / 100) : null;
        if (expected !== null && Math.abs(Math.abs(l.withheldAmount) - expected) > 0.02) {
          whIssues.push(`${label(inv)} γραμμή ${l.lineNumber}: παρακράτηση ${l.withheldAmount.toFixed(2)} € αντί ${expected.toFixed(2)} € (${wh.label})`);
        }
      }
      if (l.stampDutyCategory > 0 && l.stampDutyAmount === 0) {
        whIssues.push(`${label(inv)} γραμμή ${l.lineNumber}: δηλώθηκε χαρτόσημο χωρίς ποσό`);
      }
    }
  }
  if (whIssues.length) {
    findings.push({
      code: "withholding_mismatch",
      title: "Παρακρατούμενοι φόροι ή χαρτόσημο με λάθος ποσό",
      severity: "high",
      count: whIssues.length,
      why: "Η παρακράτηση αποδίδεται στο Δημόσιο και εκδίδεται βεβαίωση στον αντισυμβαλλόμενο. Λάθος ποσό σημαίνει λάθος απόδοση φόρου και λάθος βεβαιώσεις.",
      legal: "ν. 4172/2013, άρθρα 62-64 (παρακράτηση 20%/3%) · ΚΝΤΧ για χαρτόσημο",
      href: "/reports/withholding",
      hrefLabel: "Βεβαιώσεις παρακρατήσεων",
      samples: whIssues.slice(0, 5),
      group: "withholding",
    });
  }

  /* 11. Έξοδα χωρίς χαρακτηρισμό (επηρεάζουν Φ2/Ε3) */
  const unclassified = expRows.filter((e) => !e.classificationCategory || !e.classificationType);
  if (unclassified.length) {
    findings.push({
      code: "expenses_unclassified",
      title: "Έξοδα χωρίς χαρακτηρισμό εξόδου (Ε3)",
      severity: "medium",
      count: unclassified.length,
      amount: round2(unclassified.reduce((s, e) => s + e.grossValue, 0)),
      why: "Μη χαρακτηρισμένα έξοδα δεν συμφωνούν με τα βιβλία της ΑΑΔΕ, δεν εκπίπτουν σωστά και αφήνουν το ΦΠΑ εισροών εκτός Φ2.",
      legal: "Α.1138/2020 – χαρακτηρισμοί εξόδων · Ε3 ν. 4172/2013",
      href: "/expenses",
      hrefLabel: "Χαρακτηρισμός εξόδων",
      samples: unclassified.slice(0, 5).map((e) => `${e.supplierName || "—"} · ${e.issueDate} · ${e.grossValue.toFixed(2)} €`),
      group: "vatReturn",
    });
  }

  /* 12. Φ2: θέση ΦΠΑ τριμήνου vs διαθέσιμο ταμείο */
  const period = quarterPeriod();
  const vat = await vatReport(db, org.id, period);
  const inputVat = round2(expRows.filter((e) => e.issueDate >= period.from && e.issueDate <= period.to && e.vatDeductible).reduce((s, e) => s + e.vatAmount, 0));
  const vatPosition = round2(vat.totalVat - inputVat);
  const opening = accounts.reduce((s, a) => s + a.openingBalance, 0);
  const inflow = pays.reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const outflow = exPays.reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
  const cash = round2(opening + inflow - outflow);
  if (vatPosition > 0 && cash < vatPosition) {
    findings.push({
      code: "vat_cash_shortfall",
      title: "Το ΦΠΑ του τριμήνου υπερβαίνει τα διαθέσιμα του ταμείου",
      severity: "high",
      count: 1,
      amount: vatPosition,
      why: `Οφειλόμενο ΦΠΑ ${vatPosition.toFixed(2)} € έναντι διαθεσίμων ${cash.toFixed(2)} €. Χωρίς εισπράξεις μέχρι την προθεσμία, η δήλωση υποβάλλεται χωρίς πληρωμή και τρέχουν τόκοι/προσαυξήσεις.`,
      legal: "Κώδικας ΦΠΑ άρθρο 38 · άρθρο 53 ΚΦΔ (τόκοι εκπρόθεσμης καταβολής)",
      href: "/reports",
      hrefLabel: "Θέση ΦΠΑ & Φ2",
      samples: [`ΦΠΑ εκροών ${vat.totalVat.toFixed(2)} €`, `ΦΠΑ εισροών ${inputVat.toFixed(2)} €`, `Ταμείο ${cash.toFixed(2)} €`],
      group: "vatReturn",
    });
  }

  /* 13. Προθεσμίες που λήγουν */
  const upcoming = taxDeadlines(org).items.filter((d) => d.days <= 7);
  if (upcoming.length) {
    findings.push({
      code: "deadlines_due",
      title: "Φορολογικές προθεσμίες που λήγουν εντός 7 ημερών",
      severity: upcoming.some((d) => d.days <= 1) ? "high" : "medium",
      count: upcoming.length,
      why: "Η εκπρόθεσμη υποβολή επιφέρει αυτοτελές πρόστιμο και τόκους, ανεξάρτητα από το αν υπάρχει ποσό προς καταβολή.",
      legal: "άρθρα 54 & 53 ΚΦΔ (ν. 4987/2022)",
      href: "/deadlines",
      hrefLabel: "Ημερολόγιο προθεσμιών",
      samples: upcoming.slice(0, 5).map((d) => `${d.code} · ${d.title} · ${d.date} (${d.days === 0 ? "σήμερα" : `σε ${d.days} ημ.`})`),
      group: "vatReturn",
    });
  }

  /* 14. Ταμείο & απαιτήσεις */
  const negativeAccounts: string[] = [];
  for (const a of accounts) {
    const accIn = pays.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.accountId === a.id && e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const accOut = exPays.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.amount, 0) + entries.filter((e) => e.accountId === a.id && e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
    const bal = round2(a.openingBalance + accIn - accOut);
    if (a.kind === "cash" && bal < 0) negativeAccounts.push(`${a.name}: ${bal.toFixed(2)} €`);
  }
  if (negativeAccounts.length) {
    findings.push({
      code: "negative_cash",
      title: "Αρνητικό υπόλοιπο σε ταμείο μετρητών",
      severity: "critical",
      count: negativeAccounts.length,
      why: "Το ταμείο μετρητών δεν μπορεί να είναι αρνητικό: σημαίνει μη καταχωρημένες εισπράξεις ή πληρωμές που δεν έγιναν από αυτό το ταμείο. Είναι κλασικό εύρημα ελέγχου («ταμειακό έλλειμμα»).",
      legal: "ν. 4308/2014, άρθρο 5 – αξιοπιστία λογιστικού συστήματος",
      href: "/banking",
      hrefLabel: "Ταμείο & Τράπεζες",
      samples: negativeAccounts.slice(0, 5),
      group: "cash",
    });
  }

  const old = transmittable.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    if (dt.credit || dt.expenseSide) return false;
    const remaining = round2(i.totalGrossValue - i.paidAmount);
    if (remaining <= 0.005) return false;
    return daysBetween(i.dueDate ?? i.issueDate, now) > 90;
  });
  if (old.length) {
    findings.push({
      code: "receivables_over_90",
      title: "Απαιτήσεις άνω των 90 ημερών",
      severity: "medium",
      count: old.length,
      amount: round2(old.reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0)),
      why: "Πληρώσατε ΦΠΑ και φόρο για έσοδα που δεν εισπράξατε. Απαιτείται τεκμηριωμένη διεκδίκηση πριν από οποιαδήποτε διαγραφή επισφάλειας.",
      legal: "ν. 4172/2013, άρθρο 26 – επισφαλείς απαιτήσεις",
      href: "/invoices?status=overdue",
      hrefLabel: "Ληξιπρόθεσμα",
      samples: old.slice(0, 5).map((i) => `${label(i)} · ${i.customerName || "—"} · ${round2(i.totalGrossValue - i.paidAmount).toFixed(2)} €`),
      group: "cash",
    });
  }

  if (txs.length) {
    findings.push({
      code: "bank_unmatched",
      title: "Κινήσεις τράπεζας χωρίς συμφωνία",
      severity: "low",
      count: txs.length,
      amount: round2(txs.reduce((s, t) => s + Math.abs(t.amount), 0)),
      why: "Ασυμφώνητες κινήσεις σημαίνουν εισπράξεις ή δαπάνες που δεν έχουν περαστεί στα βιβλία – η τράπεζα δεν συμφωνεί με το ταμείο.",
      legal: "ν. 4308/2014, άρθρο 5",
      href: "/banking",
      hrefLabel: "Συμφωνία κινήσεων",
      samples: txs.slice(0, 5).map((t) => `${t.bookedAt} · ${t.amount.toFixed(2)} € · ${(t.description || t.counterparty).slice(0, 60)}`),
      group: "cash",
    });
  }

  /* ---------- Μοτίβα συμπεριφοράς: τι «μοριοδοτεί» ο αλγόριθμος της ΑΑΔΕ (Elenxis / AI risk analysis) ---------- */
  const last12 = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const recent = transmittable.filter((i) => i.issueDate >= last12);
  const income = recent.filter((i) => {
    const dt = getDocumentType(i.invoiceType);
    return !dt.credit && !dt.expenseSide;
  });
  const creditNotes = recent.filter((i) => getDocumentType(i.invoiceType).credit);
  const incomeTotal = round2(income.reduce((s, i) => s + i.totalNetValue, 0));
  const creditTotal = round2(creditNotes.reduce((s, i) => s + Math.abs(i.totalNetValue), 0));

  /* 15. Υψηλό ποσοστό πιστωτικών */
  if (income.length >= 5 && creditTotal > 0) {
    const ratio = incomeTotal > 0 ? (creditTotal / incomeTotal) * 100 : 0;
    const countRatio = (creditNotes.length / income.length) * 100;
    if (ratio >= 5 || countRatio >= 10) {
      findings.push({
        code: "credit_notes_pattern",
        title: `Συχνά/δυσανάλογα πιστωτικά: ${ratio.toFixed(1)}% του τζίρου`,
        severity: ratio >= 15 || countRatio >= 25 ? "high" : "medium",
        count: creditNotes.length,
        amount: creditTotal,
        why: `${creditNotes.length} πιστωτικά αξίας ${creditTotal.toFixed(2)} € σε τζίρο ${incomeTotal.toFixed(2)} € (${countRatio.toFixed(1)}% των παραστατικών). Ο αλγόριθμος της ΑΑΔΕ θεωρεί ύποπτη συμπεριφορά τις συχνές ή δυσανάλογου ύψους εκδόσεις πιστωτικών, γιατί είναι ο κλασικός τρόπος «σβησίματος» εσόδων μετά τη διαβίβαση. Κρατήστε τεκμηρίωση (επιστροφή, έκπτωση, λάθος τιμολόγησης) για κάθε πιστωτικό.`,
        legal: "Στρατηγική ελέγχων ΑΑΔΕ 2026 (Elenxis/risk analysis) · Α.1138/2020 · τύποι 5.1/5.2/11.4",
        href: "/invoices",
        hrefLabel: "Δες τα πιστωτικά",
        samples: creditNotes.slice(0, 5).map((i) => `${label(i)} · ${i.customerName || "—"} · ${Math.abs(i.totalNetValue).toFixed(2)} € · ${i.issueDate}`),
        group: "behavior",
      });
    }
  }

  /* 16. Πιστωτικά χωρίς συσχέτιση αρχικού */
  const uncorrelatedCredits = creditNotes.filter((i) => !i.correlatedInvoiceId);
  if (uncorrelatedCredits.length) {
    findings.push({
      code: "credit_without_correlation",
      title: "Πιστωτικά χωρίς συσχέτιση με αρχικό παραστατικό",
      severity: "high",
      count: uncorrelatedCredits.length,
      amount: round2(uncorrelatedCredits.reduce((s, i) => s + Math.abs(i.totalNetValue), 0)),
      why: "Το μη συσχετιζόμενο πιστωτικό (5.2) ελέγχεται πρώτο: χωρίς αναφορά στο αρχικό παραστατικό δεν αποδεικνύεται σε τι αφορά η μείωση εσόδου και η δαπάνη/έσοδο αμφισβητείται.",
      legal: "Κανόνες myDATA – correlatedInvoices · ν. 4308/2014 άρθρο 9",
      href: "/invoices",
      hrefLabel: "Δες τα πιστωτικά",
      samples: uncorrelatedCredits.slice(0, 5).map((i) => `${label(i)} · ${i.customerName || "—"} · ${i.issueDate}`),
      group: "behavior",
    });
  }

  /* 17. Ακυρώσεις παραστατικών */
  const cancelled = invRows.filter((i) => i.status === "cancelled" || i.mydataCancellationMark);
  if (cancelled.length >= 3 || (cancelled.length && income.length && cancelled.length / income.length > 0.05)) {
    findings.push({
      code: "cancellations_pattern",
      title: `Επαναλαμβανόμενες ακυρώσεις παραστατικών (${cancelled.length})`,
      severity: cancelled.length >= 10 ? "high" : "medium",
      count: cancelled.length,
      why: "Οι συχνές ακυρώσεις αποδείξεων/τιμολογίων είναι από τις πρώτες ενδείξεις που μοριοδοτεί ο μηχανισμός ανάλυσης κινδύνου, καθώς χρησιμοποιούνται για απόκρυψη εσόδων. Κάθε ακύρωση πρέπει να τεκμηριώνεται και να μην συνοδεύεται από είσπραξη.",
      legal: "Στρατηγική ελέγχων ΑΑΔΕ 2026 · Α.1138/2020 (ακυρωτικά/cancellation MARK)",
      href: "/invoices",
      hrefLabel: "Δες τις ακυρώσεις",
      samples: cancelled.slice(0, 5).map((i) => `${label(i)} · ${i.issueDate} · ${i.customerName || "Λιανική"}`),
      group: "behavior",
    });
  }

  /* 18. Μετρητά ≥ 500 € (απαγόρευση) */
  const cashOverLimit = recent.filter((i) => i.paymentMethod === 3 && i.totalGrossValue >= 500 && !getDocumentType(i.invoiceType).credit);
  if (cashOverLimit.length) {
    findings.push({
      code: "cash_over_500",
      title: "Συναλλαγές ≥ 500 € εξοφλημένες με μετρητά",
      severity: "critical",
      count: cashOverLimit.length,
      amount: round2(cashOverLimit.reduce((s, i) => s + i.totalGrossValue, 0)),
      why: "Συναλλαγές 500 € και άνω προς ιδιώτες εξοφλούνται αποκλειστικά με ηλεκτρονικά μέσα (κάρτα, έμβασμα, IRIS, e-wallet). Το πρόστιμο είναι το διπλάσιο (200%) της αξίας που εισπράχθηκε σε μετρητά και εντοπίζεται από τη διασταύρωση myDATA–POS.",
      legal: "ν. 5104/2024 άρθρο 57 §10 (όπως ισχύει) · υποχρεωτικά ηλεκτρονικά μέσα πληρωμής",
      href: "/invoices",
      hrefLabel: "Δες τα παραστατικά",
      samples: cashOverLimit.slice(0, 5).map((i) => `${label(i)} · ${i.totalGrossValue.toFixed(2)} € · ${i.issueDate}`),
      group: "behavior",
    });
  }

  /* 19. Κατάτμηση συναλλαγής για αποφυγή του ορίου 500 € */
  const splitKeys = new Map<string, { total: number; docs: string[] }>();
  for (const i of recent) {
    if (i.paymentMethod !== 3 || getDocumentType(i.invoiceType).credit) continue;
    const key = `${i.customerId ?? i.customerName ?? "retail"}|${i.issueDate}`;
    const e = splitKeys.get(key) ?? { total: 0, docs: [] };
    e.total = round2(e.total + i.totalGrossValue);
    e.docs.push(label(i));
    splitKeys.set(key, e);
  }
  const splits = [...splitKeys.entries()].filter(([, v]) => v.docs.length > 1 && v.total >= 500);
  if (splits.length) {
    findings.push({
      code: "cash_split_transactions",
      title: "Πιθανή κατάτμηση συναλλαγής σε μετρητά (ίδιος πελάτης, ίδια ημέρα, σύνολο ≥ 500 €)",
      severity: "high",
      count: splits.length,
      amount: round2(splits.reduce((s, [, v]) => s + v.total, 0)),
      why: "Ο νόμος εξετάζει τη συνολική αξία της συναλλαγής, όχι κάθε παραστατικό χωριστά. Πολλά παραστατικά μετρητών στην ίδια ημέρα προς τον ίδιο πελάτη που αθροίζουν 500 € και άνω αντιμετωπίζονται ως κατάτμηση για αποφυγή του ορίου.",
      legal: "ν. 5104/2024 άρθρο 57 §10 – συνολική αξία συναλλαγής",
      href: "/invoices",
      hrefLabel: "Δες τα παραστατικά",
      samples: splits.slice(0, 5).map(([k, v]) => `${k.split("|")[1]} · ${v.docs.join(", ")} · σύνολο ${v.total.toFixed(2)} €`),
      group: "behavior",
    });
  }

  /* 20. Συγκέντρωση τζίρου σε έναν πελάτη */
  if (incomeTotal > 0 && income.length >= 5) {
    const byCustomer = new Map<string, { name: string; net: number }>();
    for (const i of income) {
      const key = i.customerId ?? i.customerName ?? "retail";
      const e = byCustomer.get(key) ?? { name: i.customerName || "Λιανική", net: 0 };
      e.net = round2(e.net + i.totalNetValue);
      byCustomer.set(key, e);
    }
    const topCustomer = [...byCustomer.values()].sort((a, b) => b.net - a.net)[0];
    if (topCustomer && topCustomer.net / incomeTotal >= 0.5) {
      const pct = ((topCustomer.net / incomeTotal) * 100).toFixed(1);
      findings.push({
        code: "customer_concentration",
        title: `Συγκέντρωση ${pct}% του τζίρου σε έναν πελάτη`,
        severity: "low",
        count: 1,
        amount: topCustomer.net,
        why: `Ο «${topCustomer.name}» καλύπτει το ${pct}% των εσόδων. Η υψηλή συγκέντρωση εξετάζεται ως ένδειξη συνδεδεμένων/εικονικών συναλλαγών και ταυτόχρονα αποτελεί πραγματικό επιχειρηματικό κίνδυνο ρευστότητας. Κρατήστε συμβάσεις και αποδεικτικά παροχής.`,
        legal: "Στρατηγική ελέγχων ΑΑΔΕ 2026 – εντοπισμός εικονικών συναλλαγών",
        href: "/customers",
        hrefLabel: "Πελατολόγιο",
        samples: [`${topCustomer.name}: ${topCustomer.net.toFixed(2)} € από ${incomeTotal.toFixed(2)} €`],
        group: "behavior",
      });
    }
  }

  /* 21. Έξοδα δυσανάλογα των εσόδων (συστηματική ζημία) */
  const expTotal = round2(expRows.filter((e) => e.issueDate >= last12).reduce((s, e) => s + e.netValue, 0));
  if (incomeTotal > 0 && expTotal > incomeTotal * 1.2) {
    findings.push({
      code: "expenses_exceed_income",
      title: "Έξοδα δυσανάλογα υψηλά σε σχέση με τις πωλήσεις",
      severity: "medium",
      count: 1,
      amount: round2(expTotal - incomeTotal),
      why: `Έξοδα ${expTotal.toFixed(2)} € έναντι εσόδων ${incomeTotal.toFixed(2)} € στο 12μηνο. Επιχειρήσεις με μεγάλες αγορές και δυσανάλογα χαμηλές πωλήσεις, ή συστηματικές ζημιές παρά την έντονη δραστηριότητα, μπαίνουν κατά προτεραιότητα στο δείγμα ελέγχου (έλεγχος εικονικών τιμολογίων).`,
      legal: "Στρατηγική ελέγχων ΑΑΔΕ 2026 · ν. 4172/2013 άρθρο 22 (εκπιπτόμενες δαπάνες)",
      href: "/reports",
      hrefLabel: "Αναφορές",
      samples: [`Έσοδα 12μήνου: ${incomeTotal.toFixed(2)} €`, `Έξοδα 12μήνου: ${expTotal.toFixed(2)} €`],
      group: "behavior",
    });
  }

  /* 22. Στρογγυλά ποσά (ένδειξη κατ' εκτίμηση τιμολόγησης) */
  const roundDocs = income.filter((i) => i.totalNetValue >= 100 && i.totalNetValue % 50 === 0);
  if (income.length >= 8 && roundDocs.length / income.length >= 0.4) {
    findings.push({
      code: "round_amounts",
      title: `Το ${((roundDocs.length / income.length) * 100).toFixed(0)}% των παραστατικών έχει «στρογγυλή» αξία`,
      severity: "low",
      count: roundDocs.length,
      why: "Η μαζική έκδοση παραστατικών με στρογγυλά ποσά (πολλαπλάσια του 50) χωρίς αναλυτική τιμολόγηση αντιμετωπίζεται ως ένδειξη τιμολόγησης «κατ' εκτίμηση» ή προσυμφωνημένων ποσών. Αναλύστε τις γραμμές (ποσότητα × τιμή μονάδας) ώστε το ποσό να τεκμηριώνεται.",
      legal: "ν. 4308/2014 άρθρο 8-9 (περιεχόμενο παραστατικού)",
      href: "/invoices",
      hrefLabel: "Δες τα παραστατικά",
      samples: roundDocs.slice(0, 5).map((i) => `${label(i)} · ${i.totalNetValue.toFixed(2)} € · ${i.customerName || "Λιανική"}`),
      group: "behavior",
    });
  }

  /* 23. Πωλήσεις κάτω του κόστους */
  const belowCost: string[] = [];
  const productMap = new Map<string, { name: string; cost: number }>();
  for (const p of productRows) productMap.set(p.id, { name: p.name, cost: Math.max(p.costPrice, p.avgCost) });
  for (const inv of income) {
    for (const l of linesByInvoice.get(inv.id) ?? []) {
      if (!l.productId) continue;
      const p = productMap.get(l.productId);
      if (!p) continue;
      if (p.cost > 0 && l.unitPrice < p.cost * 0.9) belowCost.push(`${label(inv)} · ${p.name}: τιμή ${l.unitPrice.toFixed(2)} € < κόστος ${p.cost.toFixed(2)} €`);
    }
  }
  if (belowCost.length) {
    findings.push({
      code: "sales_below_cost",
      title: "Πωλήσεις κάτω του κόστους κτήσης",
      severity: "medium",
      count: belowCost.length,
      why: "Η συστηματική πώληση κάτω του κόστους αμφισβητείται ως μη ανταποκρινόμενη στην πραγματική αξία της συναλλαγής και οδηγεί σε προσδιορισμό εσόδων από τον έλεγχο. Τεκμηριώστε προσφορές, εκκαθαρίσεις ή ζημιές αποθέματος.",
      legal: "ν. 4172/2013 άρθρο 22 & 27 · αρχές ΕΛΠ για αποτίμηση",
      href: "/products",
      hrefLabel: "Είδη & κόστος",
      samples: belowCost.slice(0, 5),
      group: "behavior",
    });
  }

  /* 24. Μεγάλες εκπτώσεις κατά σύστημα */
  const bigDiscounts: string[] = [];
  for (const inv of income) {
    for (const l of linesByInvoice.get(inv.id) ?? []) {
      if (l.discountPercent >= 30) bigDiscounts.push(`${label(inv)} γραμμή ${l.lineNumber}: έκπτωση ${l.discountPercent}%`);
    }
  }
  if (bigDiscounts.length >= 3) {
    findings.push({
      code: "large_discounts",
      title: "Επαναλαμβανόμενες εκπτώσεις άνω του 30%",
      severity: "low",
      count: bigDiscounts.length,
      why: "Οι υψηλές εκπτώσεις μειώνουν τη φορολογητέα βάση και ελέγχονται ως προς την εμπορική τους αιτιολογία. Απαιτείται τιμολογιακή πολιτική ή έγγραφη συμφωνία με τον πελάτη.",
      legal: "ν. 4308/2014 άρθρο 8 · Κώδικας ΦΠΑ άρθρο 19 §5 (εκπτώσεις)",
      href: "/invoices",
      hrefLabel: "Δες τα παραστατικά",
      samples: bigDiscounts.slice(0, 5),
      group: "behavior",
    });
  }

  /* 25. Μήνες με έξοδα αλλά χωρίς καθόλου έσοδα */
  const monthsWithIncome = new Set(income.map((i) => i.issueDate.slice(0, 7)));
  const emptyMonths = [...new Set(expRows.filter((e) => e.issueDate >= last12).map((e) => e.issueDate.slice(0, 7)))].filter((m) => !monthsWithIncome.has(m)).sort();
  if (emptyMonths.length >= 2) {
    findings.push({
      code: "months_without_sales",
      title: `${emptyMonths.length} μήνες με έξοδα αλλά χωρίς έσοδα`,
      severity: "medium",
      count: emptyMonths.length,
      why: "Μήνες με δαπάνες και μηδενικές πωλήσεις δημιουργούν ασυμφωνία myDATA–Φ2 και ερώτημα για μη εκδοθέντα παραστατικά ή για δαπάνες που δεν αφορούν την επιχείρηση. Αν η δραστηριότητα ήταν πραγματικά σε αναστολή, κρατήστε τεκμηρίωση.",
      legal: "Α.1138/2020 · διασταυρώσεις myDATA–Φ2–Ε3 (όρια απόκλισης 30%)",
      href: "/reports",
      hrefLabel: "Αναφορές & ΦΠΑ",
      samples: emptyMonths.slice(0, 5),
      group: "behavior",
    });
  }

  /* 26. Μη διαβιβασμένη αξία πάνω από το όριο απόκλισης 30% */
  if (incomeTotal > 0) {
    const notSentValue = round2(notSent.filter((i) => i.issueDate >= last12).reduce((s, i) => s + i.totalNetValue, 0));
    const pct = (notSentValue / incomeTotal) * 100;
    if (pct >= 30) {
      findings.push({
        code: "mydata_deviation_limit",
        title: `Μη διαβιβασμένη αξία ${pct.toFixed(1)}% – πάνω από το ανεκτό όριο απόκλισης`,
        severity: "critical",
        count: notSent.length,
        amount: notSentValue,
        why: "Η ΑΑΔΕ προσυμπληρώνει Ε3/Φ2 από το myDATA και δέχεται απόκλιση εσόδων έως 30%. Με μεγαλύτερη διαφορά, η δήλωση «κοκκινίζει» αυτόματα και αποστέλλεται σημείωμα συμμόρφωσης με προθεσμία 15 εργάσιμων ημερών.",
        legal: "Όρια απόκλισης Ε3/myDATA (Ε3_560 κ.λπ.) · Α.1138/2020",
        href: "/mydata",
        hrefLabel: "Διαβίβαση & συμφωνία",
        samples: [`Μη διαβιβασμένα: ${notSentValue.toFixed(2)} €`, `Τζίρος 12μήνου: ${incomeTotal.toFixed(2)} €`],
        group: "behavior",
      });
    }
  }

  const penalty = findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const counts: Record<RiskSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return {
    score,
    level: score >= 85 ? "green" : score >= 60 ? "amber" : "red",
    findings: findings.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.count - a.count),
    counts,
    checkedAt: new Date().toISOString(),
    checksRun: TOTAL_CHECKS,
  };
}

/** Αποθηκεύει ένα στιγμιότυπο σκορ ανά ημέρα (ιστορικό βελτίωσης). */
export async function saveRiskSnapshot(db: Db, orgId: string, report: RiskReport) {
  const day = report.checkedAt.slice(0, 10);
  const existing = await db.select({ id: riskSnapshots.id }).from(riskSnapshots).where(and(eq(riskSnapshots.orgId, orgId), eq(riskSnapshots.day, day)));
  const values = {
    score: report.score,
    findings: report.findings.length,
    critical: report.counts.critical,
    high: report.counts.high,
    codesJson: JSON.stringify(report.findings.map((f) => f.code)),
  };
  if (existing.length) {
    await db.update(riskSnapshots).set(values).where(eq(riskSnapshots.id, existing[0]!.id));
  } else {
    await db.insert(riskSnapshots).values({ id: randomUUID(), orgId, day, createdAt: new Date().toISOString(), ...values });
  }
}

export async function riskHistory(db: Db, orgId: string, days = 30) {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return db
    .select()
    .from(riskSnapshots)
    .where(and(eq(riskSnapshots.orgId, orgId), gte(riskSnapshots.day, from), lte(riskSnapshots.day, today())))
    .orderBy(riskSnapshots.day);
}
