import type { Invoice, InvoiceLine, Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import { rulesFor, sendsLineQuantity } from "./rules";

/**
 * Δημιουργία XML `InvoicesDoc` σύμφωνα με το σχήμα ΑΑΔΕ myDATA v1.0.x.
 * Η σειρά των στοιχείων ακολουθεί αυστηρά το XSD (InvoicesDoc-v1.0.xsd).
 */

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return round2(n).toFixed(2);
}

function tag(name: string, value: string | number | null | undefined, indent = ""): string {
  if (value === null || value === undefined || value === "") return "";
  return `${indent}<${name}>${esc(value)}</${name}>\n`;
}

function classificationBlock(expense: boolean, type: string, category: string, amount: number, indent: string): string {
  const el = expense ? "expensesClassification" : "incomeClassification";
  const ns = expense ? "ecls" : "icls";
  let xml = `${indent}<${el}>\n`;
  xml += tag(`${ns}:classificationType`, type, indent + "  ");
  xml += tag(`${ns}:classificationCategory`, category, indent + "  ");
  xml += tag(`${ns}:amount`, money(amount), indent + "  ");
  xml += `${indent}</${el}>\n`;
  return xml;
}

export interface MyDataInvoiceInput {
  org: Organization;
  invoice: Invoice;
  lines: InvoiceLine[];
  /** MARK του αρχικού παραστατικού για πιστωτικά συσχετιζόμενα. */
  correlatedMark?: string | null;
  /** Τύπος του αρχικού παραστατικού (καθορίζει αν αποστέλλεται ποσότητα στα πιστωτικά). */
  correlatedType?: string | null;
}

