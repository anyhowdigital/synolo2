/** Σχέδιο λογαριασμών ΕΛΠ – ασφαλές για client components (χωρίς βάση/Node APIs). */

export const ACCOUNT_KEYS = [
  { key: "customers", label: "Πελάτες", hint: "30.00", group: "Απαιτήσεις / Υποχρεώσεις" },
  { key: "suppliers", label: "Προμηθευτές", hint: "50.00", group: "Απαιτήσεις / Υποχρεώσεις" },
  { key: "cash", label: "Ταμείο (μετρητά)", hint: "38.00", group: "Διαθέσιμα" },
  { key: "bank", label: "Καταθέσεις όψεως (τράπεζα / POS / IRIS)", hint: "38.03", group: "Διαθέσιμα" },
  { key: "salesGoods", label: "Πωλήσεις εμπορευμάτων", hint: "70.00", group: "Έσοδα" },
  { key: "salesProducts", label: "Πωλήσεις προϊόντων", hint: "71.00", group: "Έσοδα" },
  { key: "salesServices", label: "Παροχή υπηρεσιών", hint: "73.00", group: "Έσοδα" },
  { key: "salesOther", label: "Λοιπά έσοδα", hint: "75.00", group: "Έσοδα" },
  { key: "salesIntraEu", label: "Πωλήσεις ενδοκοινοτικές / εξωτερικού", hint: "70.95", group: "Έσοδα" },
  { key: "vatOutput24", label: "ΦΠΑ εκροών 24%", hint: "54.00.70.24", group: "ΦΠΑ" },
  { key: "vatOutput13", label: "ΦΠΑ εκροών 13%", hint: "54.00.70.13", group: "ΦΠΑ" },
  { key: "vatOutput6", label: "ΦΠΑ εκροών 6%", hint: "54.00.70.06", group: "ΦΠΑ" },
  { key: "vatOutputOther", label: "ΦΠΑ εκροών λοιποί συντελεστές (νησιά)", hint: "54.00.70.99", group: "ΦΠΑ" },
  { key: "vatInput", label: "ΦΠΑ εισροών (εκπιπτόμενος)", hint: "54.00.20", group: "ΦΠΑ" },
  { key: "vatInputNonDeductible", label: "ΦΠΑ μη εκπιπτόμενος (έξοδο)", hint: "64.98", group: "ΦΠΑ" },
  { key: "withheldTax", label: "Παρακρατούμενος φόρος (απαίτηση)", hint: "33.13", group: "Φόροι" },
  { key: "stampDuty", label: "Χαρτόσημο", hint: "54.09", group: "Φόροι" },
  { key: "expGoods", label: "Αγορές εμπορευμάτων", hint: "20.00", group: "Έξοδα" },
  { key: "expMaterials", label: "Αγορές Α'-Β' υλών", hint: "24.00", group: "Έξοδα" },
  { key: "expServices", label: "Αμοιβές & έξοδα τρίτων", hint: "61.00", group: "Έξοδα" },
  { key: "expGeneral", label: "Γενικά έξοδα", hint: "64.00", group: "Έξοδα" },
  { key: "expPersonnel", label: "Αμοιβές & παροχές προσωπικού", hint: "60.00", group: "Έξοδα" },
  { key: "expAssets", label: "Πάγια (αγορές)", hint: "14.00", group: "Έξοδα" },
  { key: "expUtilities", label: "Παροχές τρίτων (ενέργεια, τηλεπικοινωνίες, ενοίκια)", hint: "62.00", group: "Έξοδα" },
] as const;

export type AccountKey = (typeof ACCOUNT_KEYS)[number]["key"];
export type AccountMap = Record<AccountKey, string>;

export const DEFAULT_ACCOUNT_MAP: AccountMap = Object.fromEntries(ACCOUNT_KEYS.map((k) => [k.key, k.hint])) as AccountMap;

export function parseAccountMap(json: string | null | undefined): AccountMap {
  if (!json) return { ...DEFAULT_ACCOUNT_MAP };
  try {
    const parsed = JSON.parse(json) as Partial<Record<string, string>>;
    const out = { ...DEFAULT_ACCOUNT_MAP };
    for (const k of ACCOUNT_KEYS) {
      const v = parsed[k.key];
      if (typeof v === "string" && v.trim()) out[k.key] = v.trim();
    }
    return out;
  } catch {
    return { ...DEFAULT_ACCOUNT_MAP };
  }
}

export function accountLabel(key: AccountKey) {
  return ACCOUNT_KEYS.find((k) => k.key === key)!.label;
}
