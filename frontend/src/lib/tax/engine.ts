/**
 * Φορολογικός Εγκέφαλος — Μηχανή κανόνων (ντετερμινιστική).
 * Παράγει επαληθεύσιμες ευκαιρίες εξοικονόμησης με βάση το φορολογικό προφίλ + τα οικονομικά.
 * Οι αριθμοί υπολογίζονται εδώ (όχι από LLM). Κάθε ευκαιρία φέρει παραπομπή (ruleCode) στο KB.
 */
import { round2, formatMoney } from "@/lib/invoice/totals";
import { getRule, type TaxCategory } from "./knowledge-base";

export type LegalForm = "individual" | "oe" | "ee" | "ike" | "epe" | "ae" | "";

export interface TaxProfile {
  legalForm: LegalForm;
  activityStartDate: string; // yyyy-mm-dd
  efkaCategory: number; // 0 = άγνωστο, 1..6, 7 = ειδική νέων
  region: "mainland" | "island_reduced" | "small_village" | "";
  employeesCount: number;
  ownerSalary: number; // ετήσιος μικτός μισθός ιδιοκτήτη (εταιρείες)
  vatExempt: boolean; // ήδη σε καθεστώς απαλλαγής άρθρου 44
  hasRnd: boolean; // κάνει δαπάνες Έρευνας & Ανάπτυξης
  rndSpend: number; // ετήσιες δαπάνες Ε&Α (€) για υπολογισμό υπερέκπτωσης
  greenSpend: number; // ετήσιες δαπάνες ενεργειακής/πράσινης αναβάθμισης (€)
  children: number; // εξαρτώμενα τέκνα (μείωση 2ου κλιμακίου 2026)
  age: number; // ηλικία (0=άγνωστη· ≤25→0%, 26-30→9% στο 2ο κλιμάκιο)
  notes: string;
}

export interface Financials {
  year: number;
  grossRevenue: number; // καθαρή αξία εσόδων (χωρίς ΦΠΑ)
  expenses: number; // καθαρές δαπάνες
  netProfit: number; // κέρδος = έσοδα - δαπάνες
}

export interface Opportunity {
  ruleCode: string;
  category: TaxCategory;
  title: string;
  estimatedBenefit: number; // €/έτος (0 = ποιοτικό)
  rationale: string;
  action: string;
  legalBasis: string;
  sourceUrl: string;
  severity: "high" | "medium" | "info";
}

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  legalForm: "",
  activityStartDate: "",
  efkaCategory: 0,
  region: "",
  employeesCount: 0,
  ownerSalary: 0,
  vatExempt: false,
  hasRnd: false,
  rndSpend: 0,
  greenSpend: 0,
  children: 0,
  age: 0,
  notes: "",
};

export const LEGAL_FORM_LABELS: Record<Exclude<LegalForm, "">, string> = {
  individual: "Ατομική / Ελεύθερος επαγγελματίας",
  oe: "Ο.Ε.",
  ee: "Ε.Ε.",
  ike: "Ι.Κ.Ε.",
  epe: "Ε.Π.Ε.",
  ae: "Α.Ε.",
};

const COMPANY_FORMS: LegalForm[] = ["oe", "ee", "ike", "epe", "ae"];
export const isCompany = (f: LegalForm) => COMPANY_FORMS.includes(f);

export function parseTaxProfile(json: string | null | undefined): TaxProfile {
  if (!json) return { ...DEFAULT_TAX_PROFILE };
  try {
    return { ...DEFAULT_TAX_PROFILE, ...(JSON.parse(json) as Partial<TaxProfile>) };
  } catch {
    return { ...DEFAULT_TAX_PROFILE };
  }
}

export function normalizeTaxProfile(input: Partial<TaxProfile>): TaxProfile {
  return {
    legalForm: (input.legalForm ?? "") as LegalForm,
    activityStartDate: input.activityStartDate ?? "",
    efkaCategory: Number(input.efkaCategory ?? 0) || 0,
    region: (input.region ?? "") as TaxProfile["region"],
    employeesCount: Math.max(0, Number(input.employeesCount ?? 0) || 0),
    ownerSalary: Math.max(0, Number(input.ownerSalary ?? 0) || 0),
    vatExempt: !!input.vatExempt,
    hasRnd: !!input.hasRnd,
    rndSpend: Math.max(0, Number(input.rndSpend ?? 0) || 0),
    greenSpend: Math.max(0, Number(input.greenSpend ?? 0) || 0),
    children: Math.max(0, Math.round(Number(input.children ?? 0) || 0)),
    age: Math.max(0, Math.round(Number(input.age ?? 0) || 0)),
    notes: (input.notes ?? "").slice(0, 500),
  };
}

