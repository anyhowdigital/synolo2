/**
 * Ετικέτες παραστατικού σε ελληνικά, αγγλικά, γερμανικά, ιταλικά – και δίγλωσσο (EL/EN) για πελάτες εξωτερικού.
 * Client-safe (χωρίς βάση).
 */
import type { DocumentLanguage } from "@/lib/i18n/languages";

export type DocLang = DocumentLanguage | "bilingual";

export const DOC_LANG_OPTIONS: { id: DocLang; label: string }[] = [
  { id: "el", label: "Ελληνικά" },
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
  { id: "bilingual", label: "Δίγλωσσο (EL/EN)" },
];

export function isDocLang(v: unknown): v is DocLang {
  return DOC_LANG_OPTIONS.some((o) => o.id === v);
}

/** Γλώσσα διεπαφής/HTML lang που αντιστοιχεί σε γλώσσα παραστατικού (δίγλωσσο → αγγλικά για τον ξένο λήπτη). */
export function baseLang(lang: DocLang): DocumentLanguage {
  return lang === "bilingual" ? "en" : lang;
}

type Tuple = readonly [el: string, en: string, de: string, it: string];

const L = {
  issuer: ["Εκδότης", "Issuer", "Aussteller", "Emittente"],
  recipient: ["Στοιχεία λήπτη", "Bill to", "Rechnungsempfänger", "Destinatario"],
  retailCustomer: ["Λιανική πώληση – ιδιώτης", "Retail sale – private individual", "Einzelhandel – Privatkunde", "Vendita al dettaglio – privato"],
  afm: ["ΑΦΜ", "VAT No.", "USt-IdNr.", "Partita IVA"],
  vatNo: ["VAT", "VAT No.", "USt-IdNr.", "P. IVA"],
  doy: ["ΔΟΥ", "Tax office", "Finanzamt", "Ufficio imposte"],
  gemi: ["ΓΕΜΗ", "Reg. No.", "Handelsregister-Nr.", "N. Registro imprese"],
  country: ["Χώρα", "Country", "Land", "Paese"],
  date: ["Ημερομηνία", "Date", "Datum", "Data"],
  due: ["Προθεσμία πληρωμής", "Due date", "Fällig am", "Scadenza"],
  validUntil: ["Ισχύει έως", "Valid until", "Gültig bis", "Valida fino al"],
  mydataType: ["Τύπος myDATA", "myDATA type", "myDATA-Typ", "Tipo myDATA"],
  fxRate: ["Ισοτιμία", "Exchange rate", "Wechselkurs", "Tasso di cambio"],
  payment: ["Πληρωμή", "Payment", "Zahlung", "Pagamento"],
  paymentMethod: ["Τρόπος", "Method", "Zahlungsart", "Modalità"],
  paymentRef: ["Κωδικός πληρωμής (RF)", "Payment reference (RF)", "Zahlungsreferenz (RF)", "Riferimento pagamento (RF)"],
  dispatch: ["Διακίνηση", "Dispatch", "Versand", "Spedizione"],
  dispatchDate: ["Ημ/νία", "Date", "Datum", "Data"],
  purpose: ["Σκοπός", "Purpose", "Zweck", "Causale"],
  vehicle: ["Όχημα", "Vehicle", "Fahrzeug", "Veicolo"],
  from: ["Από", "From", "Von", "Da"],
  to: ["Προς", "To", "Nach", "A"],
  correlated: ["Συσχετιζόμενο παραστατικό", "Related document", "Bezugsdokument", "Documento collegato"],
  lineNo: ["#", "#", "#", "#"],
  description: ["Περιγραφή", "Description", "Beschreibung", "Descrizione"],
  qty: ["Ποσ.", "Qty", "Menge", "Q.tà"],
  unitPrice: ["Τιμή μον.", "Unit price", "Einzelpreis", "Prezzo unit."],
  discount: ["Έκπτ.", "Disc.", "Rabatt", "Sconto"],
  vat: ["ΦΠΑ", "VAT", "MwSt.", "IVA"],
  net: ["Καθαρή αξία", "Net", "Netto", "Imponibile"],
  vatRate: ["Συντ. ΦΠΑ", "VAT rate", "MwSt.-Satz", "Aliquota IVA"],
  vatExemption: ["Απαλλαγή ΦΠΑ", "VAT exemption", "MwSt.-Befreiung", "Esenzione IVA"],
  withholding: ["Παρακράτηση φόρου", "Withholding tax", "Quellensteuer", "Ritenuta d'acconto"],
  stampDuty: ["Χαρτόσημο", "Stamp duty", "Stempelsteuer", "Imposta di bollo"],
  totalNet: ["Καθαρή αξία", "Net total", "Nettobetrag", "Totale imponibile"],
  totalVat: ["ΦΠΑ", "VAT", "MwSt.", "IVA"],
  payable: ["Πληρωτέο", "Total due", "Zahlbetrag", "Totale da pagare"],
  paidRemaining: ["Εισπραχθέν / Υπόλοιπο", "Paid / Balance", "Bezahlt / Offen", "Pagato / Saldo"],
  quoteNotice: ["Προσφορά – δεν αποτελεί φορολογικό παραστατικό.", "Quotation – not a tax document.", "Angebot – kein steuerliches Dokument.", "Preventivo – non costituisce documento fiscale."],
  quoteValid30: ["Ισχύει για 30 ημέρες.", "Valid for 30 days.", "Gültig für 30 Tage.", "Valido per 30 giorni."],
  notTransmitted: ["Δεν έχει διαβιβαστεί στο myDATA", "Not yet transmitted to myDATA (AADE)", "Noch nicht an myDATA (AADE) übermittelt", "Non ancora trasmesso a myDATA (AADE)"],
  draft: ["ΠΡΟΧΕΙΡΟ – χωρίς φορολογική ισχύ", "DRAFT – no fiscal validity", "ENTWURF – ohne steuerliche Gültigkeit", "BOZZA – senza validità fiscale"],
  cancelled: ["ΑΚΥΡΩΜΕΝΟ", "CANCELLED", "STORNIERT", "ANNULLATO"],
  accepted: ["ΑΠΟΔΕΚΤΗ", "ACCEPTED", "ANGENOMMEN", "ACCETTATO"],
  acceptedBy: ["Αποδεκτή ηλεκτρονικά από", "Electronically accepted by", "Elektronisch angenommen von", "Accettato elettronicamente da"],
  rejected: ["ΑΠΟΡΡΙΦΘΗΚΕ", "REJECTED", "ABGELEHNT", "RIFIUTATO"],
  converted: ["ΤΙΜΟΛΟΓΗΘΗΚΕ", "INVOICED", "FAKTURIERT", "FATTURATO"],
  selfPricing: ["Αυτοτιμολόγηση", "Self-billing", "Gutschriftverfahren", "Autofatturazione"],
  branch: ["Εγκατάσταση", "Branch", "Niederlassung", "Sede"],
  elp: [
    "Παραστατικό σύμφωνα με τα Ε.Λ.Π. (ν. 4308/2014)",
    "Issued in accordance with Greek Accounting Standards (Law 4308/2014)",
    "Ausgestellt gemäß den griechischen Rechnungslegungsstandards (Gesetz 4308/2014)",
    "Emesso ai sensi dei Principi Contabili Greci (Legge 4308/2014)",
  ],
  issuedWith: ["Εκδόθηκε με Σύνολο ERP", "Issued with Synolo ERP", "Erstellt mit Synolo ERP", "Emesso con Synolo ERP"],
  page: ["Σελίδα", "Page", "Seite", "Pagina"],
  noLines: ["Χωρίς γραμμές", "No lines", "Keine Positionen", "Nessuna riga"],
  signature: ["Υπογραφή αποδοχής", "Acceptance signature", "Unterschrift", "Firma"],
  qrAlt: ["QR code myDATA", "myDATA QR code", "myDATA-QR-Code", "Codice QR myDATA"],
  ip: ["IP", "IP", "IP", "IP"],
} satisfies Record<string, Tuple>;

