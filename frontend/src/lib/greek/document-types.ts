/**
 * Τύποι παραστατικών myDATA (invoiceType) που εκδίδει η εφαρμογή.
 * Πηγή: ΑΑΔΕ myDATA – Παράρτημα, Πίνακας «Τύποι Παραστατικών».
 */
export type InvoiceTypeCode =
  | "1.1" | "1.2" | "1.3" | "1.4" | "1.5" | "1.6"
  | "2.1" | "2.2" | "2.3" | "2.4"
  | "3.1" | "3.2"
  | "5.1" | "5.2"
  | "6.1" | "6.2"
  | "7.1"
  | "8.1" | "8.2"
  | "9.3"
  | "11.1" | "11.2" | "11.3" | "11.4" | "11.5"
  | "13.1" | "13.2" | "13.3" | "13.4" | "13.30" | "13.31"
  | "17.1" | "17.2" | "17.3" | "17.4" | "17.5" | "17.6"
  | "QUOTE";

export type DocumentKind = "invoice" | "delivery" | "quote";

export interface DocumentType {
  code: InvoiceTypeCode;
  name: string;
  short: string;
  /** Λιανική: δεν απαιτείται ΑΦΜ λήπτη, ο πελάτης δεν αποστέλλεται στο myDATA. */
  retail: boolean;
  /** Πιστωτικό: μειώνει τα έσοδα. */
  credit: boolean;
  /** Απαιτεί συσχέτιση με αρχικό παραστατικό (correlatedInvoices). */
  requiresCorrelation: boolean;
  /** Προεπιλεγμένος χαρακτηρισμός εσόδου (κατηγορία). */
  defaultClassificationCategory: string;
  /** Προεπιλεγμένος τύπος χαρακτηρισμού E3. */
  defaultClassificationType: string;
  /** invoice: φορολογικό παραστατικό εσόδου · delivery: δελτίο διακίνησης · quote: προσφορά (δεν διαβιβάζεται). */
  kind: DocumentKind;
  /** Παραστατικό εξόδων/αυτοτιμολόγησης που εκδίδει ο λήπτης (τίτλοι κτήσης, εγγραφές τακτοποίησης) – δεν προσμετράται στα έσοδα. */
  expenseSide?: boolean;
  /** Απαιτεί στοιχεία λήπτη ακόμη κι αν είναι ιδιώτης χωρίς ΑΦΜ (π.χ. αγορές από ιδιώτες). */
  counterpartOptionalAfm?: boolean;
}

