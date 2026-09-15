/**
 * Θέμα εμφάνισης παραστατικών (PDF & εκτυπώσιμη μορφή). Client-safe – δεν εισάγει βάση.
 * Αποθηκεύεται ως JSON στο organizations.pdfThemeJson.
 */

export const PDF_TEMPLATES = [
  { id: "classic", label: "Κλασικό", description: "Μαύρες γραμμές, σφιχτή διάταξη – ουδέτερο επαγγελματικό ύφος." },
  { id: "modern", label: "Μοντέρνο", description: "Έγχρωμη κεφαλίδα σε όλο το πλάτος, λευκά γράμματα, τονισμένα σύνολα." },
  { id: "minimal", label: "Μινιμαλ", description: "Χωρίς γραμμές, ριγέ πίνακας, περισσότερος «αέρας»." },
  { id: "bold", label: "Έντονο", description: "Έγχρωμη κάθετη λωρίδα αριστερά, μεγάλος τίτλος, γεμάτη κεφαλίδα πίνακα." },
  { id: "elegant", label: "Κομψό", description: "Κεντραρισμένη κεφαλίδα, λεπτές γραμμές, αραιά γράμματα – για ελεύθερους επαγγελματίες." },
] as const;

export type PdfTemplateId = (typeof PDF_TEMPLATES)[number]["id"];

export const PDF_DENSITIES = [
  { id: "compact", label: "Συμπαγές" },
  { id: "normal", label: "Κανονικό" },
  { id: "relaxed", label: "Άνετο" },
] as const;

export type PdfDensity = (typeof PDF_DENSITIES)[number]["id"];

export const PDF_ACCENT_PRESETS = ["#171717", "#1d4ed8", "#0f766e", "#b91c1c", "#7c3aed", "#c2410c", "#0369a1", "#374151"];

export interface PdfColumns {
  qty: boolean;
  unitPrice: boolean;
  discount: boolean;
  vat: boolean;
}

export interface PdfTheme {
  template: PdfTemplateId;
  accentColor: string;
  density: PdfDensity;
  columns: PdfColumns;
  showLogo: boolean;
  showQr: boolean;
  showBankDetails: boolean;
  showVatBreakdown: boolean;
  showSignatureBox: boolean;
  /** Γενικοί όροι/σημειώσεις που εκτυπώνονται σε κάθε παραστατικό (εκτός αν η σειρά ορίζει δικούς της). */
  terms: string;
  /** Λεζάντα πάνω από τις υπογραφές (π.χ. «Ο εκδότης» / «Ο παραλαβών»). */
  signatureLabels: [string, string];
}

export const DEFAULT_PDF_THEME: PdfTheme = {
  template: "classic",
  accentColor: "#171717",
  density: "normal",
  columns: { qty: true, unitPrice: true, discount: true, vat: true },
  showLogo: true,
  showQr: true,
  showBankDetails: true,
  showVatBreakdown: true,
  showSignatureBox: false,
  terms: "",
  signatureLabels: ["Ο εκδότης", "Ο παραλαβών"],
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isPdfTemplate(v: unknown): v is PdfTemplateId {
  return typeof v === "string" && PDF_TEMPLATES.some((t) => t.id === v);
}

export function isPdfDensity(v: unknown): v is PdfDensity {
  return typeof v === "string" && PDF_DENSITIES.some((d) => d.id === v);
}

function bool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

/** Ανάγνωση θέματος από JSON με fallback στα defaults για κάθε πεδίο. */
export function parsePdfTheme(json: string | null | undefined): PdfTheme {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(json || "{}");
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const cols = (raw.columns && typeof raw.columns === "object" ? raw.columns : {}) as Record<string, unknown>;
  const labels = Array.isArray(raw.signatureLabels) ? raw.signatureLabels : [];
  return {
    template: isPdfTemplate(raw.template) ? raw.template : DEFAULT_PDF_THEME.template,
    accentColor: typeof raw.accentColor === "string" && HEX.test(raw.accentColor) ? raw.accentColor.toLowerCase() : DEFAULT_PDF_THEME.accentColor,
    density: isPdfDensity(raw.density) ? raw.density : DEFAULT_PDF_THEME.density,
    columns: {
      qty: bool(cols.qty, true),
      unitPrice: bool(cols.unitPrice, true),
      discount: bool(cols.discount, true),
      vat: bool(cols.vat, true),
    },
    showLogo: bool(raw.showLogo, true),
    showQr: bool(raw.showQr, true),
    showBankDetails: bool(raw.showBankDetails, true),
    showVatBreakdown: bool(raw.showVatBreakdown, true),
    showSignatureBox: bool(raw.showSignatureBox, false),
    terms: typeof raw.terms === "string" ? raw.terms.slice(0, 2000) : "",
    signatureLabels: [
      typeof labels[0] === "string" && labels[0].trim() ? labels[0].slice(0, 40) : DEFAULT_PDF_THEME.signatureLabels[0],
      typeof labels[1] === "string" && labels[1].trim() ? labels[1].slice(0, 40) : DEFAULT_PDF_THEME.signatureLabels[1],
    ],
  };
}

export function serializePdfTheme(theme: PdfTheme): string {
  return JSON.stringify(parsePdfTheme(JSON.stringify(theme)));
}

/** Κωδικοποίηση θέματος σε URL-safe string για ζωντανή προεπισκόπηση. */
export function encodeThemeParam(theme: PdfTheme): string {
  return btoa(encodeURIComponent(JSON.stringify(theme))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeThemeParam(param: string | undefined | null): PdfTheme | null {
  if (!param) return null;
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    return parsePdfTheme(decodeURIComponent(atob(b64)));
  } catch {
    return null;
  }
}

/** Παράγωγα χρώματα/μετρικές για τις δύο υλοποιήσεις (HTML & react-pdf). */
export function themeTokens(theme: PdfTheme) {
  const accent = theme.accentColor;
  const isDarkAccent = luminance(accent) < 0.35;
  const tpl = theme.template;
  const modern = tpl === "modern";
  const minimal = tpl === "minimal";
  const bold = tpl === "bold";
  const elegant = tpl === "elegant";
  return {
    template: tpl,
    accent,
    /** Χρώμα κειμένου πάνω σε φόντο accent. */
    onAccent: isDarkAccent ? "#ffffff" : "#171717",
    rule: minimal ? "#e5e5e5" : elegant ? "#a3a3a3" : modern || bold ? accent : "#171717",
    ruleLight: minimal ? "#f0f0f0" : elegant ? "#e5e5e5" : "#d4d4d4",
    headText: modern || bold ? accent : elegant ? "#171717" : "#525252",
    titleColor: modern || minimal || bold ? accent : "#171717",
    band: modern,
    sideBar: bold,
    filledHead: modern || bold,
    centered: elegant,
    noRules: minimal,
    striped: minimal,
    letterSpacing: elegant ? 0.8 : 0,
    scale: theme.density === "compact" ? 0.92 : theme.density === "relaxed" ? 1.08 : 1,
    rowPad: (theme.density === "compact" ? 2.5 : theme.density === "relaxed" ? 6 : 4) + (minimal ? 1.5 : 0),
  };
}

function luminance(hex: string) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