export type LabelKey = keyof typeof L;

const IDX: Record<DocumentLanguage, 0 | 1 | 2 | 3> = { el: 0, en: 1, de: 2, it: 3 };

function pick(t: Tuple, lang: DocLang): string {
  if (lang === "bilingual") {
    const [el, en] = t;
    return el === en ? el : `${el} / ${en}`;
  }
  return t[IDX[lang]];
}

export function label(key: LabelKey, lang: DocLang): string {
  return pick(L[key], lang);
}

const PAYMENT_METHOD_I18N: Record<number, Tuple> = {
  1: ["Επαγγελματικός Λογαριασμός Πληρωμών Ημεδαπής", "Bank transfer (domestic business account)", "Banküberweisung (inländisches Geschäftskonto)", "Bonifico bancario (conto aziendale nazionale)"],
  2: ["Επαγγελματικός Λογαριασμός Πληρωμών Αλλοδαπής", "Bank transfer (foreign business account)", "Banküberweisung (ausländisches Geschäftskonto)", "Bonifico bancario (conto aziendale estero)"],
  3: ["Μετρητά", "Cash", "Barzahlung", "Contanti"],
  4: ["Επιταγή", "Cheque", "Scheck", "Assegno"],
  5: ["Επί Πιστώσει", "On credit", "Auf Rechnung", "A credito"],
  6: ["Ηλεκτρονική τραπεζική", "Web banking", "Online-Banking", "Web banking"],
  7: ["POS / e-POS", "Card (POS / e-POS)", "Karte (POS / e-POS)", "Carta (POS / e-POS)"],
  8: ["Άμεσες Πληρωμές IRIS", "IRIS instant payment", "IRIS-Sofortzahlung", "Pagamento istantaneo IRIS"],
};

