import type { Customer, Invoice, InvoiceLine, Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { getVatCategory, VAT_EXEMPTION_REASONS } from "@/lib/greek/vat";
import { round2 } from "@/lib/invoice/totals";

const CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
const PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";
/** Κοινό σημείο παραλαβής του ελληνικού Δημοσίου (ΚΕ.Δ. / GSIS). */
export const GREEK_PUBLIC_ENDPOINT = "9933:997001671";

function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(n: number): string {
  return round2(n).toFixed(2);
}

function el(name: string, value: string | number | null | undefined, attrs = ""): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}${attrs}>${esc(value)}</${name}>`;
}

/** Μονάδα μέτρησης myDATA → UN/ECE Rec 20. */
function unitCode(measurementUnit: number): string {
  return { 1: "C62", 2: "KGM", 3: "LTR", 4: "MTR", 5: "MTK", 6: "MTQ", 7: "C62" }[measurementUnit] ?? "C62";
}

export interface VatGroup {
  category: string;
  percent: number | null;
  taxable: number;
  tax: number;
  exemptionCode?: string;
  exemptionReason?: string;
}

/** Αντιστοίχιση κατηγορίας ΦΠΑ myDATA σε PEPPOL TaxCategory (UNCL5305) + VATEX αιτία. */
export function peppolTaxCategory(vatCategory: number, exemptionCategory: number | null) {
  const cat = getVatCategory(vatCategory);
  if (cat.rate > 0) return { category: "S", percent: cat.rate, exemptionCode: undefined as string | undefined, exemptionReason: undefined as string | undefined };
  if (vatCategory === 8) return { category: "O", percent: null, exemptionCode: "VATEX-EU-O", exemptionReason: "Εκτός πεδίου εφαρμογής ΦΠΑ" };
  const reason = VAT_EXEMPTION_REASONS.find((r) => r.code === exemptionCategory)?.label ?? "Απαλλαγή ΦΠΑ";
  if (exemptionCategory === 14) return { category: "K", percent: 0, exemptionCode: "VATEX-EU-IC", exemptionReason: reason };
  if (exemptionCategory === 16) return { category: "AE", percent: 0, exemptionCode: "VATEX-EU-AE", exemptionReason: reason };
  if (exemptionCategory && [8, 9, 10, 11, 12, 13].includes(exemptionCategory)) return { category: "G", percent: 0, exemptionCode: "VATEX-EU-G", exemptionReason: reason };
  return { category: "E", percent: 0, exemptionCode: "VATEX-EU-132", exemptionReason: reason };
}

export function vatGroups(lines: InvoiceLine[]): VatGroup[] {
  const map = new Map<string, VatGroup>();
  for (const l of lines) {
    const t = peppolTaxCategory(l.vatCategory, l.vatExemptionCategory);
    const key = `${t.category}|${t.percent ?? "-"}|${t.exemptionCode ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.taxable = round2(existing.taxable + l.netValue);
      existing.tax = round2(existing.tax + l.vatAmount);
    } else {
      map.set(key, { category: t.category, percent: t.percent, taxable: round2(l.netValue), tax: round2(l.vatAmount), exemptionCode: t.exemptionCode, exemptionReason: t.exemptionReason });
    }
  }
  return [...map.values()];
}

/** UNCL1001: 380 τιμολόγιο, 381 πιστωτικό. */
export function ublTypeCode(invoiceType: string): string {
  return getDocumentType(invoiceType).credit ? "381" : "380";
}

export interface B2GReferences {
  buyerReference: string;
  contractAdam: string;
  projectReference: string;
  orderReference: string;
  buyerIdentifier: string;
  endpointId: string;
  cpv: string;
}

/** BT-1 κατά Greek CIUS (GR-R-001): ΑΦΜ|ηη/ΜΜ/εεεε|εγκατάσταση|τύπος myDATA|σειρά|αριθμός. */
export function greekInvoiceId(org: Organization, invoice: Invoice): string {
  const d = invoice.issueDate;
  const date = /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d;
  return [org.afm, date, String(invoice.branch ?? 0), invoice.invoiceType, invoice.seriesCode || "0", String(invoice.number)].join("|");
}

/** BT-11: 1|ΑΔΑ ανάληψης (τακτικός), 2|ενάριθμος ΠΔΕ, 3|ΑΔΑ (λοιποί). */
export function isValidProjectReference(v: string) {
  return /^[123]\|[^|\s]+$/.test(v.trim());
}

/** CPV: 8 ψηφία + προαιρετικό «-» και ψηφίο ελέγχου (π.χ. 72000000-5). */
export function isValidCpv(v: string) {
  return /^\d{8}(-\d)?$/.test(v.trim());
}