// Κλίμακα φορολογίας εισοδήματος 2026 (ν.5246/2025, ισχύς 1/1/2026) — χωρίς τέκνα.
const SCALE: { upTo: number; rate: number }[] = [
  { upTo: 10000, rate: 0.09 },
  { upTo: 20000, rate: 0.2 },
  { upTo: 30000, rate: 0.26 },
  { upTo: 40000, rate: 0.34 },
  { upTo: 60000, rate: 0.39 },
  { upTo: Infinity, rate: 0.44 },
];

export function personalBusinessTax(taxable: number, firstBracketRate = 0.09): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of SCALE) {
    if (taxable <= prev) break;
    const amount = Math.min(taxable, b.upTo) - prev;
    const rate = prev === 0 ? firstBracketRate : b.rate;
    tax += amount * rate;
    prev = b.upTo;
  }
  return round2(tax);
}

// Μηνιαίες εισφορές ΕΦΚΑ μη μισθωτών 2025 (κύρια+υγεία) — e-ΕΦΚΑ Εγκ. 2/2025.
const EFKA_MONTHLY: Record<number, number> = {
  1: 244.65,
  2: 293.59,
  3: 351.84,
  4: 422.9,
  5: 506.78,
  6: 659.39,
  7: 146.79, // ειδική κατηγορία νέων (<5 ετών)
};
const UNEMPLOYMENT_MONTHLY = 10;

export function efkaAnnual(category: number): number {
  const monthly = EFKA_MONTHLY[category] ?? EFKA_MONTHLY[1];
  return round2((monthly + UNEMPLOYMENT_MONTHLY) * 12);
}

function bracket2Rate2026(children: number, age = 0): number {
  if (age > 0 && age <= 25) return 0;
  if (age >= 26 && age <= 30) return 0.09;
  return children >= 4 ? 0 : children === 3 ? 0.09 : children === 2 ? 0.16 : children === 1 ? 0.18 : 0.2;
}

/** Φόρος εισοδήματος φυσικών προσώπων 2026 με μείωση 2ου κλιμακίου (10k–20k) βάσει τέκνων/ηλικίας. */
function personalTaxWithChildren(taxable: number, children: number, age = 0): number {
  let tax = 0;
  let prev = 0;
  for (const b of SCALE) {
    if (taxable <= prev) break;
    const amt = Math.min(taxable, b.upTo) - prev;
    const rate = prev === 10000 && b.upTo === 20000 ? bracket2Rate2026(children, age) : b.rate;
    tax += amt * rate;
    prev = b.upTo;
  }
  return round2(tax);
}

function marginalRate(taxable: number): number {
  for (const b of SCALE) if (taxable <= b.upTo) return b.rate;
  return SCALE[SCALE.length - 1].rate;
}

export interface YearEndAction {
  title: string;
  detail: string;
  impact: number; // €/έτος (0 = ποιοτικό)
  legalBasis: string;
}
export interface YearEndPlanResult {
  daysLeft: number;
  projectedTax: number;
  marginalRatePct: number;
  nextBracketGap: number;
  actions: YearEndAction[];
}