export function paymentMethodLabel(code: number | null | undefined, lang: DocLang): string {
  const t = code != null ? PAYMENT_METHOD_I18N[code] : undefined;
  return t ? pick(t, lang) : "";
}

const UNIT_I18N: Record<number, Tuple> = {
  1: ["τεμ.", "pcs", "Stk.", "pz."],
  2: ["kg", "kg", "kg", "kg"],
  3: ["lt", "l", "l", "l"],
  4: ["m", "m", "m", "m"],
  5: ["m²", "m²", "m²", "m²"],
  6: ["m³", "m³", "m³", "m³"],
  7: ["υπηρ.", "svc", "Leist.", "serv."],
};

export function unitShort(code: number, lang: DocLang): string {
  const t = UNIT_I18N[code] ?? UNIT_I18N[1];
  if (lang === "bilingual") return t[0];
  return t[IDX[lang]];
}

const LOCALES: Record<DocumentLanguage, string> = { el: "el-GR", en: "en-GB", de: "de-DE", it: "it-IT" };

/** Ποσό με τοπική μορφοποίηση της γλώσσας του παραστατικού (1.234,56 € / €1,234.56 / 1.234,56 €). */
export function formatDocMoney(n: number, currency: string, lang: DocLang): string {
  const locale = lang === "bilingual" ? LOCALES.el : LOCALES[lang];
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR" }).format(n);
}

/** Ημερομηνία ISO → μορφή της γλώσσας (dd/mm/yyyy για EL/EN/IT, dd.mm.yyyy για DE). */
export function formatDocDate(iso: string | null | undefined, lang: DocLang): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return lang === "de" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
}

/** Ονομασία τύπου παραστατικού στα αγγλικά (για δίγλωσσο/αγγλικό). */
export const DOCUMENT_TYPE_EN: Record<string, string> = {
  "1.1": "Sales Invoice",
  "1.2": "Sales Invoice / Intra-community supply",
  "1.3": "Sales Invoice / Export (third countries)",
  "1.4": "Sales Invoice / On behalf of third parties",
  "1.5": "Sales Invoice / Third-party sales settlement",
  "1.6": "Sales Invoice / Supplementary",
  "2.1": "Service Invoice",
  "2.2": "Service Invoice / Intra-community services",
  "2.3": "Service Invoice / Services to third countries",
  "2.4": "Service Invoice / Supplementary",
  "3.1": "Acquisition Title (non-liable issuer)",
  "3.2": "Acquisition Title (refusal of issuance)",
  "5.1": "Credit Note / Related",
  "5.2": "Credit Note / Unrelated",
  "6.1": "Self-delivery document",
  "6.2": "Self-use document",
  "7.1": "Contract – Income",
  "8.1": "Rent – Income",
  "8.2": "Climate resilience levy",
  "9.3": "Delivery Note",
  "11.1": "Retail Sales Receipt",
  "11.2": "Service Receipt",
  "11.3": "Simplified Invoice",
  "11.4": "Retail Credit Note",
  "11.5": "Retail Receipt on behalf of third parties",
  "13.1": "Expenses – Retail purchases",
  "13.2": "Retail services received",
  "13.3": "Shared building expenses",
  "13.4": "Subscriptions",
  "13.30": "Entity documents (dynamic)",
  "13.31": "Retail credit note (expenses)",
  "17.1": "Payroll",
  "17.2": "Depreciation",
  "17.3": "Income adjustment entries – accounting basis",
  "17.4": "Income adjustment entries – tax basis",
  "17.5": "Expense adjustment entries – accounting basis",
  "17.6": "Expense adjustment entries – tax basis",
  QUOTE: "Quotation",
};

