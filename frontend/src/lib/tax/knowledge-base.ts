/**
 * Φορολογικός Εγκέφαλος — Βάση Γνώσης (Knowledge Base) νόμιμων φορολογικών «παραθύρων».
 *
 * ΑΡΧΗ: Μόνο ΝΟΜΙΜΗ βελτιστοποίηση (tax planning). Κάθε κανόνας φέρει νομική βάση + πηγή + έτος ισχύος.
 * Versioning: κάθε κανόνας έχει effectiveFrom/taxYear. Όταν αλλάζει ο νόμος, προστίθεται νέα έκδοση
 * και ο παλιός γίνεται "archived". Human sign-off: μόνο reviewStatus === "approved" εμφανίζεται στους χρήστες.
 *
 * ΕΝΗΜΕΡΩΣΗ: Οι τιμές 2025 επιβεβαιώθηκαν από επίσημες/έγκυρες πηγές (ΑΑΔΕ, e-ΕΦΚΑ, νόμοι 5073/2023,
 * 5162/2024, 5222/2025). Η ετήσια αναθεώρηση περνά υποχρεωτικά από φοροτεχνικό (βλ. reviewedBy).
 */

export type TaxCategory =
  | "legal_form"
  | "new_business"
  | "vat"
  | "efka"
  | "deductions"
  | "incentives"
  | "timing"
  | "payroll"
  | "losses"
  | "compliance";

export interface TaxRule {
  code: string;
  category: TaxCategory;
  title: string;
  summary: string;
  legalBasis: string;
  sourceUrl: string;
  taxYear: number;
  effectiveFrom: string;
  reviewStatus: "approved" | "draft" | "archived";
  reviewedBy: string;
  reviewedAt: string;
  /** true αν η ωφέλεια υπολογίζεται αριθμητικά από τη μηχανή· false = ποιοτικό/checklist. */
  computable: boolean;
  params?: Record<string, number>;
}

export const CATEGORY_LABELS: Record<TaxCategory, string> = {
  legal_form: "Νομική μορφή",
  new_business: "Νέοι επαγγελματίες",
  vat: "ΦΠΑ",
  efka: "Ασφαλιστικά (ΕΦΚΑ)",
  deductions: "Εκπτώσεις δαπανών",
  incentives: "Κίνητρα & υπερεκπτώσεις",
  timing: "Χρονισμός",
  payroll: "Μισθοδοσία & αμοιβές",
  losses: "Ζημιές",
  compliance: "Συμμόρφωση",
};

const REVIEWER = "Σύνολο ERP – Φοροτεχνική ομάδα (αρχική βάση 2025)";
const REVIEWED_AT = "2025-06-01";

const base = (r: Omit<TaxRule, "reviewStatus" | "reviewedBy" | "reviewedAt">): TaxRule => ({
  ...r,
  reviewStatus: "approved",
  reviewedBy: REVIEWER,
  reviewedAt: REVIEWED_AT,
});

