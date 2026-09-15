/** Βήματα μηνιαίου κλεισίματος ανά πελάτη (κοινά για UI & server actions). */
export const CLOSING_STEPS = [
  { code: "books", label: "Καταχώρηση παραστατικών & εξόδων" },
  { code: "mydata", label: "Διαβίβαση myDATA & συμφωνία" },
  { code: "bank", label: "Συμφωνία τραπέζης" },
  { code: "vat", label: "Υποβολή Φ2 / ΦΠΑ" },
  { code: "payroll", label: "Μισθοδοσία & ΑΠΔ" },
  { code: "lock", label: "Κλείδωμα περιόδου" },
] as const;