const DOCUMENT_TYPE_DE: Record<string, string> = {
  "1.1": "Rechnung",
  "1.2": "Rechnung / Innergemeinschaftliche Lieferung",
  "1.3": "Rechnung / Ausfuhr (Drittland)",
  "1.6": "Rechnung / Ergänzung",
  "2.1": "Rechnung über Dienstleistungen",
  "2.2": "Rechnung / Innergemeinschaftliche Dienstleistungen",
  "2.3": "Rechnung / Dienstleistungen an Drittländer",
  "2.4": "Rechnung über Dienstleistungen / Ergänzung",
  "5.1": "Gutschrift / mit Bezug",
  "5.2": "Gutschrift / ohne Bezug",
  "9.3": "Lieferschein",
  "11.1": "Kassenbeleg",
  "11.2": "Quittung über Dienstleistungen",
  "11.3": "Vereinfachte Rechnung",
  "11.4": "Gutschrift Einzelhandel",
  QUOTE: "Angebot",
};

const DOCUMENT_TYPE_IT: Record<string, string> = {
  "1.1": "Fattura di vendita",
  "1.2": "Fattura / Cessione intracomunitaria",
  "1.3": "Fattura / Esportazione (paesi terzi)",
  "1.6": "Fattura / Integrativa",
  "2.1": "Fattura per prestazione di servizi",
  "2.2": "Fattura / Servizi intracomunitari",
  "2.3": "Fattura / Servizi verso paesi terzi",
  "2.4": "Fattura servizi / Integrativa",
  "5.1": "Nota di credito / collegata",
  "5.2": "Nota di credito / non collegata",
  "9.3": "Documento di trasporto",
  "11.1": "Ricevuta di vendita al dettaglio",
  "11.2": "Ricevuta per servizi",
  "11.3": "Fattura semplificata",
  "11.4": "Nota di credito al dettaglio",
  QUOTE: "Preventivo",
};

export function documentTitle(code: string, elName: string, lang: DocLang): string {
  const en = DOCUMENT_TYPE_EN[code] ?? elName;
  switch (lang) {
    case "el":
      return elName;
    case "en":
      return en;
    case "de":
      return DOCUMENT_TYPE_DE[code] ?? en;
    case "it":
      return DOCUMENT_TYPE_IT[code] ?? en;
    default:
      return `${elName} / ${en}`;
  }
}

/**
 * Επιλογή γλώσσας παραστατικού:
 * 1. ρητή επιλογή (?lang=), 2. γλώσσα πελάτη (EN → δίγλωσσο όταν είναι ενεργό, DE/IT → η γλώσσα),
 * 3. δίγλωσσο για πελάτες εξωτερικού όταν είναι ενεργό, 4. ελληνικά.
 */
export function resolveDocLang(opts: { customerCountry?: string | null; customerLanguage?: string | null; bilingualEnabled: boolean; override?: string | null }): DocLang {
  if (isDocLang(opts.override)) return opts.override;
  const cl = opts.customerLanguage;
  if (cl === "de" || cl === "it") return cl;
  if (cl === "en") return opts.bilingualEnabled ? "bilingual" : "en";
  if (opts.bilingualEnabled && (opts.customerCountry ?? "GR") !== "GR") return "bilingual";
  return "el";
}
