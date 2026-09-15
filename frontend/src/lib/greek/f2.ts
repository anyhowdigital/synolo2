/**
 * Αντιστοίχιση κινήσεων σε κωδικούς του εντύπου Φ2 (Περιοδική Δήλωση ΦΠΑ, έντυπο 050 – ΦΠΑ ΕΚΔΟΣΗ 2016+).
 *
 * Εκροές (Πίνακας Β' – φορολογητέες): 301 13% · 302 6% · 303 24% · 304 9% · 305 4% · 306 17%
 *   ΦΠΑ εκροών: 331–336 αντίστοιχα · 307/337 σύνολα · 310 ενδοκοινοτικές/εξαγωγές/απαλλαγές με δικαίωμα έκπτωσης ·
 *   311 απαλλασσόμενες χωρίς δικαίωμα έκπτωσης · 312 σύνολο εκροών.
 * Εισροές (Πίνακας Β' – εισροές): 361 αγορές & δαπάνες εσωτερικού · 362 αγορές & εισαγωγές παγίων ·
 *   363 λοιπές εισαγωγές · 364 ενδοκοινοτικές αποκτήσεις αγαθών · 365 ενδοκοινοτικές λήψεις υπηρεσιών ·
 *   366 λοιπές πράξεις λήπτη · 367/387 σύνολα · ΦΠΑ εισροών 381–386.
 * Εκκαθάριση: 470 ΦΠΑ εισροών (387) · 480 ΦΠΑ εκροών (337) · 483 χρεωστικό / 484 πιστωτικό υπόλοιπο.
 *
 * Τα ποσά είναι ενδεικτικά: ο λογιστής οριστικοποιεί (διακανονισμοί, pro-rata, πιστωτικό προηγούμενης περιόδου).
 */

import { round2 } from "@/lib/invoice/totals";

export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export type F2Code = {
  code: string;
  label: string;
  amount: number;
  /** Ζεύγος φορολογητέας αξίας ↔ ΦΠΑ. */
  vatCode?: string;
  group: "outputs" | "outputs_vat" | "inputs" | "inputs_vat" | "settlement";
};

const OUTPUT_BY_RATE: Record<number, { base: string; vat: string }> = {
  13: { base: "301", vat: "331" },
  6: { base: "302", vat: "332" },
  24: { base: "303", vat: "333" },
  9: { base: "304", vat: "334" },
  4: { base: "305", vat: "335" },
  17: { base: "306", vat: "336" },
};

const LABELS: Record<string, string> = {
  "301": "Εκροές 13%",
  "302": "Εκροές 6%",
  "303": "Εκροές 24%",
  "304": "Εκροές 9% (νησιά)",
  "305": "Εκροές 4% (νησιά)",
  "306": "Εκροές 17% (νησιά)",
  "307": "Σύνολο φορολογητέων εκροών",
  "310": "Ενδοκοινοτικές παραδόσεις, εξαγωγές & λοιπές εκροές με δικαίωμα έκπτωσης",
  "311": "Εκροές απαλλασσόμενες χωρίς δικαίωμα έκπτωσης",
  "312": "Σύνολο εκροών",
  "331": "ΦΠΑ εκροών 13%",
  "332": "ΦΠΑ εκροών 6%",
  "333": "ΦΠΑ εκροών 24%",
  "334": "ΦΠΑ εκροών 9%",
  "335": "ΦΠΑ εκροών 4%",
  "336": "ΦΠΑ εκροών 17%",
  "337": "Σύνολο ΦΠΑ εκροών",
  "361": "Αγορές & δαπάνες εσωτερικού",
  "362": "Αγορές & εισαγωγές παγίων",
  "363": "Λοιπές εισαγωγές (τρίτες χώρες)",
  "364": "Ενδοκοινοτικές αποκτήσεις αγαθών",
  "365": "Ενδοκοινοτικές λήψεις υπηρεσιών (άρθ. 14 §2α)",
  "366": "Λοιπές πράξεις λήπτη",
  "367": "Σύνολο φορολογητέων εισροών",
  "381": "ΦΠΑ εισροών εσωτερικού",
  "382": "ΦΠΑ παγίων",
  "383": "ΦΠΑ λοιπών εισαγωγών",
  "384": "ΦΠΑ ενδοκοινοτικών αποκτήσεων",
  "385": "ΦΠΑ ενδοκοινοτικών λήψεων υπηρεσιών",
  "386": "ΦΠΑ λοιπών πράξεων λήπτη",
  "387": "Σύνολο ΦΠΑ εισροών",
  "470": "Σύνολο ΦΠΑ εισροών για έκπτωση",
  "480": "Σύνολο ΦΠΑ εκροών",
  "483": "Χρεωστικό υπόλοιπο (ΦΠΑ για απόδοση)",
  "484": "Πιστωτικό υπόλοιπο (για μεταφορά/επιστροφή)",
};

