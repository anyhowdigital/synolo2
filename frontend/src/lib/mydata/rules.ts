import type { Invoice, InvoiceLine } from "@/db/schema";
import { getDocumentType, type InvoiceTypeCode } from "@/lib/greek/document-types";
import { EU_COUNTRIES } from "@/lib/greek/f2";

/**
 * Επιχειρησιακοί κανόνες myDATA ανά τύπο παραστατικού (κανάλι ERP).
 *
 * Πηγές: ΑΑΔΕ myDATA REST API – Παράρτημα «Επιχειρησιακοί κανόνες» & κωδικοί σφαλμάτων
 * 204 «{Field} is mandatory for this invoice type», 205 «{Field} is forbidden for this invoice type»,
 * 215/216/218 (ΦΠΑ ανά τύπο), 242/243/244 (χώρα αντισυμβαλλομένου), 308 (κατηγορία χαρακτηρισμού ανά τύπο).
 *
 * Οι κανόνες εφαρμόζονται (α) στο XML που παράγουμε – παραλείπουμε ό,τι απαγορεύεται – και
 * (β) ως προ-έλεγχος πριν την έκδοση/διαβίβαση, με σαφή μηνύματα στα ελληνικά.
 */
export interface InvoiceTypeRules {
  /** Αποστολή quantity/measurementUnit στις γραμμές. `inherit`: όπως ο συσχετιζόμενος τύπος (πιστωτικά). */
  lineQuantity: "send" | "omit" | "inherit";
  /** Αντισυμβαλλόμενος (counterpart). */
  counterpart: "required" | "forbidden";
  /** Χώρα αντισυμβαλλομένου που απαιτεί η ΑΑΔΕ. */
  counterpartCountry: "GR" | "EU" | "NON_EU" | "ANY";
  /** ΦΠΑ: any · exempt = κατηγορία 7 (0% με αιτία) ή 8 · none = μόνο κατηγορία 8 (χωρίς ΦΠΑ). */
  vat: "any" | "exempt" | "none";
  /** Αποστολή paymentMethods. */
  paymentMethods: "send" | "omit";
  /** correlatedInvoices. */
  correlation: "required" | "optional" | "forbidden";
  /** Στοιχεία διακίνησης (dispatchDate/movePurpose). */
  dispatch: "required" | "forbidden";
  /** Χαρακτηρισμοί: income (icls), expense (ecls) ή καθόλου. */
  classifications: "income" | "expense" | "none";
  /** Επιτρεπόμενες κατηγορίες χαρακτηρισμού (κενό = χωρίς περιορισμό). */
  allowedCategories: string[];
}

const GOODS_CATEGORIES = ["category1_1", "category1_2", "category1_3", "category1_4", "category1_5", "category1_7", "category1_8", "category1_9", "category1_10", "category1_95"];
const SERVICE_CATEGORIES = ["category1_3", "category1_5", "category1_7", "category1_8", "category1_9", "category1_10", "category1_95"];

const base: InvoiceTypeRules = {
  lineQuantity: "send",
  counterpart: "required",
  counterpartCountry: "GR",
  vat: "any",
  paymentMethods: "send",
  correlation: "optional",
  dispatch: "forbidden",
  classifications: "income",
  allowedCategories: GOODS_CATEGORIES,
};

const r = (o: Partial<InvoiceTypeRules>): InvoiceTypeRules => ({ ...base, ...o });

const service = (o: Partial<InvoiceTypeRules> = {}) => r({ lineQuantity: "omit", allowedCategories: SERVICE_CATEGORIES, ...o });
const retail = (o: Partial<InvoiceTypeRules> = {}) => r({ counterpart: "forbidden", counterpartCountry: "ANY", ...o });
const expenseSide = (o: Partial<InvoiceTypeRules> = {}) => r({ lineQuantity: "omit", classifications: "expense", allowedCategories: [], counterpartCountry: "ANY", ...o });
const adjustment = (o: Partial<InvoiceTypeRules> = {}) => r({ lineQuantity: "omit", counterpart: "forbidden", counterpartCountry: "ANY", paymentMethods: "omit", vat: "none", correlation: "forbidden", allowedCategories: [], ...o });

