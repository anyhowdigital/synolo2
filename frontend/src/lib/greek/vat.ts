/**
 * Κατηγορίες ΦΠΑ σύμφωνα με τους κωδικούς myDATA (vatCategory).
 * Πηγή: ΑΑΔΕ myDATA – Παράρτημα, Πίνακας «Κατηγορίες ΦΠΑ».
 */
export type VatCategoryCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface VatCategory {
  code: VatCategoryCode;
  rate: number;
  label: string;
  description: string;
}

export const VAT_CATEGORIES: VatCategory[] = [
  { code: 1, rate: 24, label: "24%", description: "Κανονικός συντελεστής" },
  { code: 2, rate: 13, label: "13%", description: "Μειωμένος συντελεστής" },
  { code: 3, rate: 6, label: "6%", description: "Υπερμειωμένος συντελεστής" },
  { code: 4, rate: 17, label: "17%", description: "Κανονικός – νησιά μειωμένου ΦΠΑ" },
  { code: 5, rate: 9, label: "9%", description: "Μειωμένος – νησιά μειωμένου ΦΠΑ" },
  { code: 6, rate: 4, label: "4%", description: "Υπερμειωμένος – νησιά μειωμένου ΦΠΑ" },
  { code: 7, rate: 0, label: "0%", description: "Άνευ ΦΠΑ (με αιτία εξαίρεσης)" },
  { code: 8, rate: 0, label: "Χωρίς ΦΠΑ", description: "Εγγραφές χωρίς ΦΠΑ (π.χ. Μισθοδοσία, Αποσβέσεις)" },
];

export function getVatCategory(code: number): VatCategory {
  const cat = VAT_CATEGORIES.find((c) => c.code === code);
  if (!cat) throw new Error(`Άγνωστη κατηγορία ΦΠΑ: ${code}`);
  return cat;
}

/**
 * Αιτίες εξαίρεσης ΦΠΑ (vatExemptionCategory) – απαιτούνται όταν vatCategory = 7.
 */
export const VAT_EXEMPTION_REASONS: { code: number; label: string }[] = [
  { code: 1, label: "Χωρίς ΦΠΑ – άρθρο 2 και 3 του Κώδικα ΦΠΑ" },
  { code: 2, label: "Χωρίς ΦΠΑ – άρθρο 5 του Κώδικα ΦΠΑ" },
  { code: 3, label: "Χωρίς ΦΠΑ – άρθρο 13 του Κώδικα ΦΠΑ" },
  { code: 4, label: "Χωρίς ΦΠΑ – άρθρο 14 του Κώδικα ΦΠΑ" },
  { code: 5, label: "Χωρίς ΦΠΑ – άρθρο 16 του Κώδικα ΦΠΑ" },
  { code: 6, label: "Χωρίς ΦΠΑ – άρθρο 19 του Κώδικα ΦΠΑ" },
  { code: 7, label: "Χωρίς ΦΠΑ – άρθρο 22 του Κώδικα ΦΠΑ" },
  { code: 8, label: "Χωρίς ΦΠΑ – άρθρο 24 του Κώδικα ΦΠΑ" },
  { code: 9, label: "Χωρίς ΦΠΑ – άρθρο 25 του Κώδικα ΦΠΑ" },
  { code: 10, label: "Χωρίς ΦΠΑ – άρθρο 26 του Κώδικα ΦΠΑ" },
  { code: 11, label: "Χωρίς ΦΠΑ – άρθρο 27 του Κώδικα ΦΠΑ" },
  { code: 12, label: "Χωρίς ΦΠΑ – άρθρο 27 – Πλοία Ανοικτής Θαλάσσης" },
  { code: 13, label: "Χωρίς ΦΠΑ – άρθρο 27.1.γ – Πλοία Ανοικτής Θαλάσσης" },
  { code: 14, label: "Χωρίς ΦΠΑ – άρθρο 28 του Κώδικα ΦΠΑ (ενδοκοινοτικές παραδόσεις)" },
  { code: 15, label: "Χωρίς ΦΠΑ – άρθρο 39 του Κώδικα ΦΠΑ (μικρές επιχειρήσεις)" },
  { code: 16, label: "Χωρίς ΦΠΑ – άρθρο 39α του Κώδικα ΦΠΑ" },
  { code: 17, label: "Χωρίς ΦΠΑ – άρθρο 40 του Κώδικα ΦΠΑ" },
  { code: 18, label: "Χωρίς ΦΠΑ – άρθρο 41 του Κώδικα ΦΠΑ" },
  { code: 19, label: "Χωρίς ΦΠΑ – άρθρο 47 του Κώδικα ΦΠΑ" },
  { code: 20, label: "ΦΠΑ εμπεριεχόμενος – άρθρο 43 του Κώδικα ΦΠΑ" },
  { code: 21, label: "ΦΠΑ εμπεριεχόμενος – άρθρο 44 του Κώδικα ΦΠΑ" },
  { code: 22, label: "ΦΠΑ εμπεριεχόμενος – άρθρο 45 του Κώδικα ΦΠΑ" },
  { code: 23, label: "ΦΠΑ εμπεριεχόμενος – άρθρο 46 του Κώδικα ΦΠΑ" },
  { code: 24, label: "Χωρίς ΦΠΑ – άρθρο 6 του Κώδικα ΦΠΑ" },
  { code: 25, label: "Χωρίς ΦΠΑ – ΠΟΛ.1029/1995" },
  { code: 26, label: "Χωρίς ΦΠΑ – ΠΟΛ.1167/2015" },
  { code: 27, label: "Λοιπές εξαιρέσεις ΦΠΑ" },
  { code: 28, label: "Χωρίς ΦΠΑ – άρθρο 24 περ. β' παρ.1 (Tax Free)" },
  { code: 29, label: "Χωρίς ΦΠΑ – άρθρο 47β (OSS μη ενωσιακό καθεστώς)" },
  { code: 30, label: "Χωρίς ΦΠΑ – άρθρο 47γ (OSS ενωσιακό καθεστώς)" },
  { code: 31, label: "Χωρίς ΦΠΑ – άρθρο 47δ (IOSS)" },
];