export interface F2OutputLine {
  /** Συντελεστής % (0 για απαλλαγή). */
  rate: number;
  vatCategory: number;
  vatExemptionCategory?: number | null;
  net: number;
  vat: number;
  customerCountry?: string | null;
}

export interface F2InputLine {
  net: number;
  vat: number;
  vatDeductible: boolean;
  supplierCountry: string;
  invoiceType: string;
  classificationCategory: string;
}

/** Αιτίες εξαίρεσης που δίνουν δικαίωμα έκπτωσης (ενδοκοινοτικές, εξαγωγές, άρθ. 27, 24/28 κ.ά.) → κωδ. 310. */
const DEDUCTIBLE_EXEMPTIONS = new Set([4, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 24]);

export function buildF2(outputs: F2OutputLine[], inputs: F2InputLine[]) {
  const acc = new Map<string, number>();
  const add = (code: string, amt: number) => acc.set(code, round2((acc.get(code) ?? 0) + amt));

  for (const o of outputs) {
    if (o.vatCategory === 8) continue; // εγγραφές χωρίς ΦΠΑ (εκτός πεδίου)
    const m = OUTPUT_BY_RATE[o.rate];
    if (m && o.vatCategory !== 7) {
      add(m.base, o.net);
      add(m.vat, o.vat);
    } else {
      const deductible = o.vatExemptionCategory ? DEDUCTIBLE_EXEMPTIONS.has(o.vatExemptionCategory) : !!o.customerCountry && o.customerCountry !== "GR";
      add(deductible ? "310" : "311", o.net);
    }
  }
  add("307", ["301", "302", "303", "304", "305", "306"].reduce((s, c) => s + (acc.get(c) ?? 0), 0));
  add("337", ["331", "332", "333", "334", "335", "336"].reduce((s, c) => s + (acc.get(c) ?? 0), 0));
  add("312", (acc.get("307") ?? 0) + (acc.get("310") ?? 0) + (acc.get("311") ?? 0));

  for (const i of inputs) {
    if (!i.vatDeductible) continue; // χωρίς δικαίωμα έκπτωσης: δεν εγγράφεται στα 361–366
    const eu = EU_COUNTRIES.has(i.supplierCountry);
    const foreign = i.supplierCountry !== "GR";
    let base = "361";
    let vat = "381";
    if (i.classificationCategory === "category2_7") [base, vat] = ["362", "382"];
    else if (i.invoiceType === "14.1") [base, vat] = ["364", "384"];
    else if (i.invoiceType === "14.3" || i.invoiceType === "14.4") [base, vat] = ["365", "385"];
    else if (i.invoiceType === "14.2" || i.invoiceType === "14.5") [base, vat] = ["363", "383"];
    else if (i.invoiceType === "14.30" || i.invoiceType === "14.31") [base, vat] = ["366", "386"];
    else if (eu) [base, vat] = i.classificationCategory === "category2_3" ? ["365", "385"] : ["364", "384"];
    else if (foreign) [base, vat] = ["363", "383"];
    add(base, i.net);
    add(vat, i.vat);
  }
  add("367", ["361", "362", "363", "364", "365", "366"].reduce((s, c) => s + (acc.get(c) ?? 0), 0));
  add("387", ["381", "382", "383", "384", "385", "386"].reduce((s, c) => s + (acc.get(c) ?? 0), 0));

  add("470", acc.get("387") ?? 0);
  add("480", acc.get("337") ?? 0);
  const diff = round2((acc.get("480") ?? 0) - (acc.get("470") ?? 0));
  add("483", diff > 0 ? diff : 0);
  add("484", diff < 0 ? -diff : 0);

  const group = (c: string): F2Code["group"] => (c.startsWith("30") || c.startsWith("31") ? "outputs" : c.startsWith("33") ? "outputs_vat" : c.startsWith("36") ? "inputs" : c.startsWith("38") ? "inputs_vat" : "settlement");
  const codes: F2Code[] = Object.keys(LABELS)
    .sort()
    .map((code) => ({ code, label: LABELS[code], amount: acc.get(code) ?? 0, group: group(code) }));
  return { codes, payable: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0 };
}

export type F2Result = ReturnType<typeof buildF2>;
