/**
 * Χαρακτηρισμοί εσόδων myDATA (incomeClassification).
 * Κατηγορία (classificationCategory) + Τύπος (classificationType, κωδικοί Ε3).
 */
export const INCOME_CLASSIFICATION_CATEGORIES: { code: string; label: string }[] = [
  { code: "category1_1", label: "Έσοδα από Πώληση Εμπορευμάτων (+/-)" },
  { code: "category1_2", label: "Έσοδα από Πώληση Προϊόντων (+/-)" },
  { code: "category1_3", label: "Έσοδα από Παροχή Υπηρεσιών (+/-)" },
  { code: "category1_4", label: "Έσοδα από Πώληση Παγίων (+/-)" },
  { code: "category1_5", label: "Λοιπά Έσοδα/Κέρδη (+/-)" },
  { code: "category1_6", label: "Αυτοπαραδόσεις / Ιδιοχρησιμοποιήσεις (+/-)" },
  { code: "category1_7", label: "Έσοδα για λογαριασμό τρίτων (+/-)" },
  { code: "category1_8", label: "Έσοδα προηγούμενων χρήσεων (+/-)" },
  { code: "category1_9", label: "Έσοδα επομένων χρήσεων (+/-)" },
  { code: "category1_10", label: "Λοιπές Εγγραφές Τακτοποίησης Εσόδων (+/-)" },
  { code: "category1_95", label: "Λοιπά Πληροφοριακά Στοιχεία Εσόδων (+/-)" },
];

export const INCOME_CLASSIFICATION_TYPES: { code: string; label: string }[] = [
  { code: "E3_561_001", label: "Πωλήσεις αγαθών και υπηρεσιών – Χονδρικές, Επιτηδευματιών" },
  { code: "E3_561_002", label: "Πωλήσεις αγαθών και υπηρεσιών – Χονδρικές βάσει άρθρου 39α" },
  { code: "E3_561_003", label: "Πωλήσεις αγαθών και υπηρεσιών – Λιανικές, Ιδιωτική Πελατεία" },
  { code: "E3_561_004", label: "Πωλήσεις αγαθών και υπηρεσιών – Λιανικές βάσει άρθρου 39α" },
  { code: "E3_561_005", label: "Πωλήσεις αγαθών και υπηρεσιών – Εξωτερικού Ενδοκοινοτικές" },
  { code: "E3_561_006", label: "Πωλήσεις αγαθών και υπηρεσιών – Εξωτερικού Τρίτες Χώρες" },
  { code: "E3_561_007", label: "Πωλήσεις αγαθών και υπηρεσιών – Λοιπά" },
  { code: "E3_562", label: "Λοιπά συνήθη έσοδα" },
  { code: "E3_563", label: "Πιστωτικοί τόκοι και συναφή έσοδα" },
  { code: "E3_564", label: "Πιστωτικές συναλλαγματικές διαφορές" },
  { code: "E3_565", label: "Έσοδα συμμετοχών" },
  { code: "E3_566", label: "Κέρδη από διάθεση μη κυκλοφορούντων περιουσιακών στοιχείων" },
  { code: "E3_567", label: "Κέρδη από αναστροφή προβλέψεων και απομειώσεων" },
  { code: "E3_568", label: "Κέρδη από επιμέτρηση στην εύλογη αξία" },
  { code: "E3_570", label: "Ασυνήθη έσοδα και κέρδη" },
  { code: "E3_595", label: "Έξοδα σε ιδιοπαραγωγή" },
  { code: "E3_596", label: "Επιδοτήσεις – Επιχορηγήσεις" },
  { code: "E3_597", label: "Επιδοτήσεις – Επιχορηγήσεις για επενδυτικούς σκοπούς" },
  { code: "E3_880_001", label: "Πωλήσεις Παγίων – Χονδρικές" },
  { code: "E3_880_002", label: "Πωλήσεις Παγίων – Λιανικές" },
  { code: "E3_880_003", label: "Πωλήσεις Παγίων – Εξωτερικού Ενδοκοινοτικές" },
  { code: "E3_880_004", label: "Πωλήσεις Παγίων – Εξωτερικού Τρίτες Χώρες" },
  { code: "E3_881_001", label: "Πωλήσεις για λογ/σμό Τρίτων – Χονδρικές" },
  { code: "E3_881_002", label: "Πωλήσεις για λογ/σμό Τρίτων – Λιανικές" },
  { code: "E3_881_003", label: "Πωλήσεις για λογ/σμό Τρίτων – Εξωτερικού Ενδοκοινοτικές" },
  { code: "E3_881_004", label: "Πωλήσεις για λογ/σμό Τρίτων – Εξωτερικού Τρίτες Χώρες" },
];