/** Βελτιστοποιητής τέλους χρήσης: πρόβλεψη φόρου + χρονικές ενέργειες πριν 31/12. */
export function yearEndPlan(profile: TaxProfile, fin: Financials): YearEndPlanResult {
  const now = new Date();
  const end = new Date(fin.year, 11, 31);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  const company = isCompany(profile.legalForm);
  const efka = efkaAnnual(profile.efkaCategory || 1);
  const taxableIndividual = Math.max(0, fin.netProfit - efka);
  const base = company ? Math.max(0, fin.netProfit) : taxableIndividual;
  const projectedTax = company ? round2(0.22 * base) : personalTaxWithChildren(taxableIndividual, profile.children || 0, profile.age || 0);
  const marginal = company ? 0.22 : marginalRate(taxableIndividual);
  const upper = SCALE.find((b) => b.upTo > base)?.upTo ?? Infinity;
  const nextBracketGap = isFinite(upper) ? round2(upper - base) : 0;

  const actions: YearEndAction[] = [];
  actions.push({
    title: "Επιτάχυνση εκπιπτόμενων δαπανών πριν 31/12",
    detail: `Κάθε 1.000 € επιπλέον εκπιπτόμενη δαπάνη (με ηλεκτρονική πληρωμή) μειώνει τον φόρο ~${formatMoney(1000 * marginal)} στον τρέχοντα οριακό συντελεστή ${Math.round(marginal * 100)}%.`,
    impact: round2(1000 * marginal),
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρα 22-23",
  });
  if (!company && nextBracketGap > 0 && nextBracketGap < 4000) {
    actions.push({
      title: "Προσοχή σε αλλαγή φορολογικού κλιμακίου",
      detail: `Είστε ${formatMoney(nextBracketGap)} κάτω από το επόμενο κλιμάκιο. Αναβολή τιμολόγησης ή πρόσθετες δαπάνες κρατούν εισόδημα στον χαμηλότερο συντελεστή.`,
      impact: 0,
      legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 15",
    });
  }
  actions.push({
    title: "Αγορές παγίων εντός του έτους",
    detail: "Η αγορά εξοπλισμού πριν 31/12 ξεκινά αποσβέσεις που εκπίπτουν και μειώνουν το φορολογητέο κέρδος.",
    impact: 0,
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 24",
  });
  if (!company) {
    actions.push({
      title: "Κάλυψη ηλεκτρονικών αποδείξεων 30%",
      detail: "Συμπληρώστε τις απαιτούμενες ηλεκτρονικές δαπάνες (30% του εισοδήματος) πριν 31/12 για να αποφύγετε φόρο 22% στη διαφορά.",
      impact: 0,
      legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 15 §6",
    });
  }
  if ((profile.efkaCategory || 1) > 1) {
    const saving = round2(efka - efkaAnnual(1));
    actions.push({
      title: "Επιλογή κατηγορίας ΕΦΚΑ για το επόμενο έτος",
      detail: `Η επιλογή χαμηλότερης κατηγορίας εξοικονομεί ~${formatMoney(saving)}/έτος (με χαμηλότερη μελλοντική σύνταξη). Η αίτηση γίνεται στον e-ΕΦΚΑ.`,
      impact: saving,
      legalBasis: "ν.4670/2020 άρθρο 35",
    });
  }
  if (profile.hasRnd) {
    actions.push({
      title: "Δαπάνες Έρευνας & Ανάπτυξης (υπερέκπτωση)",
      detail: "Οι δαπάνες Ε&Α εκπίπτουν προσαυξημένες (έως +100%). Ολοκληρώστε/τιμολογήστε έργα Ε&Α εντός του έτους.",
      impact: 0,
      legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 22Α",
    });
  }
  return { daysLeft, projectedTax, marginalRatePct: Math.round(marginal * 100), nextBracketGap, actions };
}

export interface TaxForecast {
  projectedTax: number;
  advanceTax: number;
  efkaAnnual: number;
  totalObligations: number;
  monthlyReserve: number;
}

/** Πρόβλεψη φόρου/εισφορών & συνιστώμενη μηνιαία κράτηση ταμείου. */
export function taxForecast(profile: TaxProfile, fin: Financials): TaxForecast {
  const company = isCompany(profile.legalForm);
  const efka = company ? 0 : efkaAnnual(profile.efkaCategory || 1);
  const taxable = company ? Math.max(0, fin.netProfit) : Math.max(0, fin.netProfit - efka);
  const tax = company ? round2(0.22 * taxable) : personalTaxWithChildren(taxable, profile.children || 0, profile.age || 0);
  const advanceTax = round2(tax * (company ? 0.8 : 0.55));
  const totalObligations = round2(tax + advanceTax + efka);
  const monthlyReserve = round2(totalObligations / 12);
  return { projectedTax: tax, advanceTax, efkaAnnual: efka, totalObligations, monthlyReserve };
}