function t(code: InvoiceTypeCode, name: string, short: string, o: Partial<DocumentType> = {}): DocumentType {
  return {
    code,
    name,
    short,
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_3",
    defaultClassificationType: "E3_561_001",
    kind: "invoice",
    ...o,
  };
}

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    code: "QUOTE",
    name: "Προσφορά",
    short: "ΠΡΟΣΦ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_3",
    defaultClassificationType: "E3_561_001",
    kind: "quote",
  },
  {
    code: "9.3",
    name: "Δελτίο Αποστολής",
    short: "ΔΑ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_001",
    kind: "delivery",
  },
  {
    code: "1.1",
    name: "Τιμολόγιο Πώλησης",
    short: "ΤΠ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_001",
    kind: "invoice",
  },
  {
    code: "1.2",
    name: "Τιμολόγιο Πώλησης / Ενδοκοινοτικές Παραδόσεις",
    short: "ΤΠ-ΕΕ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_005",
    kind: "invoice",
  },
  {
    code: "1.3",
    name: "Τιμολόγιο Πώλησης / Παραδόσεις Τρίτων Χωρών",
    short: "ΤΠ-3Χ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_006",
    kind: "invoice",
  },
  {
    code: "2.1",
    name: "Τιμολόγιο Παροχής Υπηρεσιών",
    short: "ΤΠΥ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_3",
    defaultClassificationType: "E3_561_001",
    kind: "invoice",
  },
  {
    code: "2.2",
    name: "Τιμολόγιο Παροχής / Ενδοκοινοτική Παροχή Υπηρεσιών",
    short: "ΤΠΥ-ΕΕ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_3",
    defaultClassificationType: "E3_561_005",
    kind: "invoice",
  },
  {
    code: "2.3",
    name: "Τιμολόγιο Παροχής / Παροχή Υπηρεσιών σε Τρίτες Χώρες",
    short: "ΤΠΥ-3Χ",
    retail: false,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_3",
    defaultClassificationType: "E3_561_006",
    kind: "invoice",
  },
  {
    code: "5.1",
    name: "Πιστωτικό Τιμολόγιο / Συσχετιζόμενο",
    short: "ΠΤ",
    retail: false,
    credit: true,
    requiresCorrelation: true,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_001",
    kind: "invoice",
  },
  {
    code: "5.2",
    name: "Πιστωτικό Τιμολόγιο / Μη Συσχετιζόμενο",
    short: "ΠΤ-ΜΣ",
    retail: false,
    credit: true,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_001",
    kind: "invoice",
  },
  {
    code: "11.1",
    name: "Απόδειξη Λιανικής Πώλησης",
    short: "ΑΛΠ",
    retail: true,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_003",
    kind: "invoice",
  },
  {
    code: "11.2",
    name: "Απόδειξη Παροχής Υπηρεσιών",
    short: "ΑΠΥ",
    retail: true,
    credit: false,
    requiresCorrelation: false,
    defaultClassificationCategory: "category1_3",
    defaultClassificationType: "E3_561_003",
    kind: "invoice",
  },
  {
    code: "11.4",
    name: "Πιστωτικό Στοιχείο Λιανικής",
    short: "ΠΣΛ",
    retail: true,
    credit: true,
    requiresCorrelation: true,
    defaultClassificationCategory: "category1_1",
    defaultClassificationType: "E3_561_003",
    kind: "invoice",
  },
  t("1.4", "Τιμολόγιο Πώλησης / Πώληση για Λογαριασμό Τρίτων", "ΤΠ-ΤΡ", { defaultClassificationCategory: "category1_7", defaultClassificationType: "E3_881_001" }),
  t("1.5", "Τιμολόγιο Πώλησης / Εκκαθάριση Πωλήσεων Τρίτων – Αμοιβή από Πωλήσεις Τρίτων", "ΤΠ-ΕΚΚ", { defaultClassificationCategory: "category1_3", defaultClassificationType: "E3_561_001" }),
  t("1.6", "Τιμολόγιο Πώλησης / Συμπληρωματικό Παραστατικό", "ΤΠ-ΣΥΜΠ", { requiresCorrelation: true, defaultClassificationCategory: "category1_1" }),
  t("2.4", "Τιμολόγιο Παροχής / Συμπληρωματικό Παραστατικό", "ΤΠΥ-ΣΥΜΠ", { requiresCorrelation: true }),
  t("3.1", "Τίτλος Κτήσης (μη υπόχρεος Εκδότης)", "ΤΚ", { expenseSide: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_3", defaultClassificationType: "E3_585_009" }),
  t("3.2", "Τίτλος Κτήσης (άρνηση έκδοσης από υπόχρεο Εκδότη)", "ΤΚ-ΑΡΝ", { expenseSide: true, defaultClassificationCategory: "category2_3", defaultClassificationType: "E3_585_009" }),
  t("6.1", "Στοιχείο Αυτοπαράδοσης", "ΣΑ", { retail: true, defaultClassificationCategory: "category1_6", defaultClassificationType: "E3_561_007" }),
  t("6.2", "Στοιχείο Ιδιοχρησιμοποίησης", "ΣΙ", { retail: true, defaultClassificationCategory: "category1_6", defaultClassificationType: "E3_561_007" }),
  t("7.1", "Συμβόλαιο – Έσοδο", "ΣΥΜΒ", { defaultClassificationCategory: "category1_3" }),
  t("8.1", "Ενοίκια – Έσοδο", "ΕΝΟΙΚ", { defaultClassificationCategory: "category1_5", defaultClassificationType: "E3_562" }),
  t("8.2", "Τέλος ανθεκτικότητας κλιματικής κρίσης", "ΤΑΚΚ", { retail: true, defaultClassificationCategory: "category1_95", defaultClassificationType: "E3_596" }),
  t("11.3", "Απλοποιημένο Τιμολόγιο", "ΑΤ", { retail: true, defaultClassificationCategory: "category1_1", defaultClassificationType: "E3_561_003" }),
  t("11.5", "Απόδειξη Λιανικής Πώλησης για Λογ/σμό Τρίτων", "ΑΛΠ-ΤΡ", { retail: true, defaultClassificationCategory: "category1_7", defaultClassificationType: "E3_881_003" }),
  t("13.1", "Έξοδα – Αγορές Λιανικών Συναλλαγών ημεδαπής/αλλοδαπής", "ΕΞ-ΛΙΑΝ", { expenseSide: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_5", defaultClassificationType: "E3_585_016" }),
  t("13.2", "Παροχή Λιανικών Συναλλαγών ημεδαπής/αλλοδαπής", "ΕΞ-ΠΑΡ", { expenseSide: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_3", defaultClassificationType: "E3_585_004" }),
  t("13.3", "Κοινόχρηστα", "ΚΟΙΝ", { expenseSide: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_4", defaultClassificationType: "E3_585_015" }),
  t("13.4", "Συνδρομές", "ΣΥΝΔΡ", { expenseSide: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_4", defaultClassificationType: "E3_585_015" }),
  t("13.30", "Παραστατικά Οντότητας ως Αναγράφονται από την ίδια (Δυναμικό)", "ΠΟ-ΔΥΝ", { expenseSide: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_5", defaultClassificationType: "E3_585_015" }),
  t("13.31", "Πιστωτικό Στοιχείο Λιανικής ημεδαπής/αλλοδαπής", "ΠΣΛ-ΕΞ", { expenseSide: true, credit: true, counterpartOptionalAfm: true, defaultClassificationCategory: "category2_5", defaultClassificationType: "E3_585_015" }),
  t("17.1", "Μισθοδοσία", "ΜΙΣΘ", { retail: true, expenseSide: true, defaultClassificationCategory: "category2_6", defaultClassificationType: "E3_581_001" }),
  t("17.2", "Αποσβέσεις", "ΑΠΟΣΒ", { retail: true, expenseSide: true, defaultClassificationCategory: "category2_8", defaultClassificationType: "E3_587" }),
  t("17.3", "Λοιπές Εγγραφές Τακτοποίησης Εσόδων – Λογιστική Βάση", "ΤΑΚΤ-ΕΣ-ΛΒ", { retail: true, defaultClassificationCategory: "category1_95", defaultClassificationType: "E3_561_007" }),
  t("17.4", "Λοιπές Εγγραφές Τακτοποίησης Εσόδων – Φορολογική Βάση", "ΤΑΚΤ-ΕΣ-ΦΒ", { retail: true, defaultClassificationCategory: "category1_95", defaultClassificationType: "E3_561_007" }),
  t("17.5", "Λοιπές Εγγραφές Τακτοποίησης Εξόδων – Λογιστική Βάση", "ΤΑΚΤ-ΕΞ-ΛΒ", { retail: true, expenseSide: true, defaultClassificationCategory: "category2_5", defaultClassificationType: "E3_585_015" }),
  t("17.6", "Λοιπές Εγγραφές Τακτοποίησης Εξόδων – Φορολογική Βάση", "ΤΑΚΤ-ΕΞ-ΦΒ", { retail: true, expenseSide: true, defaultClassificationCategory: "category2_5", defaultClassificationType: "E3_585_015" }),
];

/** Ομαδοποίηση τύπων για τα μενού. */
export const DOCUMENT_TYPE_GROUPS: { label: string; codes: InvoiceTypeCode[] }[] = [
  { label: "Τιμολόγια πώλησης & παροχής", codes: ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "2.1", "2.2", "2.3", "2.4"] },
  { label: "Πιστωτικά", codes: ["5.1", "5.2", "11.4"] },
  { label: "Λιανική", codes: ["11.1", "11.2", "11.3", "11.5"] },
  { label: "Διακίνηση & προσφορές", codes: ["9.3", "QUOTE"] },
  { label: "Λοιπά έσοδα", codes: ["6.1", "6.2", "7.1", "8.1", "8.2"] },
  { label: "Τίτλοι κτήσης & έξοδα (εκδίδει ο λήπτης)", codes: ["3.1", "3.2", "13.1", "13.2", "13.3", "13.4", "13.30", "13.31"] },
  { label: "Εγγραφές τακτοποίησης", codes: ["17.1", "17.2", "17.3", "17.4", "17.5", "17.6"] },
];

export function getDocumentType(code: string): DocumentType {
  const dt = DOCUMENT_TYPES.find((d) => d.code === code);
  if (!dt) throw new Error(`Άγνωστος τύπος παραστατικού: ${code}`);
  return dt;
}

/** Σκοπός διακίνησης (movePurpose) για Δελτία Αποστολής. */
export const MOVE_PURPOSES: { code: number; label: string }[] = [
  { code: 1, label: "Πώληση" },
  { code: 2, label: "Πώληση για λογαριασμό τρίτων" },
  { code: 3, label: "Δειγματισμός" },
  { code: 4, label: "Έκθεση" },
  { code: 5, label: "Επιστροφή" },
  { code: 6, label: "Φύλαξη" },
  { code: 7, label: "Επεξεργασία / Συναρμολόγηση" },
  { code: 8, label: "Μεταξύ εγκαταστάσεων οντότητας" },
  { code: 9, label: "Αγορά" },
  { code: 10, label: "Εφοδιασμός πλοίων και αεροσκαφών" },
  { code: 11, label: "Δωρεάν διάθεση" },
  { code: 12, label: "Εγγύηση" },
  { code: 13, label: "Χρησιδανεισμός" },
  { code: 14, label: "Αποθήκευση σε τρίτους" },
  { code: 15, label: "Επιστροφή από φύλαξη" },
  { code: 16, label: "Ανακύκλωση" },
  { code: 17, label: "Καταστροφή άχρηστου υλικού" },
  { code: 18, label: "Διακίνηση παγίων (ενδοδιακίνηση)" },
  { code: 19, label: "Λοιπές διακινήσεις" },
];

/** Τρόποι πληρωμής myDATA (paymentMethods.type). */
export const PAYMENT_METHODS: { code: number; label: string }[] = [
  { code: 1, label: "Επαγγελματικός Λογαριασμός Πληρωμών Ημεδαπής" },
  { code: 2, label: "Επαγγελματικός Λογαριασμός Πληρωμών Αλλοδαπής" },
  { code: 3, label: "Μετρητά" },
  { code: 4, label: "Επιταγή" },
  { code: 5, label: "Επί Πιστώσει" },
  { code: 6, label: "Ηλεκτρονική τραπεζική (Web Banking)" },
  { code: 7, label: "POS / e-POS" },
  { code: 8, label: "Άμεσες Πληρωμές IRIS" },
];

/** Νομίσματα που υποστηρίζονται στο UI. */
export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