export const INVOICE_TYPE_RULES: Record<InvoiceTypeCode, InvoiceTypeRules> = {
  QUOTE: r({ counterpartCountry: "ANY", classifications: "none", allowedCategories: [] }),
  // Δελτία διακίνησης: χωρίς πληρωμή και χαρακτηρισμούς, με στοιχεία διακίνησης. Ο ΦΠΑ μηδενίζεται στο XML (κατηγορία 8).
  "9.3": r({ counterpartCountry: "ANY", paymentMethods: "omit", dispatch: "required", classifications: "none", allowedCategories: [] }),
  // Τιμολόγια πώλησης (αγαθά)
  "1.1": r({}),
  "1.2": r({ counterpartCountry: "EU", vat: "exempt" }),
  "1.3": r({ counterpartCountry: "NON_EU", vat: "exempt" }),
  "1.4": r({ counterpartCountry: "ANY", allowedCategories: ["category1_7", ...GOODS_CATEGORIES] }),
  "1.5": r({ counterpartCountry: "ANY", lineQuantity: "omit" }),
  "1.6": r({ counterpartCountry: "ANY", correlation: "required" }),
  // Τιμολόγια παροχής υπηρεσιών: ΔΕΝ αποστέλλεται ποσότητα/μονάδα (σφάλμα 205), κατηγορία 1_1/1_2 απαγορεύεται (σφάλμα 308).
  "2.1": service(),
  "2.2": service({ counterpartCountry: "EU", vat: "exempt" }),
  "2.3": service({ counterpartCountry: "NON_EU", vat: "exempt" }),
  "2.4": service({ counterpartCountry: "ANY", correlation: "required" }),
  // Τίτλοι κτήσης: εκδίδει ο λήπτης, χωρίς ΦΠΑ, χαρακτηρισμοί εξόδων.
  "3.1": expenseSide({ vat: "none" }),
  "3.2": expenseSide({ vat: "none" }),
  // Πιστωτικά: ποσότητα όπως το αρχικό (5.1) ή παράλειψη (5.2), αντισυμβαλλόμενος οποιασδήποτε χώρας.
  "5.1": r({ counterpartCountry: "ANY", lineQuantity: "inherit", correlation: "required", allowedCategories: [] }),
  "5.2": r({ counterpartCountry: "ANY", lineQuantity: "omit", correlation: "forbidden", allowedCategories: [] }),
  // Αυτοπαραδόσεις / ιδιοχρησιμοποιήσεις: χωρίς αντισυμβαλλόμενο και πληρωμή.
  "6.1": retail({ paymentMethods: "omit", allowedCategories: ["category1_6"] }),
  "6.2": retail({ paymentMethods: "omit", allowedCategories: ["category1_6"] }),
  // Συμβόλαιο – έσοδο, ενοίκια, τέλος ανθεκτικότητας: χωρίς ποσότητα.
  "7.1": service({ counterpartCountry: "ANY", allowedCategories: [] }),
  "8.1": service({ counterpartCountry: "ANY", allowedCategories: ["category1_5", "category1_95"] }),
  "8.2": retail({ lineQuantity: "omit", vat: "none", allowedCategories: ["category1_95", "category1_5"] }),
  // Λιανική: χωρίς αντισυμβαλλόμενο. ΑΠΥ (11.2) χωρίς ποσότητα.
  "11.1": retail(),
  "11.2": retail({ lineQuantity: "omit", allowedCategories: SERVICE_CATEGORIES }),
  "11.3": retail(),
  "11.4": retail({ lineQuantity: "inherit", correlation: "required", allowedCategories: [] }),
  "11.5": retail({ allowedCategories: ["category1_7", ...GOODS_CATEGORIES] }),
  // Έξοδα λιανικής που καταχωρεί ο λήπτης.
  "13.1": expenseSide(),
  "13.2": expenseSide(),
  "13.3": expenseSide(),
  "13.4": expenseSide(),
  "13.30": expenseSide(),
  "13.31": expenseSide({ correlation: "optional" }),
  // Εγγραφές τακτοποίησης.
  "17.1": adjustment({ classifications: "expense" }),
  "17.2": adjustment({ classifications: "expense" }),
  "17.3": adjustment(),
  "17.4": adjustment(),
  "17.5": adjustment({ classifications: "expense" }),
  "17.6": adjustment({ classifications: "expense" }),
};

export function rulesFor(code: string): InvoiceTypeRules {
  return INVOICE_TYPE_RULES[code as InvoiceTypeCode] ?? base;
}

/** Αποστέλλεται ποσότητα/μονάδα για τον τύπο; Για πιστωτικά εξαρτάται από τον συσχετιζόμενο τύπο. */
export function sendsLineQuantity(code: string, correlatedType?: string | null): boolean {
  const rule = rulesFor(code).lineQuantity;
  if (rule === "inherit") return correlatedType ? sendsLineQuantity(correlatedType) : false;
  return rule === "send";
}

function countryKind(country: string | null | undefined): "GR" | "EU" | "NON_EU" {
  const c = (country || "GR").toUpperCase();
  if (c === "GR" || c === "EL") return "GR";
  return EU_COUNTRIES.has(c) ? "EU" : "NON_EU";
}

const COUNTRY_LABEL = { GR: "Ελλάδα", EU: "χώρα της ΕΕ (εκτός Ελλάδας)", NON_EU: "τρίτη χώρα (εκτός ΕΕ)", ANY: "" } as const;