/** Οι αναφορές B2G του παραστατικού, με fallback στα στοιχεία του πελάτη. */
export function b2gReferences(invoice: Invoice, customer: Customer | null): B2GReferences {
  return {
    buyerReference: invoice.b2gBuyerReference || customer?.b2gBuyerReference || "",
    contractAdam: invoice.b2gContractAdam || customer?.b2gContractAdam || "",
    projectReference: invoice.b2gProjectReference || customer?.b2gProjectReference || "",
    orderReference: invoice.b2gOrderReference || customer?.b2gOrderReference || "",
    buyerIdentifier: customer?.b2gBuyerIdentifier || "",
    endpointId: GREEK_PUBLIC_ENDPOINT,
    cpv: invoice.b2gCpv || customer?.b2gCpv || "",
  };
}

function party(opts: { endpointId: string; identifier?: string; name: string; vat: string; address: string; city: string; postalCode: string; country: string; email?: string; phone?: string }) {
  const [scheme, endpointValue] = opts.endpointId.includes(":") ? opts.endpointId.split(":") : ["9933", opts.endpointId];
  return (
    `<cac:Party>` +
    el("cbc:EndpointID", endpointValue, ` schemeID="${esc(scheme)}"`) +
    (opts.identifier ? `<cac:PartyIdentification>${el("cbc:ID", opts.identifier)}</cac:PartyIdentification>` : "") +
    `<cac:PartyName>${el("cbc:Name", opts.name)}</cac:PartyName>` +
    `<cac:PostalAddress>` +
    el("cbc:StreetName", opts.address) +
    el("cbc:CityName", opts.city) +
    el("cbc:PostalZone", opts.postalCode) +
    `<cac:Country>${el("cbc:IdentificationCode", opts.country || "GR")}</cac:Country>` +
    `</cac:PostalAddress>` +
    (opts.vat ? `<cac:PartyTaxScheme>${el("cbc:CompanyID", `EL${opts.vat}`)}<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme></cac:PartyTaxScheme>` : "") +
    `<cac:PartyLegalEntity>${el("cbc:RegistrationName", opts.name)}${el("cbc:CompanyID", opts.vat)}</cac:PartyLegalEntity>` +
    (opts.email || opts.phone ? `<cac:Contact>${el("cbc:Telephone", opts.phone)}${el("cbc:ElectronicMail", opts.email)}</cac:Contact>` : "") +
    `</cac:Party>`
  );
}

export interface UblInput {
  org: Organization;
  invoice: Invoice;
  lines: InvoiceLine[];
  customer: Customer | null;
  /** Εμφανιζόμενος αριθμός παραστατικού (BT-1). */
  documentNumber: string;
  precedingInvoice?: { documentNumber: string; issueDate: string } | null;
  /** ΜΑΡΚ myDATA (GR-R-004: υποχρεωτικό για ελληνικό εκδότη). */
  mark?: string | null;
  /** Δημόσιος σύνδεσμος παραστατικού (GR-S-008 INVOICE URL). */
  invoiceUrl?: string | null;
  /** Επανυποβολή μετά από Soft Reject του φορέα (BG-24 ##SOFT|REJECT##). */
  softReject?: boolean;
  /** CPV ανά γραμμή (fallback στο CPV της σύμβασης). */
  lineCpv?: Record<string, string>;
}

export const B2G_ADJUSTMENT_ERROR = "Το B2G για παρακρατήσεις/χαρτόσημο χρειάζεται επαληθευμένη αντιστοίχιση του παρόχου. Δεν δημιουργείται ούτε αποστέλλεται XML με ασυνεπή σύνολα. Το παραστατικό παραμένει διαθέσιμο για τις υπόλοιπες λειτουργίες.";

export function hasUnsupportedB2GAdjustments(invoice: Invoice) {
  return !!(invoice.totalWithheldAmount || invoice.totalStampDutyAmount) || Math.abs(round2(invoice.totalNetValue + invoice.totalVatAmount) - round2(invoice.totalGrossValue)) > 0.01;
}