export function classificationCategoryLabel(code: string) {
  return INCOME_CLASSIFICATION_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

export function classificationTypeLabel(code: string) {
  return INCOME_CLASSIFICATION_TYPES.find((c) => c.code === code)?.label ?? code;
}

/** Παρακρατούμενοι φόροι (withheldPercentCategory). */
export const WITHHOLDING_TAXES: {
  code: number;
  label: string;
  rate: number | null;
}[] = [
  { code: 0, label: "Χωρίς παρακράτηση", rate: 0 },
  { code: 1, label: "Περίπτ. β' – Τόκοι 15%", rate: 15 },
  { code: 2, label: "Περίπτ. γ' – Δικαιώματα 20%", rate: 20 },
  { code: 3, label: "Περίπτ. δ' – Αμοιβές Συμβουλών Διοίκησης 20%", rate: 20 },
  { code: 4, label: "Περίπτ. δ' – Τεχνικά Έργα 3%", rate: 3 },
  { code: 5, label: "Υγρά καύσιμα και προϊόντα καπνού 1%", rate: 1 },
  { code: 6, label: "Λοιπά Αγαθά 4%", rate: 4 },
  { code: 7, label: "Παροχή Υπηρεσιών 8%", rate: 8 },
  { code: 8, label: "Προκαταβλητέος Φόρος Αρχιτεκτόνων/Μηχανικών 4%", rate: 4 },
  { code: 9, label: "Προκαταβλητέος Φόρος Αρχιτεκτόνων/Μηχανικών 10%", rate: 10 },
  { code: 10, label: "Προκαταβλητέος Φόρος Δικηγόρων 15%", rate: 15 },
  { code: 11, label: "Παρακράτηση Φόρου Μισθωτών Υπηρεσιών", rate: null },
  { code: 12, label: "Παρακράτηση Φόρου Μισθωτών Υπηρεσιών – Αξιωματικών Ε.Ν.", rate: 15 },
  { code: 13, label: "Παρακράτηση Φόρου Μισθωτών Υπηρεσιών – Κατώτερο Πλήρωμα Ε.Ν.", rate: 10 },
  { code: 14, label: "Παρακράτηση Ειδικής Εισφοράς Αλληλεγγύης", rate: null },
  { code: 15, label: "Παρακράτηση Φόρου Αποζημίωσης λόγω Διακοπής Σχέσης Εργασίας", rate: null },
  { code: 16, label: "Παρακρατήσεις συναλλαγών αλλοδαπής βάσει ΣΑΔΦ", rate: null },
  { code: 17, label: "Λοιπές Παρακρατήσεις Φόρου", rate: null },
  { code: 18, label: "Παρακράτηση Φόρου Μερίσματα 5%", rate: 5 },
];

export function getWithholdingTax(code: number) {
  return WITHHOLDING_TAXES.find((w) => w.code === code) ?? WITHHOLDING_TAXES[0];
}

/** Τέλος χαρτοσήμου (stampDutyPercentCategory). */
export const STAMP_DUTY_CATEGORIES: { code: number; label: string; rate: number }[] = [
  { code: 0, label: "Χωρίς χαρτόσημο", rate: 0 },
  { code: 1, label: "Χαρτόσημο 1,2%", rate: 1.2 },
  { code: 2, label: "Χαρτόσημο 2,4%", rate: 2.4 },
  { code: 3, label: "Χαρτόσημο 3,6%", rate: 3.6 },
];

/** Μονάδες μέτρησης myDATA (measurementUnit). */
export const MEASUREMENT_UNITS: { code: number; label: string; short: string }[] = [
  { code: 1, label: "Τεμάχια", short: "τεμ." },
  { code: 2, label: "Κιλά", short: "kg" },
  { code: 3, label: "Λίτρα", short: "lt" },
  { code: 4, label: "Μέτρα", short: "m" },
  { code: 5, label: "Τετραγωνικά Μέτρα", short: "m²" },
  { code: 6, label: "Κυβικά Μέτρα", short: "m³" },
  { code: 7, label: "Τεμάχια – Λοιπές Περιπτώσεις (Υπηρεσίες)", short: "υπηρ." },
];

export function measurementUnitShort(code: number) {
  return MEASUREMENT_UNITS.find((u) => u.code === code)?.short ?? "τεμ.";
}