export interface MyDataPrecheckInput {
  invoice: Pick<Invoice, "invoiceType" | "customerAfm" | "customerCountry" | "correlatedInvoiceId" | "movePurpose" | "paymentMethod">;
  lines: Pick<InvoiceLine, "lineNumber" | "vatCategory" | "vatExemptionCategory" | "vatAmount" | "classificationCategory" | "classificationType">[];
  /** Τύπος του συσχετιζόμενου παραστατικού (για πιστωτικά). */
  correlatedType?: string | null;
}

/**
 * Προ-έλεγχος συμβατότητας με τους κανόνες της ΑΑΔΕ. Επιστρέφει λίστα σφαλμάτων (κενή = OK).
 * Ελέγχει ό,τι η ΑΑΔΕ θα απέρριπτε με βεβαιότητα· ό,τι απλώς «δεν αποστέλλεται» το χειρίζεται ο XML builder.
 */
export function precheckMyData({ invoice, lines, correlatedType }: MyDataPrecheckInput): string[] {
  const docType = getDocumentType(invoice.invoiceType);
  if (docType.kind === "quote") return [];
  const rules = rulesFor(invoice.invoiceType);
  const errors: string[] = [];
  const label = `${docType.short} (${docType.code})`;

  if (rules.counterpart === "required" && !invoice.customerAfm && !docType.counterpartOptionalAfm) {
    errors.push(`Το ${label} απαιτεί αντισυμβαλλόμενο με ΑΦΜ/VAT.`);
  }
  if (rules.counterpart === "required" && rules.counterpartCountry !== "ANY") {
    const kind = countryKind(invoice.customerCountry);
    if (kind !== rules.counterpartCountry) {
      errors.push(
        `Το ${label} απαιτεί αντισυμβαλλόμενο από ${COUNTRY_LABEL[rules.counterpartCountry]} – ο πελάτης έχει χώρα ${invoice.customerCountry || "GR"}. ` +
          (rules.counterpartCountry === "GR"
            ? "Για πελάτη ΕΕ χρησιμοποιήστε τύπο 1.2/2.2 και για τρίτη χώρα 1.3/2.3."
            : "Επιλέξτε τον αντίστοιχο τύπο παραστατικού για τη χώρα του πελάτη."),
      );
    }
  }

  for (const l of lines) {
    if (rules.vat === "exempt" && l.vatCategory !== 7 && l.vatCategory !== 8) {
      errors.push(`Γραμμή ${l.lineNumber}: το ${label} εκδίδεται χωρίς ΦΠΑ – επιλέξτε ΦΠΑ 0% (κατηγορία 7) με αιτία εξαίρεσης (π.χ. άρθρο 28 για ενδοκοινοτικές).`);
    }
    if (rules.vat === "none" && l.vatCategory !== 8) {
      errors.push(`Γραμμή ${l.lineNumber}: το ${label} δεν επιδέχεται ΦΠΑ – επιλέξτε «Χωρίς ΦΠΑ» (κατηγορία 8).`);
    }
    if (l.vatCategory === 7 && !l.vatExemptionCategory) {
      errors.push(`Γραμμή ${l.lineNumber}: ΦΠΑ 0% απαιτεί αιτία εξαίρεσης (vatExemptionCategory).`);
    }
    if (rules.classifications !== "none" && rules.allowedCategories.length && l.classificationCategory && !rules.allowedCategories.includes(l.classificationCategory)) {
      errors.push(`Γραμμή ${l.lineNumber}: η κατηγορία χαρακτηρισμού «${l.classificationCategory}» δεν επιτρέπεται για ${label}. Επιτρέπονται: ${rules.allowedCategories.join(", ")}.`);
    }
    if (rules.classifications === "income" && (!l.classificationCategory || !l.classificationType)) {
      errors.push(`Γραμμή ${l.lineNumber}: απαιτείται χαρακτηρισμός εσόδου (κατηγορία και τύπος Ε3).`);
    }
  }

  if (rules.correlation === "required" && !invoice.correlatedInvoiceId) {
    errors.push(`Το ${label} απαιτεί συσχέτιση με το αρχικό παραστατικό.`);
  }
  if (rules.dispatch === "required" && !invoice.movePurpose) {
    errors.push(`Το ${label} απαιτεί σκοπό διακίνησης (movePurpose).`);
  }
  if (rules.paymentMethods === "send" && !invoice.paymentMethod) {
    errors.push(`Το ${label} απαιτεί τρόπο πληρωμής.`);
  }
  if (correlatedType && rules.correlation !== "forbidden" && docType.credit) {
    const original = getDocumentType(correlatedType);
    if (original.retail !== docType.retail) {
      errors.push(`Πιστωτικό ${label} δεν μπορεί να συσχετιστεί με ${original.short} (${original.code}) – λιανική/χονδρική πρέπει να συμφωνούν.`);
    }
  }
  return errors;
}