/** Παραγωγή PEPPOL BIS Billing 3.0 (UBL 2.1) XML για τιμολόγηση Δημοσίου. */
export function buildPeppolInvoiceXml({ org, invoice, lines, customer, documentNumber, precedingInvoice, mark, invoiceUrl, softReject, lineCpv }: UblInput): string {
  if (hasUnsupportedB2GAdjustments(invoice)) throw new Error(B2G_ADJUSTMENT_ERROR);
  const credit = getDocumentType(invoice.invoiceType).credit;
  if ((org.country || "GR") === "GR" && !mark) throw new Error("Απαιτείται ΜΑΡΚ myDATA πριν τη διαβίβαση στο Δημόσιο (GR-R-004). Διαβιβάστε πρώτα στο myDATA.");
  if (getDocumentType(invoice.invoiceType).requiresCorrelation && !precedingInvoice) throw new Error("Το συσχετιζόμενο πιστωτικό χρειάζεται τον αριθμό του αρχικού παραστατικού (BT-25).");
  if (!lines.length || lines.some((l) => !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.netValue) || l.netValue < 0)) throw new Error("Οι γραμμές B2G χρειάζονται θετική ποσότητα και μη αρνητική καθαρή αξία.");
  if (Math.abs(round2(lines.reduce((s, l) => s + l.netValue, 0)) - invoice.totalNetValue) > 0.005 || Math.abs(round2(lines.reduce((s, l) => s + l.vatAmount, 0)) - invoice.totalVatAmount) > 0.005) throw new Error("Τα σύνολα του παραστατικού δεν συμφωνούν με τις γραμμές του. Ελέγξτε το παραστατικό πριν τη διαβίβαση.");
  const root = credit ? "CreditNote" : "Invoice";
  const lineTag = credit ? "CreditNoteLine" : "InvoiceLine";
  const refs = b2gReferences(invoice, customer);
  if (!refs.projectReference || !isValidProjectReference(refs.projectReference)) throw new Error("Η αναφορά έργου (BT-11) είναι υποχρεωτική με μορφή «1|ΑΔΑ», «2|ενάριθμος» ή «3|ΑΔΑ».");
  if (!refs.buyerIdentifier) throw new Error("Λείπει ο κωδικός Αναθέτουσας Αρχής (BT-46, C.A. label code).");
  const groups = vatGroups(lines);
  const cpvFor = (l: InvoiceLine) => (lineCpv?.[l.id] || refs.cpv || "").trim();
  const currency = invoice.currency || "EUR";
  const cur = ` currencyID="${esc(currency)}"`;
  const net = round2(invoice.totalNetValue);
  const vat = round2(invoice.totalVatAmount);
  const gross = round2(invoice.totalGrossValue);

  const taxSubtotals = groups
    .map(
      (g) =>
        `<cac:TaxSubtotal>` +
        el("cbc:TaxableAmount", money(g.taxable), cur) +
        el("cbc:TaxAmount", money(g.tax), cur) +
        `<cac:TaxCategory>` +
        el("cbc:ID", g.category) +
        (g.percent !== null ? el("cbc:Percent", g.percent.toFixed(2)) : "") +
        el("cbc:TaxExemptionReasonCode", g.exemptionCode) +
        el("cbc:TaxExemptionReason", g.exemptionReason) +
        `<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>` +
        `</cac:TaxCategory>` +
        `</cac:TaxSubtotal>`,
    )
    .join("");

  const invoiceLines = lines
    .map((l) => {
      const t = peppolTaxCategory(l.vatCategory, l.vatExemptionCategory);
      const allowance = l.discountPercent > 0 ? Math.max(0, round2(l.quantity * l.unitPrice - l.netValue)) : 0;
      // Quote the price for this base quantity, avoiding lossy division (e.g. 100 / 3).
      const price = round2(l.netValue + allowance);
      return (
        `<cac:${lineTag}>` +
        el("cbc:ID", l.lineNumber) +
        el(credit ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity", l.quantity, ` unitCode="${unitCode(l.measurementUnit)}"`) +
        el("cbc:LineExtensionAmount", money(l.netValue), cur) +
        (allowance > 0 ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Έκπτωση γραμμής</cbc:AllowanceChargeReason>${el("cbc:Amount", money(allowance), cur)}</cac:AllowanceCharge>` : "") +
        `<cac:Item>` +
        el("cbc:Name", l.description.slice(0, 200)) +
        (cpvFor(l) ? `<cac:CommodityClassification>${el("cbc:ItemClassificationCode", cpvFor(l), ` listID="STI"`)}</cac:CommodityClassification>` : "") +
        `<cac:ClassifiedTaxCategory>` +
        el("cbc:ID", t.category) +
        (t.percent !== null ? el("cbc:Percent", t.percent.toFixed(2)) : "") +
        `<cac:TaxScheme>${el("cbc:ID", "VAT")}</cac:TaxScheme>` +
        `</cac:ClassifiedTaxCategory>` +
        `</cac:Item>` +
        `<cac:Price>${el("cbc:PriceAmount", money(price), cur)}${el("cbc:BaseQuantity", l.quantity, ` unitCode="${unitCode(l.measurementUnit)}"`)}</cac:Price>` +
        `</cac:${lineTag}>`
      );
    })
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    el("cbc:CustomizationID", CUSTOMIZATION_ID) +
    el("cbc:ProfileID", PROFILE_ID) +
    el("cbc:ID", documentNumber) +
    el("cbc:IssueDate", invoice.issueDate) +
    (!credit ? el("cbc:DueDate", invoice.dueDate ?? invoice.issueDate) : "") +
    el(credit ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode", ublTypeCode(invoice.invoiceType)) +
    (invoice.notes ? el("cbc:Note", invoice.notes.slice(0, 500)) : "") +
    el("cbc:DocumentCurrencyCode", currency) +
    el("cbc:BuyerReference", refs.buyerReference || refs.buyerIdentifier) +
    (refs.orderReference ? `<cac:OrderReference>${el("cbc:ID", refs.orderReference)}</cac:OrderReference>` : "") +
    (precedingInvoice ? `<cac:BillingReference><cac:InvoiceDocumentReference>${el("cbc:ID", precedingInvoice.documentNumber)}${el("cbc:IssueDate", precedingInvoice.issueDate)}</cac:InvoiceDocumentReference></cac:BillingReference>` : "") +
    `<cac:ContractDocumentReference>${el("cbc:ID", refs.contractAdam || "0")}</cac:ContractDocumentReference>` +
    (mark ? `<cac:AdditionalDocumentReference>${el("cbc:ID", mark)}${el("cbc:DocumentDescription", "##M.AR.K##")}</cac:AdditionalDocumentReference>` : "") +
    (invoiceUrl ? `<cac:AdditionalDocumentReference>${el("cbc:ID", "INVOICE URL")}${el("cbc:DocumentDescription", "##INVOICE|URL##")}<cac:Attachment><cac:ExternalReference>${el("cbc:URI", invoiceUrl)}</cac:ExternalReference></cac:Attachment></cac:AdditionalDocumentReference>` : "") +
    (softReject ? `<cac:AdditionalDocumentReference>${el("cbc:ID", "SR")}${el("cbc:DocumentDescription", "##SOFT|REJECT##")}</cac:AdditionalDocumentReference>` : "") +
    (credit && !precedingInvoice
      ? `<cac:AdditionalDocumentReference>${el("cbc:ID", refs.projectReference)}<cbc:DocumentTypeCode>50</cbc:DocumentTypeCode>${el("cbc:DocumentDescription", "##PROJECT|REFERENCE##")}</cac:AdditionalDocumentReference>`
      : `<cac:ProjectReference>${el("cbc:ID", refs.projectReference)}</cac:ProjectReference>`) +
    `<cac:AccountingSupplierParty>` +
    party({
      endpointId: `9933:${org.afm}`,
      name: org.legalName || org.name,
      vat: org.afm,
      address: org.address ?? "",
      city: org.city ?? "",
      postalCode: org.postalCode ?? "",
      country: org.country || "GR",
      email: org.email ?? "",
      phone: org.phone ?? "",
    }) +
    `</cac:AccountingSupplierParty>` +
    `<cac:AccountingCustomerParty>` +
    party({
      endpointId: refs.endpointId,
      identifier: refs.buyerIdentifier,
      name: invoice.customerName || customer?.name || "",
      vat: invoice.customerAfm || customer?.afm || "",
      address: invoice.customerAddress || customer?.address || "",
      city: customer?.city ?? "",
      postalCode: customer?.postalCode ?? "",
      country: invoice.customerCountry || customer?.country || "GR",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
    }) +
    `</cac:AccountingCustomerParty>` +
    `<cac:PaymentMeans>${el("cbc:PaymentMeansCode", ({ 1: "30", 2: "30", 3: "10", 4: "20", 5: "1", 6: "30", 7: "48", 8: "30" } as Record<number, string>)[invoice.paymentMethod] ?? "1")}${credit ? el("cbc:PaymentDueDate", invoice.dueDate) : ""}${org.iban && [1, 2, 6, 8].includes(invoice.paymentMethod) ? `<cac:PayeeFinancialAccount>${el("cbc:ID", org.iban.replace(/\s+/g, ""))}</cac:PayeeFinancialAccount>` : ""}</cac:PaymentMeans>` +
    (invoice.dueDate ? `<cac:PaymentTerms>${el("cbc:Note", `Προθεσμία πληρωμής: ${invoice.dueDate}`)}</cac:PaymentTerms>` : "") +
    `<cac:TaxTotal>${el("cbc:TaxAmount", money(vat), cur)}${taxSubtotals}</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    el("cbc:LineExtensionAmount", money(net), cur) +
    el("cbc:TaxExclusiveAmount", money(net), cur) +
    el("cbc:TaxInclusiveAmount", money(gross), cur) +
    el("cbc:PayableAmount", money(gross), cur) +
    `</cac:LegalMonetaryTotal>` +
    invoiceLines +
    `</${root}>`;

  return xml;
}