export function buildInvoicesDocXml({ org, invoice, lines, correlatedMark, correlatedType }: MyDataInvoiceInput): string {
  const docType = getDocumentType(invoice.invoiceType);
  const rules = rulesFor(invoice.invoiceType);
  const isForeign = (invoice.customerCountry ?? "GR") !== "GR";
  const isDelivery = docType.kind === "delivery";
  // Ποσότητα/μονάδα: απαγορεύεται (σφάλμα 205) σε παροχή υπηρεσιών (2.x, 8.x, 11.2 κ.ά.).
  const withQuantity = sendsLineQuantity(invoice.invoiceType, correlatedType);
  // Χαρακτηρισμοί: εσόδων (icls), εξόδων (ecls) ή καθόλου (δελτία).
  const sendClassifications = rules.classifications !== "none";
  const useExpenseClassification = rules.classifications === "expense";
  const sendPayment = rules.paymentMethods === "send";
  // Δελτία διακίνησης: δεν είναι φορολογικά παραστατικά – αποστέλλονται χωρίς ΦΠΑ (κατηγορία 8, ποσό 0).
  const zeroVat = isDelivery;
  const issuerBranch = invoice.branch ?? 0;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" `;
  xml += `xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0" `;
  xml += `xmlns:ecls="https://www.aade.gr/myDATA/expensesClassificaton/v1.0" `;
  xml += `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" `;
  xml += `xsi:schemaLocation="http://www.aade.gr/myDATA/invoice/v1.0/InvoicesDoc-v1.0.xsd">\n`;
  xml += `  <invoice>\n`;

  // issuer
  xml += `    <issuer>\n`;
  xml += tag("vatNumber", org.afm, "      ");
  xml += tag("country", org.country || "GR", "      ");
  xml += tag("branch", issuerBranch, "      ");
  xml += `    </issuer>\n`;

  // counterpart – δεν αποστέλλεται σε παραστατικά λιανικής (ούτε όταν ο λήπτης είναι ιδιώτης χωρίς ΑΦΜ σε τίτλους κτήσης)
  const hasCounterpart = !docType.retail && !(docType.counterpartOptionalAfm && !invoice.customerAfm);
  if (hasCounterpart) {
    xml += `    <counterpart>\n`;
    xml += tag("vatNumber", invoice.customerAfm, "      ");
    xml += tag("country", invoice.customerCountry || "GR", "      ");
    xml += tag("branch", 0, "      ");
    if (isForeign) {
      xml += tag("name", invoice.customerName, "      ");
      xml += `      <address>\n`;
      xml += tag("street", invoice.customerAddress, "        ");
      xml += tag("postalCode", "-", "        ");
      xml += tag("city", "-", "        ");
      xml += `      </address>\n`;
    }
    xml += `    </counterpart>\n`;
  }

  // invoiceHeader
  xml += `    <invoiceHeader>\n`;
  xml += tag("series", invoice.seriesCode, "      ");
  xml += tag("aa", invoice.number, "      ");
  xml += tag("issueDate", invoice.issueDate.slice(0, 10), "      ");
  xml += tag("invoiceType", invoice.invoiceType, "      ");
  xml += tag("currency", invoice.currency || "EUR", "      ");
  if ((invoice.currency || "EUR") !== "EUR" && invoice.exchangeRate) xml += tag("exchangeRate", invoice.exchangeRate.toFixed(5), "      ");
  if (correlatedMark && rules.correlation !== "forbidden") xml += tag("correlatedInvoices", correlatedMark, "      ");
  if (invoice.selfPricing) xml += tag("selfPricing", "true", "      ");
  if (isDelivery) {
    xml += tag("dispatchDate", (invoice.dispatchDate ?? invoice.issueDate).slice(0, 10), "      ");
    xml += tag("dispatchTime", "00:00:00", "      ");
    if (invoice.vehicleNumber) xml += tag("vehicleNumber", invoice.vehicleNumber, "      ");
    if (invoice.movePurpose) xml += tag("movePurpose", invoice.movePurpose, "      ");
    if (invoice.deliveryAddress) {
      xml += `      <otherDeliveryNoteHeader>\n`;
      if (invoice.loadingAddress) {
        xml += `        <loadingAddress>\n`;
        xml += tag("street", invoice.loadingAddress, "          ");
        xml += tag("postalCode", "-", "          ");
        xml += tag("city", "-", "          ");
        xml += `        </loadingAddress>\n`;
      }
      xml += `        <deliveryAddress>\n`;
      xml += tag("street", invoice.deliveryAddress, "          ");
      xml += tag("postalCode", "-", "          ");
      xml += tag("city", "-", "          ");
      xml += `        </deliveryAddress>\n`;
      xml += `      </otherDeliveryNoteHeader>\n`;
    }
  }
  xml += `    </invoiceHeader>\n`;

  // paymentMethods – δεν αποστέλλονται σε δελτία διακίνησης, αυτοπαραδόσεις, εγγραφές τακτοποίησης
  if (sendPayment) {
    xml += `    <paymentMethods>\n`;
    xml += `      <paymentMethodDetails>\n`;
    xml += tag("type", invoice.paymentMethod, "        ");
    xml += tag("amount", money(invoice.totalGrossValue), "        ");
    xml += `      </paymentMethodDetails>\n`;
    xml += `    </paymentMethods>\n`;
  }

  // invoiceDetails
  const summaryClassifications = new Map<string, { type: string; category: string; amount: number }>();
  for (const line of lines) {
    xml += `    <invoiceDetails>\n`;
    xml += tag("lineNumber", line.lineNumber, "      ");
    if (withQuantity) {
      xml += tag("quantity", line.quantity, "      ");
      xml += tag("measurementUnit", line.measurementUnit, "      ");
    }
    xml += tag("netValue", money(line.netValue), "      ");
    xml += tag("vatCategory", zeroVat ? 8 : line.vatCategory, "      ");
    xml += tag("vatAmount", money(zeroVat ? 0 : line.vatAmount), "      ");
    if (!zeroVat && line.vatCategory === 7 && line.vatExemptionCategory) {
      xml += tag("vatExemptionCategory", line.vatExemptionCategory, "      ");
    }
    if (line.withholdingCategory && line.withheldAmount > 0) {
      xml += tag("withheldAmount", money(line.withheldAmount), "      ");
      xml += tag("withheldPercentCategory", line.withholdingCategory, "      ");
    }
    if (line.stampDutyCategory && line.stampDutyAmount > 0) {
      xml += tag("stampDutyAmount", money(line.stampDutyAmount), "      ");
      xml += tag("stampDutyPercentCategory", line.stampDutyCategory, "      ");
    }
    if (sendClassifications) {
      xml += classificationBlock(useExpenseClassification, line.classificationType, line.classificationCategory, line.netValue, "      ");
    }
    xml += `    </invoiceDetails>\n`;
    if (!sendClassifications) continue;

    const key = `${line.classificationType}|${line.classificationCategory}`;
    const agg = summaryClassifications.get(key) ?? {
      type: line.classificationType,
      category: line.classificationCategory,
      amount: 0,
    };
    agg.amount = round2(agg.amount + line.netValue);
    summaryClassifications.set(key, agg);
  }

  // invoiceSummary
  xml += `    <invoiceSummary>\n`;
  const totalVat = zeroVat ? 0 : invoice.totalVatAmount;
  const totalGross = zeroVat ? round2(invoice.totalNetValue - invoice.totalWithheldAmount + invoice.totalStampDutyAmount) : invoice.totalGrossValue;
  xml += tag("totalNetValue", money(invoice.totalNetValue), "      ");
  xml += tag("totalVatAmount", money(totalVat), "      ");
  xml += tag("totalWithheldAmount", money(invoice.totalWithheldAmount), "      ");
  xml += tag("totalFeesAmount", money(0), "      ");
  xml += tag("totalStampDutyAmount", money(invoice.totalStampDutyAmount), "      ");
  xml += tag("totalOtherTaxesAmount", money(0), "      ");
  xml += tag("totalDeductionsAmount", money(0), "      ");
  xml += tag("totalGrossValue", money(totalGross), "      ");
  for (const c of summaryClassifications.values()) {
    xml += classificationBlock(useExpenseClassification, c.type, c.category, c.amount, "      ");
  }
  xml += `    </invoiceSummary>\n`;

  xml += `  </invoice>\n`;
  xml += `</InvoicesDoc>\n`;
  return xml;
}