function yearsActive(startDate: string, refYear: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const startYear = Number(startDate.slice(0, 4));
  return refYear - startYear + 1; // 1ο έτος = έτος έναρξης
}

/** Κύρια συνάρτηση: παράγει τις προσωποποιημένες ευκαιρίες. */
export function computeOpportunities(profile: TaxProfile, fin: Financials): Opportunity[] {
  const out: Opportunity[] = [];
  const add = (code: string, extra: Partial<Opportunity> & Pick<Opportunity, "estimatedBenefit" | "rationale" | "action" | "severity">) => {
    const rule = getRule(code);
    if (!rule || rule.reviewStatus !== "approved") return;
    out.push({
      ruleCode: code,
      category: rule.category,
      title: rule.title,
      legalBasis: rule.legalBasis,
      sourceUrl: rule.sourceUrl,
      estimatedBenefit: round2(extra.estimatedBenefit),
      rationale: extra.rationale,
      action: extra.action,
      severity: extra.severity,
    });
  };

  const active = yearsActive(profile.activityStartDate, fin.year);
  const efka = efkaAnnual(profile.efkaCategory || 1);

  // 1) Νέος επαγγελματίας — μισός συντελεστής 4,5%
  if (profile.legalForm === "individual" && active !== null && active >= 1 && active <= 3) {
    if (fin.grossRevenue <= 10000) {
      const taxableFirst = Math.min(Math.max(fin.netProfit, 0), 10000);
      const benefit = taxableFirst * (0.09 - 0.045);
      add("new_pro_half_rate", {
        estimatedBenefit: benefit,
        severity: "high",
        rationale: `Είστε στο ${active}ο έτος δραστηριότητας με ακαθάριστα ${fmt(fin.grossRevenue)} ≤ 10.000 €. Ο συντελεστής του 1ου κλιμακίου πέφτει από 9% σε 4,5% στα πρώτα ${fmt(taxableFirst)} κέρδους.`,
        action: "Συμπληρώστε τους κωδικούς 017-018 στο Ε1 και επιβεβαιώστε με τον λογιστή σας.",
      });
    }
    add("new_pro_advance_50", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: "Ως νέα δραστηριότητα, η προκαταβολή φόρου του πρώτου κερδοφόρου έτους περιορίζεται στο 50%.",
      action: "Ελέγξτε ότι εφαρμόστηκε η μειωμένη προκαταβολή στην εκκαθάριση.",
    });
    add("new_pro_tekmarto_exempt", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: `Στα πρώτα 3 έτη δεν εφαρμόζεται το τεκμαρτό ελάχιστο εισόδημα (είστε στο ${active}ο).`,
      action: "Καμία ενέργεια — απλώς μην αποδεχθείτε τεκμαρτό ποσό εάν εμφανιστεί.",
    });
  }

  // 2) Ατομική ↔ ΙΚΕ crossover
  if (profile.legalForm === "individual" && fin.netProfit > 0) {
    const individualCost = personalBusinessTax(Math.max(0, fin.netProfit - efka)) + efka;
    const ikeCorporate = round2(0.22 * fin.netProfit);
    const ikeDividend = round2(0.05 * (fin.netProfit - ikeCorporate));
    const ikeCost = round2(ikeCorporate + ikeDividend + efka + 800 + 600);
    const benefit = round2(individualCost - ikeCost);
    if (benefit > 500) {
      add("legal_form_crossover", {
        estimatedBenefit: benefit,
        severity: "high",
        rationale: `Με κέρδος ${fmt(fin.netProfit)}: ως ατομική ~${fmt(individualCost)} (φόρος+ΕΦΚΑ), ως ΙΚΕ ~${fmt(ikeCost)} (22% + 5% μέρισμα + ΕΦΚΑ + 800 € τέλος ν.π. + ~600 € διπλογραφικά). Εκτιμώμενο όφελος ~${fmt(benefit)}/έτος.`,
        action: "Ζητήστε αναλυτική μελέτη μετατροπής σε ΙΚΕ από τον λογιστή σας (η εκτίμηση δεν συνυπολογίζει προσωπική κατανάλωση/παρακρατήσεις).",
      });
    }
  }

  // 3) Απαλλαγή ΦΠΑ μικρών επιχειρήσεων
  if (fin.grossRevenue > 0 && fin.grossRevenue <= 10000 && !profile.vatExempt) {
    add("vat_small_business", {
      estimatedBenefit: 0,
      severity: "medium",
      rationale: `Ο κύκλος εργασιών ${fmt(fin.grossRevenue)} είναι ≤ 10.000 €. Μπορείτε να ενταχθείτε στο καθεστώς απαλλαγής (χωρίς ΦΠΑ & περιοδικές).`,
      action: "Αξιολογήστε: κερδίζετε σε τιμή/γραφειοκρατία, αλλά χάνετε την έκπτωση ΦΠΑ εισροών. Ιδανικό για χαμηλά έξοδα/ιδιώτες πελάτες.",
    });
  }

  // 4) Επιλογή κατηγορίας ΕΦΚΑ (trade-off)
  if ((profile.legalForm === "individual" || isCompany(profile.legalForm)) && (profile.efkaCategory || 0) > 1) {
    const saving = round2(efkaAnnual(profile.efkaCategory) - efkaAnnual(1));
    if (saving > 0) {
      add("efka_category_choice", {
        estimatedBenefit: saving,
        severity: "medium",
        rationale: `Είστε στην ${profile.efkaCategory}η κατηγορία. Η 1η κατηγορία θα μείωνε τις ετήσιες εισφορές κατά ~${fmt(saving)}.`,
        action: "Trade-off: χαμηλότερη μελλοντική σύνταξη. Επιλέξτε κατηγορία στο Μητρώο του e-ΕΦΚΑ (Ιαν–Ιούν).",
      });
    }
  }

  // 5) Τέλος επιτηδεύματος νομικών προσώπων
  if (isCompany(profile.legalForm)) {
    add("legal_person_trade_fee", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: "Ως νομικό πρόσωπο οφείλετε τέλος επιτηδεύματος (800 € + 600 €/υποκατάστημα).",
      action: "Εξαίρεση αν έσοδα ≤ 2 εκατ. € και αυξήσατε πλήρη απασχόληση ≥ 3/12 μέσα στο έτος.",
    });
    add("salary_vs_dividend", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: "Ο μισθός διαχειριστή εκπίπτει (μειώνει τον φόρο 22%), το μέρισμα φορολογείται 5%.",
      action: "Βελτιστοποιήστε το μείγμα μισθού/μερίσματος με τον λογιστή σας ανάλογα με το ύψος κερδών.",
    });
  }

  // 6) Τεκμαρτό (για ατομικές εκτός 3ετίας)
  if (profile.legalForm === "individual" && (active === null || active > 3)) {
    add("tekmarto_rebuttal", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: "Το τεκμαρτό ελάχιστο εισόδημα ενδέχεται να ανεβάσει τη φορολογική βάση — είναι όμως μαχητό.",
      action: "Αν το πραγματικό εισόδημα είναι χαμηλότερο, τεκμηριώστε αντικειμενικούς λόγους ή ζητήστε έλεγχο (κωδικοί 443-444).",
    });
  }

  // 7) Έρευνα & Ανάπτυξη (υπερέκπτωση +100%)
  if (profile.hasRnd || profile.rndSpend > 0) {
    const rndRate = isCompany(profile.legalForm) ? 0.22 : marginalRate(Math.max(0, fin.netProfit - efkaAnnual(profile.efkaCategory || 1)));
    const rndBenefit = round2(profile.rndSpend * rndRate);
    add("rnd_super_deduction", {
      estimatedBenefit: rndBenefit,
      severity: "high",
      rationale:
        profile.rndSpend > 0
          ? `Δαπάνες Ε&Α ${formatMoney(profile.rndSpend)} εκπίπτουν προσαυξημένες +100% (έως +215%). Η επιπλέον έκπτωση ${formatMoney(profile.rndSpend)} μειώνει τον φόρο ~${formatMoney(rndBenefit)} στον συντελεστή ${Math.round(rndRate * 100)}%.`
          : "Δηλώσατε δαπάνες Ε&Α — εκπίπτουν προσαυξημένες (+100% έως +215%). Καταχωρίστε το ετήσιο ποσό Ε&Α στο προφίλ για ακριβή υπολογισμό.",
      action: "Τεκμηριώστε τις δαπάνες Ε&Α και υποβάλετε για πιστοποίηση (ΓΓΕΚ) ώστε να κατοχυρωθεί η υπερέκπτωση.",
    });
  }

  // 7β) Ενεργειακή / πράσινη αναβάθμιση
  if (profile.greenSpend > 0) {
    const gRate = isCompany(profile.legalForm) ? 0.22 : marginalRate(Math.max(0, fin.netProfit - efkaAnnual(profile.efkaCategory || 1)));
    const gBenefit = round2(profile.greenSpend * gRate);
    add("green_super_deduction", {
      estimatedBenefit: gBenefit,
      severity: "high",
      rationale: `Δαπάνες ενεργειακής/πράσινης αναβάθμισης ${formatMoney(profile.greenSpend)} με προσαυξημένη έκπτωση μειώνουν τον φόρο ~${formatMoney(gBenefit)} στον συντελεστή ${Math.round(gRate * 100)}%.`,
      action: "Τεκμηριώστε τις δαπάνες με ηλεκτρονικές πληρωμές και πιστοποιητικά ενεργειακής αναβάθμισης.",
    });
  }

  // 7γ) Αναπτυξιακός νόμος / επιδοτήσεις (flag)
  if (isCompany(profile.legalForm) || fin.netProfit > 30000) {
    add("development_law", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: "Το μέγεθος/κερδοφορία σας ενδέχεται να πληροί κριτήρια για φοροαπαλλαγές/επιχορηγήσεις επενδύσεων (Αναπτυξιακός Νόμος).",
      action: "Αν σχεδιάζετε επένδυση σε πάγια/εξοπλισμό, ελέγξτε ενεργά καθεστώτα του Αναπτυξιακού Νόμου πριν την υλοποίηση.",
    });
  }

  // 8) Ζημιά → μεταφορά
  if (fin.netProfit < 0) {
    add("loss_carryforward", {
      estimatedBenefit: round2(Math.min(Math.abs(fin.netProfit), fin.grossRevenue) * 0.09),
      severity: "info",
      rationale: `Η χρήση εμφανίζει ζημιά ${fmt(Math.abs(fin.netProfit))}. Μεταφέρεται 5ετία και μειώνει μελλοντικό φόρο.`,
      action: "Βεβαιωθείτε ότι η ζημιά δηλώθηκε σωστά για μελλοντικό συμψηφισμό.",
    });
  }

  // 9) Ηλεκτρονικές πληρωμές (πάντα ως υπενθύμιση)
  add("epayments_deductibility", {
    estimatedBenefit: 0,
    severity: "info",
    rationale: "Δαπάνες > 500 € εκπίπτουν μόνο με τραπεζικά/ηλεκτρονικά μέσα πληρωμής.",
    action: "Εξοφλείτε προμηθευτές ηλεκτρονικά για να μη χάνετε την έκπτωση.",
  });

  // 10) Ηλεκτρονικές αποδείξεις 30% (φυσικά πρόσωπα)
  if (profile.legalForm === "individual") {
    add("elec_receipts_30", {
      estimatedBenefit: 0,
      severity: "info",
      rationale: "Πρέπει να καλύψετε το 30% του εισοδήματος με ηλεκτρονικές δαπάνες, αλλιώς φόρος 22% στη διαφορά. Ιατρικές δαπάνες μετρούν διπλά.",
      action: "Χρησιμοποιήστε κάρτα/IRIS και συγκεντρώστε αποδείξεις σε 20 «επαγγέλματα υψηλού κινδύνου» για έξτρα έκπτωση φόρου έως 5.000 €.",
    });
  }

  return out.sort((a, b) => {
    const sev = { high: 0, medium: 1, info: 2 } as const;
    if (b.estimatedBenefit !== a.estimatedBenefit) return b.estimatedBenefit - a.estimatedBenefit;
    return sev[a.severity] - sev[b.severity];
  });
}

function fmt(n: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
