/** Κανονικές στήλες ανά τύπο εισαγωγής – χρησιμοποιούνται στην οθόνη αντιστοίχισης στηλών. */

import { parseCsv } from "@/lib/import/csv";

export type ImportFieldSpec = { key: string; label: string; required?: boolean; aliases: string[] };

export const IMPORT_FIELDS: Record<string, ImportFieldSpec[]> = {
  customers: [
    { key: "Επωνυμία", label: "Επωνυμία", required: true, aliases: ["Επωνυμία", "name", "Όνομα", "Πελάτης", "customer", "company"] },
    { key: "ΑΦΜ", label: "ΑΦΜ", aliases: ["ΑΦΜ", "afm", "vat", "vatNumber"] },
    { key: "ΔΟΥ", label: "ΔΟΥ", aliases: ["ΔΟΥ", "doy", "tax office"] },
    { key: "Δραστηριότητα", label: "Δραστηριότητα", aliases: ["Δραστηριότητα", "activity", "Επάγγελμα"] },
    { key: "Διεύθυνση", label: "Διεύθυνση", aliases: ["Διεύθυνση", "address", "street", "Οδός"] },
    { key: "Πόλη", label: "Πόλη", aliases: ["Πόλη", "city"] },
    { key: "ΤΚ", label: "ΤΚ", aliases: ["ΤΚ", "Τ.Κ.", "postalCode", "zip"] },
    { key: "Χώρα", label: "Χώρα", aliases: ["Χώρα", "country"] },
    { key: "Email", label: "Email", aliases: ["Email", "e-mail", "mail"] },
    { key: "Τηλέφωνο", label: "Τηλέφωνο", aliases: ["Τηλέφωνο", "phone", "tel", "Κινητό"] },
    { key: "Υπεύθυνος", label: "Υπεύθυνος επικοινωνίας", aliases: ["Υπεύθυνος", "contact", "contactPerson"] },
    { key: "Όροι πληρωμής", label: "Ημέρες πίστωσης", aliases: ["Όροι πληρωμής", "paymentTerms", "Ημέρες πίστωσης"] },
    { key: "Τύπος", label: "Τύπος (company/individual)", aliases: ["Τύπος", "kind", "type"] },
    { key: "Σημειώσεις", label: "Σημειώσεις", aliases: ["Σημειώσεις", "notes"] },
  ],
  products: [
    { key: "Περιγραφή", label: "Περιγραφή είδους", required: true, aliases: ["Περιγραφή", "name", "Είδος", "product", "Ονομασία"] },
    { key: "Κωδικός", label: "Κωδικός (SKU)", aliases: ["Κωδικός", "sku", "code", "barcode"] },
    { key: "Τιμή", label: "Τιμή μονάδας", required: true, aliases: ["Τιμή", "unitPrice", "price", "Τιμή πώλησης"] },
    { key: "Κόστος", label: "Κόστος", aliases: ["Κόστος", "costPrice", "cost"] },
    { key: "ΦΠΑ", label: "ΦΠΑ %", aliases: ["ΦΠΑ", "vat", "vatRate"] },
    { key: "Τύπος", label: "Τύπος (product/service)", aliases: ["Τύπος", "kind", "type"] },
    { key: "Μονάδα", label: "Μονάδα μέτρησης", aliases: ["Μονάδα", "unit", "ΜΜ"] },
    { key: "Απόθεμα", label: "Απόθεμα", aliases: ["Απόθεμα", "stock", "quantity"] },
    { key: "Όριο", label: "Όριο επαναπαραγγελίας", aliases: ["Όριο", "reorderLevel", "Ελάχιστο"] },
    { key: "Σημειώσεις", label: "Σημειώσεις", aliases: ["Σημειώσεις", "description", "notes"] },
  ],
  invoices: [
    { key: "Παραστατικό", label: "Κλειδί ομαδοποίησης παραστατικού", aliases: ["Παραστατικό", "Αρ. παραστατικού", "document", "invoice", "Αριθμός"] },
    { key: "Σειρά", label: "Σειρά", aliases: ["Σειρά", "series", "Κωδικός σειράς"] },
    { key: "Ημερομηνία", label: "Ημερομηνία έκδοσης", required: true, aliases: ["Ημερομηνία", "date", "issueDate", "Έκδοση"] },
    { key: "Λήξη", label: "Προθεσμία πληρωμής", aliases: ["Λήξη", "dueDate", "Προθεσμία"] },
    { key: "Πελάτης", label: "Πελάτης", aliases: ["Πελάτης", "customer", "Επωνυμία", "name"] },
    { key: "ΑΦΜ", label: "ΑΦΜ πελάτη", aliases: ["ΑΦΜ", "afm", "vat"] },
    { key: "Τρόπος πληρωμής", label: "Τρόπος πληρωμής", aliases: ["Τρόπος πληρωμής", "paymentMethod", "Πληρωμή"] },
    { key: "Περιγραφή", label: "Περιγραφή γραμμής", required: true, aliases: ["Περιγραφή", "description", "Είδος", "item"] },
    { key: "Ποσότητα", label: "Ποσότητα", aliases: ["Ποσότητα", "quantity", "qty"] },
    { key: "Τιμή", label: "Τιμή μονάδας", required: true, aliases: ["Τιμή", "unitPrice", "price"] },
    { key: "Έκπτωση", label: "Έκπτωση %", aliases: ["Έκπτωση", "discount", "discountPercent"] },
    { key: "ΦΠΑ", label: "ΦΠΑ %", aliases: ["ΦΠΑ", "vat", "vatRate"] },
    { key: "Κωδικός", label: "Κωδικός είδους (SKU)", aliases: ["Κωδικός", "sku", "code"] },
    { key: "Σημειώσεις", label: "Σημειώσεις", aliases: ["Σημειώσεις", "notes"] },
  ],
  expenses: [
    { key: "Προμηθευτής", label: "Προμηθευτής", required: true, aliases: ["Προμηθευτής", "supplier", "Επωνυμία", "name"] },
    { key: "ΑΦΜ", label: "ΑΦΜ προμηθευτή", aliases: ["ΑΦΜ", "afm", "vat"] },
    { key: "Ημερομηνία", label: "Ημερομηνία", required: true, aliases: ["Ημερομηνία", "date", "issueDate"] },
    { key: "Σειρά", label: "Σειρά", aliases: ["Σειρά", "series"] },
    { key: "Αριθμός", label: "Αριθμός παραστατικού", aliases: ["Αριθμός", "number", "Αρ. παραστατικού"] },
    { key: "Περιγραφή", label: "Περιγραφή", aliases: ["Περιγραφή", "description", "Αιτιολογία"] },
    { key: "Καθαρή αξία", label: "Καθαρή αξία", required: true, aliases: ["Καθαρή αξία", "net", "netValue", "Καθαρό"] },
    { key: "ΦΠΑ", label: "ΦΠΑ %", aliases: ["ΦΠΑ", "vat", "vatRate"] },
    { key: "Ποσό ΦΠΑ", label: "Ποσό ΦΠΑ", aliases: ["Ποσό ΦΠΑ", "vatAmount"] },
    { key: "Παρακράτηση", label: "Παρακράτηση", aliases: ["Παρακράτηση", "withheld", "withholding"] },
    { key: "Λήξη", label: "Προθεσμία πληρωμής", aliases: ["Λήξη", "dueDate", "Προθεσμία"] },
    { key: "ΜΑΡΚ", label: "ΜΑΡΚ myDATA", aliases: ["ΜΑΡΚ", "mark", "mydataMark"] },
    { key: "Χώρα", label: "Χώρα", aliases: ["Χώρα", "country"] },
    { key: "Τύπος", label: "Τύπος παραστατικού", aliases: ["Τύπος", "invoiceType", "type"] },
  ],
  suppliers: [
    { key: "Επωνυμία", label: "Επωνυμία", required: true, aliases: ["Επωνυμία", "name", "Προμηθευτής", "supplier"] },
    { key: "ΑΦΜ", label: "ΑΦΜ", aliases: ["ΑΦΜ", "afm", "vat"] },
    { key: "ΔΟΥ", label: "ΔΟΥ", aliases: ["ΔΟΥ", "doy"] },
    { key: "Χώρα", label: "Χώρα", aliases: ["Χώρα", "country"] },
    { key: "Διεύθυνση", label: "Διεύθυνση", aliases: ["Διεύθυνση", "address"] },
    { key: "Πόλη", label: "Πόλη", aliases: ["Πόλη", "city"] },
    { key: "ΤΚ", label: "ΤΚ", aliases: ["ΤΚ", "postalCode", "zip"] },
    { key: "Email", label: "Email", aliases: ["Email", "mail"] },
    { key: "Τηλέφωνο", label: "Τηλέφωνο", aliases: ["Τηλέφωνο", "phone"] },
    { key: "Υπεύθυνος", label: "Υπεύθυνος", aliases: ["Υπεύθυνος", "contact"] },
    { key: "IBAN", label: "IBAN", aliases: ["IBAN", "iban"] },
    { key: "Τράπεζα", label: "Τράπεζα", aliases: ["Τράπεζα", "bank", "bankName"] },
    { key: "Ημέρες πίστωσης", label: "Ημέρες πίστωσης", aliases: ["Ημέρες πίστωσης", "paymentTermsDays", "Όροι πληρωμής"] },
    { key: "Σημειώσεις", label: "Σημειώσεις", aliases: ["Σημειώσεις", "notes"] },
  ],
  payments: [
    { key: "Τύπος", label: "Τύπος (είσπραξη / εξόφληση)", aliases: ["Τύπος", "type", "kind", "Κατηγορία"] },
    { key: "Ημερομηνία", label: "Ημερομηνία πληρωμής", required: true, aliases: ["Ημερομηνία", "date", "paidAt", "Ημ/νία"] },
    { key: "Παραστατικό", label: "Αριθμός παραστατικού", aliases: ["Παραστατικό", "Αριθμός", "invoice", "number", "Τιμολόγιο"] },
    { key: "Σειρά", label: "Σειρά", aliases: ["Σειρά", "series"] },
    { key: "ΑΦΜ", label: "ΑΦΜ πελάτη/προμηθευτή", aliases: ["ΑΦΜ", "afm", "vat"] },
    { key: "Επωνυμία", label: "Επωνυμία πελάτη/προμηθευτή", aliases: ["Επωνυμία", "Πελάτης", "Προμηθευτής", "name", "customer", "supplier"] },
    { key: "Ποσό", label: "Ποσό", required: true, aliases: ["Ποσό", "amount", "Αξία", "value"] },
    { key: "Τρόπος", label: "Τρόπος πληρωμής", aliases: ["Τρόπος", "Τρόπος πληρωμής", "method", "paymentMethod"] },
    { key: "Λογαριασμός", label: "Λογαριασμός ταμείου/τράπεζας", aliases: ["Λογαριασμός", "account", "Ταμείο", "Τράπεζα", "IBAN"] },
    { key: "Αιτιολογία", label: "Αιτιολογία / αναφορά", aliases: ["Αιτιολογία", "reference", "Σημειώσεις", "notes", "description"] },
  ],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9α-ω]/g, "");

/** Προτείνει αντιστοίχιση στήλης αρχείου → κανονικό πεδίο. */
export function autoMap(headers: string[], fields: ImportFieldSpec[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of fields) {
    const hit = headers.find((h) => !used.has(h) && f.aliases.some((a) => norm(a) === norm(h)));
    if (hit) {
      map[f.key] = hit;
      used.add(hit);
    }
  }
  return map;
}

/** Ξαναγράφει το CSV με κανονικές κεφαλίδες, σύμφωνα με την αντιστοίχιση του χρήστη. */
export function applyMapping(csvText: string, mapping: Record<string, string>): string {
  const { rows } = parseCsv(csvText);
  const keys = Object.keys(mapping).filter((k) => mapping[k]);
  if (keys.length === 0) return csvText;
  const esc = (v: string) => (v.includes(";") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [keys.join(";")];
  for (const r of rows) out.push(keys.map((k) => esc(r[mapping[k]] ?? "")).join(";"));
  return "\uFEFF" + out.join("\r\n");
}