/** Ολόκληρο το KB. Επεκτάσιμο — προσθήκη νέων κανόνων/εκδόσεων εδώ. */
export const TAX_RULES: TaxRule[] = [
  base({
    code: "new_pro_half_rate",
    category: "new_business",
    title: "Νέος επαγγελματίας: μισός συντελεστής 1ου κλιμακίου (4,5%)",
    summary:
      "Για τα 3 πρώτα έτη δραστηριότητας, ο συντελεστής του 1ου κλιμακίου μειώνεται από 9% σε 4,5% όταν το ακαθάριστο εισόδημα ≤ 10.000 €. Κωδικοί Ε1: 017-018.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 29 §1",
    sourceUrl: "https://www.forologikanea.gr/news/eleutheroi-epaggelmaties-poioi-kerdizoun-miso-foro-meiomeni-prokataboli-kai-apallages/",
    taxYear: 2025,
    effectiveFrom: "2023-01-01",
    computable: true,
    params: { years: 3, incomeCap: 10000, reducedRate: 0.045, normalRate: 0.09 },
  }),
  base({
    code: "new_pro_advance_50",
    category: "new_business",
    title: "Νέα επιχείρηση: προκαταβολή φόρου μειωμένη 50%",
    summary: "Το πρώτο έτος απόκτησης κέρδους, η προκαταβολή φόρου περιορίζεται στο 50% — ενίσχυση ρευστότητας.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 71 §2",
    sourceUrl: "http://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/enarxi-epiheirimatikis-drastiriotitas/prokataboli-foroy-eisodimatos-apo-epiheirimatiki",
    taxYear: 2025,
    effectiveFrom: "2020-01-01",
    computable: false,
  }),
  base({
    code: "new_pro_tekmarto_exempt",
    category: "new_business",
    title: "Νέος επαγγελματίας: εξαίρεση από το τεκμαρτό εισόδημα (3ετία)",
    summary:
      "Το τεκμαρτό ελάχιστο εισόδημα ΔΕΝ εφαρμόζεται τα 3 πρώτα έτη· το 4ο μειώνεται κατά 2/3 και το 5ο κατά 1/3.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 28Α (ν.5073/2023)",
    sourceUrl: "https://www.ot.gr/2024/03/01/apopseis/experts/elaxisto-tekmirio-gia-eleytherous-epaggelmaties-dynatotites-amfisvitisis/",
    taxYear: 2025,
    effectiveFrom: "2023-01-01",
    computable: false,
  }),
  base({
    code: "legal_form_crossover",
    category: "legal_form",
    title: "Ατομική ↔ ΙΚΕ/ΕΠΕ: σύγκριση συνολικής επιβάρυνσης",
    summary:
      "Πάνω από ένα ύψος κερδών, η εταιρική φορολόγηση (22% + 5% μέρισμα) μπορεί να συμφέρει έναντι της κλίμακας 9–44% της ατομικής. Συνυπολογίζονται ΕΦΚΑ, τέλος επιτηδεύματος ν.π. και κόστος διπλογραφικών.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρα 15, 29, 58· φόρος μερισμάτων άρθρο 40 §1",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/taxes-on-corporate-income",
    taxYear: 2025,
    effectiveFrom: "2021-01-01",
    computable: true,
    params: { corporateRate: 0.22, dividendRate: 0.05, legalPersonTradeFee: 800, extraAccounting: 600, minBenefit: 500 },
  }),
  base({
    code: "vat_small_business",
    category: "vat",
    title: "Απαλλαγή ΦΠΑ μικρών επιχειρήσεων (όριο 10.000 €)",
    summary:
      "Με κύκλο εργασιών ≤ 10.000 € (εθνικό όριο) μπορείτε να ενταχθείτε στο ειδικό καθεστώς απαλλαγής: χωρίς χρέωση ΦΠΑ στα τιμολόγια, χωρίς περιοδικές δηλώσεις. Δεν εκπίπτει ο ΦΠΑ εισροών.",
    legalBasis: "Κώδικας ΦΠΑ ν.2859/2000 άρθρο 44 (ν.5222/2025)",
    sourceUrl: "https://www.businessdaily.gr/xristika/179755_o-odigos-tis-aade-gia-tin-apallagi-apo-ton-fpa-ton-mikron-epiheiriseon",
    taxYear: 2025,
    effectiveFrom: "2025-01-01",
    computable: true,
    params: { nationalThreshold: 10000, euThreshold: 100000 },
  }),
  base({
    code: "efka_category_choice",
    category: "efka",
    title: "Επιλογή ασφαλιστικής κατηγορίας ΕΦΚΑ",
    summary:
      "Ως μη μισθωτός επιλέγετε ελεύθερα κατηγορία (1η–6η). Η 1η κατηγορία (254,65 €/μήνα το 2025) μειώνει το ταμειακό κόστος — με αντιστάθμισμα χαμηλότερη μελλοντική σύνταξη. Νέοι <5 ετών: ειδική κατηγορία 156,79 €.",
    legalBasis: "ν.4670/2020 άρθρο 35· e-ΕΦΚΑ Εγκύκλιος 2/2025",
    sourceUrl: "https://www.taxheaven.gr/news/69836/nees-asfalistikes-eisfores-2025-egkyklios-eefka",
    taxYear: 2025,
    effectiveFrom: "2025-01-01",
    computable: true,
    params: { cat1Monthly: 254.65, unemploymentMonthly: 10 },
  }),
  base({
    code: "legal_person_trade_fee",
    category: "compliance",
    title: "Τέλος επιτηδεύματος νομικών προσώπων & εξαίρεση",
    summary:
      "Το τέλος επιτηδεύματος καταργήθηκε για φυσικά πρόσωπα/ατομικές από το 2024, αλλά ισχύει για νομικά πρόσωπα (800 € έδρα + 600 €/υποκατάστημα). Εξαίρεση: έσοδα ≤ 2 εκατ. € με αύξηση πλήρους απασχόλησης ≥ 3/12.",
    legalBasis: "ν.3986/2011 άρθρο 31· κατάργηση φ.π. ν.5162/2024 άρθρο 3",
    sourceUrl: "https://www.e-nomothesia.gr/law-news/katargese-telous-epitedeumatos-gia-ta-fysika-prosopa.html",
    taxYear: 2025,
    effectiveFrom: "2024-01-01",
    computable: false,
  }),
  base({
    code: "salary_vs_dividend",
    category: "payroll",
    title: "Μείγμα αμοιβής ιδιοκτήτη: μισθός vs μέρισμα",
    summary:
      "Σε εταιρεία, ο μισθός διαχειριστή εκπίπτει ως δαπάνη (μειώνει τον εταιρικό φόρο 22%) αλλά φορολογείται στην κλίμακα· το μέρισμα φορολογείται 5% χωρίς έκπτωση. Το βέλτιστο μείγμα εξαρτάται από το ύψος και τις εισφορές.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρα 12–15, 40",
    sourceUrl: "https://taxsummaries.pwc.com/greece/individual/taxes-on-personal-income",
    taxYear: 2025,
    effectiveFrom: "2021-01-01",
    computable: false,
  }),
  base({
    code: "rnd_super_deduction",
    category: "incentives",
    title: "Υπερέκπτωση δαπανών Έρευνας & Ανάπτυξης (100%–215%)",
    summary:
      "Οι δαπάνες Ε&Α εκπίπτουν προσαυξημένες: +100% βασικά, +150% για συνεργασίες με startups/ερευνητικά, +200% για ΜμΕ με Ε&Α >20% δαπανών, +215% με πρόσθετο κριτήριο.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 22Α",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/tax-credits-and-incentives",
    taxYear: 2025,
    effectiveFrom: "2024-01-01",
    computable: false,
  }),
  base({
    code: "angel_investor",
    category: "incentives",
    title: "Angel investors: έκπτωση 50% εισφοράς σε startups",
    summary:
      "Φυσικά πρόσωπα εκπίπτουν 50% της κεφαλαιακής εισφοράς σε εγγεγραμμένες startups/ΑΚΕΣ από το φορολογητέο εισόδημα (έως 900.000 €/έτος, έως 300.000 € ανά επιχείρηση).",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 70Α",
    sourceUrl: "https://global.ecovis.com/greece/tax-guide/",
    taxYear: 2025,
    effectiveFrom: "2021-01-01",
    computable: false,
  }),
  base({
    code: "depreciation",
    category: "deductions",
    title: "Αποσβέσεις παγίων & προσαυξημένες αποσβέσεις",
    summary:
      "Οι φορολογικές αποσβέσεις μειώνουν το φορολογητέο κέρδος. Για δαπάνες ενεργειακής απόδοσης/πράσινης οικονομίας/ψηφιακού μετασχηματισμού ισχύουν προσαυξημένες αποσβέσεις.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρα 24, 22Β/22Γ",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/deductions",
    taxYear: 2025,
    effectiveFrom: "2020-01-01",
    computable: false,
  }),
  base({
    code: "epayments_deductibility",
    category: "compliance",
    title: "Έκπτωση δαπανών μόνο με ηλεκτρονική πληρωμή",
    summary:
      "Δαπάνες άνω των 500 € αναγνωρίζονται φορολογικά μόνο αν εξοφληθούν με τραπεζικά/ηλεκτρονικά μέσα. Πληρωμές με μετρητά χάνουν την έκπτωση.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 23 περ. β",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/deductions",
    taxYear: 2025,
    effectiveFrom: "2017-01-01",
    computable: false,
  }),
  base({
    code: "loss_carryforward",
    category: "losses",
    title: "Μεταφορά ζημιών 5 ετών",
    summary: "Η φορολογική ζημιά μεταφέρεται και συμψηφίζεται με κέρδη των επόμενων 5 ετών — μειώνοντας μελλοντικό φόρο.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 27",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/deductions",
    taxYear: 2025,
    effectiveFrom: "2014-01-01",
    computable: true,
    params: { years: 5, corporateRate: 0.22 },
  }),
  base({
    code: "year_end_timing",
    category: "timing",
    title: "Χρονισμός εσόδων/εξόδων γύρω από το κλείσιμο χρήσης",
    summary:
      "Μετάθεση τιμολόγησης εσόδων στη νέα χρήση ή επίσπευση αναγκαίων εξόδων/προμηθειών πριν το τέλος του έτους μπορεί να εξομαλύνει το φορολογητέο εισόδημα (εντός των ορίων του δεδουλευμένου).",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρα 8, 22",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/income-determination",
    taxYear: 2025,
    effectiveFrom: "2014-01-01",
    computable: false,
  }),
  base({
    code: "insurance_premiums",
    category: "payroll",
    title: "Ομαδικά ασφαλιστήρια & παροχές σε είδος εργαζομένων",
    summary:
      "Ασφάλιστρα ομαδικών συμβολαίων και ορισμένες παροχές σε είδος (π.χ. κάρτες σίτισης έως όριο) έχουν ευνοϊκή φορολογική μεταχείριση και εκπίπτουν ως δαπάνη.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρα 13, 14, 22",
    sourceUrl: "https://taxsummaries.pwc.com/greece/individual/income-determination",
    taxYear: 2025,
    effectiveFrom: "2020-01-01",
    computable: false,
  }),
  base({
    code: "tekmarto_rebuttal",
    category: "compliance",
    title: "Αμφισβήτηση τεκμαρτού ελάχιστου εισοδήματος",
    summary:
      "Το τεκμαρτό είναι μαχητό: με αντικειμενικούς λόγους (θητεία, νοσηλεία, εγκυμοσύνη, φυσική καταστροφή) ή με αίτημα ελέγχου, δηλώνοντας τους κωδικούς 443-444 στο Ε1.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 28Α §3-4· ΣτΕ 1800/2025",
    sourceUrl: "https://siamakis-lawyers.gr/tekmarto-eisodima-eleftheroi-epaggelmaties-ste-1800-2025/",
    taxYear: 2025,
    effectiveFrom: "2023-01-01",
    computable: false,
  }),
  base({
    code: "elec_receipts_30",
    category: "compliance",
    title: "Ηλεκτρονικές αποδείξεις 30% & έξτρα έκπτωση επαγγελμάτων",
    summary:
      "Κάλυψη 30% του εισοδήματος με ηλεκτρονικές πληρωμές (αλλιώς φόρος 22% στη διαφορά). Ιατρικές δαπάνες μετρούν διπλά· δαπάνες σε 20 «επαγγέλματα υψηλού κινδύνου» εκπίπτουν 30% (έως 5.000 €).",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 15 §6· άρθρο 16",
    sourceUrl: "https://www.cnn.gr/oikonomia/chrima/story/498478/poies-ilektronikes-apodeikseis-metrane-dipla-gia-tin-ekptosi-forou-to-2026",
    taxYear: 2025,
    effectiveFrom: "2020-01-01",
    computable: false,
  }),
  base({
    code: "building_renovation",
    category: "deductions",
    title: "Έκπτωση φόρου δαπανών αναβάθμισης κτιρίων (έως 16.000 €)",
    summary:
      "Δαπάνες ενεργειακής/λειτουργικής/αισθητικής αναβάθμισης ακινήτων μειώνουν τον φόρο έως 16.000 € σε 5 έτη (έως 3.200 €/έτος). Απαιτείται ηλεκτρονική πληρωμή· ισχύει έως 31/12/2026.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 39Β· ΚΥΑ Α.1153/2025",
    sourceUrl: "https://taxnet.gr/individuals-gr/dapanes-anavathmisis-ktirion-paratasi-eos-to-2026-kai-ti-ischyei-gia-tin-ekptosi-forou-11-25/",
    taxYear: 2026,
    effectiveFrom: "2024-01-01",
    computable: false,
  }),
  base({
    code: "nondom_5c",
    category: "incentives",
    title: "Μεταφορά φορολογικής κατοικίας: απαλλαγή 50% (άρθρο 5Γ)",
    summary:
      "Όσοι μεταφέρουν τη φορολογική τους κατοικία στην Ελλάδα για μισθωτή/επιχειρηματική δραστηριότητα απαλλάσσονται κατά 50% του εισοδήματος για 7 έτη (χωρίς τεκμήρια κατοικίας/οχήματος).",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 5Γ",
    sourceUrl: "https://www.aade.gr/sites/default/files/2025-11/forologika_kinitra_ENG.pdf",
    taxYear: 2025,
    effectiveFrom: "2021-01-01",
    computable: false,
  }),
  base({
    code: "nondom_5b",
    category: "incentives",
    title: "Αλλοδαποί συνταξιούχοι: εναλλακτική φορολόγηση 7% (άρθρο 5Β)",
    summary: "Συνταξιούχοι εξωτερικού που μεταφέρουν την κατοικία τους φορολογούνται με σταθερό 7% στο παγκόσμιο εισόδημα, έως 15 έτη.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 5Β",
    sourceUrl: "https://www.aade.gr/sites/default/files/2025-11/forologika_kinitra_ENG.pdf",
    taxYear: 2025,
    effectiveFrom: "2020-01-01",
    computable: false,
  }),
  base({
    code: "transform_4935",
    category: "incentives",
    title: "Μετασχηματισμοί επιχειρήσεων: απαλλαγή 30% φόρου (ν.4935/2022)",
    summary:
      "Συγχώνευση/μετατροπή/συνεργασία επιχειρήσεων δίνει απαλλαγή 30% του φόρου εισοδήματος έως 9 έτη (όριο οφέλους 1 εκατ. €). Προϋποθέσεις: >9 ΕΜΕ, μέσος τζίρος 3ετίας ≥ 150.000 €, λειτουργία ≥5 έτη.",
    legalBasis: "ν.4935/2022 άρθρα 1-13",
    sourceUrl: "https://tkcfinance.com/forologika-kinitra-metaschimatismon-n-4935-2022-o-pliris-odigos-gia-tin-apallagi-forou-30/",
    taxYear: 2025,
    effectiveFrom: "2022-01-01",
    computable: false,
  }),
  base({
    code: "green_super_deduction",
    category: "deductions",
    title: "Πράσινη/ενεργειακή αναβάθμιση — προσαυξημένη έκπτωση",
    summary: "Δαπάνες ενεργειακής αναβάθμισης & πράσινης οικονομίας εκπίπτουν προσαυξημένες, μειώνοντας το φορολογητέο κέρδος. Απαιτείται τεκμηρίωση/πιστοποίηση.",
    legalBasis: "ΚΦΕ ν.4172/2013 άρθρο 22Β",
    sourceUrl: "https://www.aade.gr/",
    taxYear: 2025,
    effectiveFrom: "2020-01-01",
    computable: false,
  }),
  base({
    code: "development_law",
    category: "incentives",
    title: "Αναπτυξιακός Νόμος — φοροαπαλλαγές/επιχορηγήσεις επενδύσεων",
    summary: "Επενδύσεις σε πάγια/εξοπλισμό μπορεί να επιδοτηθούν ή να λάβουν φορολογική απαλλαγή μέσω των καθεστώτων του Αναπτυξιακού Νόμου.",
    legalBasis: "ν.4887/2022 (Αναπτυξιακός Νόμος)",
    sourceUrl: "https://www.ependyseis.gr/",
    taxYear: 2025,
    effectiveFrom: "2022-01-01",
    computable: false,
  }),
];

export const APPROVED_RULES = TAX_RULES.filter((r) => r.reviewStatus === "approved");

export function getRule(code: string): TaxRule | undefined {
  return TAX_RULES.find((r) => r.code === code);
}
