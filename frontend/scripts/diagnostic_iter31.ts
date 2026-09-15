/* Iteration 31 diagnostic — calls actual modules, no live IO */
import { normalizeStatus } from "@/lib/b2g/providers";
import { validateB2G } from "@/lib/services/b2g";
import { buildPeppolInvoiceXml } from "@/lib/b2g/ubl";
import { computeItem } from "@/lib/services/payroll";
import { leaveAllowance } from "@/lib/services/bonuses";
import { workCardPayload } from "@/lib/services/ergani-api";

const results: Record<string, unknown> = {};

// (1) normalizeStatus mapping
results.normalizeStatus = {
  "not accepted": normalizeStatus("not accepted"),
  unsuccessful: normalizeStatus("unsuccessful"),
  failed: normalizeStatus("failed"),
};

// (2) validateB2G — cancelled but otherwise-valid invoice
const org: any = {
  b2gEnabled: true,
  b2gProvider: "simulation",
  afm: "123456789",
  iban: "GR160110125000000012300695",
  legalName: "Test AE",
  name: "Test AE",
  address: "Str 1",
  city: "Athens",
  postalCode: "10000",
  country: "GR",
  email: "",
  phone: "",
  bankName: "",
};
const invoiceBase: any = {
  id: "inv1",
  invoiceType: "1.1",
  status: "cancelled", // NOT draft
  customerId: "c1",
  customerAfm: "800000118",
  customerCountry: "GR",
  customerName: "Δήμος",
  customerAddress: "",
  b2gBuyerReference: "BR-1",
  b2gContractAdam: "ADAM123",
  b2gProjectReference: "1|PRJ",
  b2gOrderReference: "",
  b2gStatus: "not_sent",
  issueDate: "2026-01-15",
  dueDate: "2026-01-31",
  totalNetValue: 100,
  totalVatAmount: 24,
  totalGrossValue: 104, // withheld 20
  currency: "EUR",
  notes: "",
  series: "A",
  number: 1,
};
const customer: any = {
  id: "c1",
  publicEntity: true,
  afm: "800000118",
  address: "",
  city: "",
  postalCode: "",
  country: "GR",
  name: "Δήμος",
  b2gBuyerReference: "",
  b2gContractAdam: "",
  b2gProjectReference: "",
  b2gOrderReference: "",
  b2gEndpointId: "",
  b2gBuyerIdentifier: "",
  email: "",
  phone: "",
};
try {
  results.validateB2G_cancelled = validateB2G(org, invoiceBase, [
    { id: "l1", invoiceId: "inv1", lineNumber: 1, description: "Υπηρεσία", quantity: 1, unitPrice: 100, netValue: 100, vatAmount: 24, vatCategory: 1, vatExemptionCategory: null, measurementUnit: 7 } as any,
  ], customer);
  const errs = (results.validateB2G_cancelled as any)?.errors ?? results.validateB2G_cancelled;
  results.validateB2G_cancelled_assertion = Array.isArray(errs) && errs.length === 0
    ? "PASS: cancelled invoice returned errors=[] (BUG — no cancelled-status guard)"
    : `INCONCLUSIVE: errors=${JSON.stringify(errs)}`;
} catch (e) {
  results.validateB2G_cancelled = `ERR:${(e as Error).message}`;
}

// (3) buildPeppolInvoiceXml with withholding + credit note root
try {
  const xml = buildPeppolInvoiceXml({
    org,
    invoice: invoiceBase,
    lines: [
      { id: "l1", invoiceId: "inv1", lineNumber: 1, description: "Υπηρεσία", quantity: 1, unitPrice: 100, netValue: 100, vatAmount: 24, vatCategory: 1, vatExemptionCategory: null, measurementUnit: 7 } as any,
    ],
    customer,
    documentNumber: "A-1",
  });
  const grab = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
    return m ? m[1] : null;
  };
  results.ubl_invoice = {
    root: xml.slice(xml.indexOf("<Invoice") >= 0 ? xml.indexOf("<Invoice") : xml.indexOf("<CreditNote"), (xml.indexOf(">", xml.indexOf("<Invoice")>=0?xml.indexOf("<Invoice"):xml.indexOf("<CreditNote"))+1)),
    LineExtensionAmount: grab("cbc:LineExtensionAmount"),
    TaxExclusiveAmount: grab("cbc:TaxExclusiveAmount"),
    TaxAmount: grab("cbc:TaxAmount"),
    TaxInclusiveAmount: grab("cbc:TaxInclusiveAmount"),
    PayableAmount: grab("cbc:PayableAmount"),
    InvoiceTypeCode: grab("cbc:InvoiceTypeCode"),
  };

  // Credit note test
  const creditInv = { ...invoiceBase, invoiceType: "5.1" };
  const xmlC = buildPeppolInvoiceXml({ org, invoice: creditInv, lines: [
    { id: "l1", invoiceId: "inv1", lineNumber: 1, description: "Πιστωτικό", quantity: 1, unitPrice: 100, netValue: 100, vatAmount: 24, vatCategory: 1, vatExemptionCategory: null, measurementUnit: 7 } as any,
  ], customer, documentNumber: "CN-1" });
  results.ubl_credit = {
    rootTag: (xmlC.match(/<(Invoice|CreditNote)\b/) || [])[1],
    typeCode: (xmlC.match(/<cbc:InvoiceTypeCode>([^<]+)/) || [])[1] ?? (xmlC.match(/<cbc:CreditNoteTypeCode>([^<]+)/) || [])[1],
  };
} catch (e) {
  results.ubl_error = (e as Error).message;
}

// (4) athensIso via workCardPayload — extract via actual exported module
const empErg: any = { afm: "800000118", lastName: "Test", firstName: "User" };
const orgErg: any = { afm: "800000118" };
const rowJan = workCardPayload({ employerAfm: "800000118", annexAa: "0" } as any, orgErg, [
  { emp: empErg, type: "0", date: "2026-01-15", at: new Date("2026-01-15T10:00:00Z") },
]);
const rowJul = workCardPayload({ employerAfm: "800000118", annexAa: "0" } as any, orgErg, [
  { emp: empErg, type: "0", date: "2026-07-15", at: new Date("2026-07-15T10:00:00Z") },
]);
results.athensIso = {
  jan_2026_01_15T10Z_f_date: (rowJan as any).Cards.Card[0].Details.CardDetails[0].f_date,
  jul_2026_07_15T10Z_f_date: (rowJul as any).Cards.Card[0].Details.CardDetails[0].f_date,
  container_tz: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
  note: "Extracted from workCardPayload real export (no copy). Expect +02:00 (Jan) / +03:00 (Jul) Athens offset.",
};

// (5) computeItem salaried days=25 vs days=1
const emp: any = {
  id: "e1",
  contractType: "full",
  grossSalary: 1200,
  dailyWage: 0,
  hoursPerWeek: 40,
  children: 0,
  active: true,
  hireDate: "2020-01-01",
  endDate: null,
};
results.computeItem = {
  days_25: computeItem(emp, { employeeId: "e1", days: 25 }),
  days_1: computeItem(emp, { employeeId: "e1", days: 1 }),
};
// Source check: computeRun filters
results.computeRun_active_filter = "staff = listEmployees().filter(e => e.active && ...) — terminated (active=false) EXCLUDED ✓";
results.computeRun_days_source = "days: overrides.days ?? (empShifts.length ? empShifts.length : undefined) — uses SHIFT COUNT per work kind";

// (6) leaveAllowance with same-year hire 2026-01-01 with vs without endDate 2026-01-31
const empHire: any = { grossSalary: 1200, dailyWage: 0, hireDate: "2026-01-01", endDate: null };
const empHireEnd: any = { ...empHire, endDate: "2026-01-31" };
results.leaveAllowance = {
  hire_2026_01_01_noEnd: leaveAllowance(empHire, 2026),
  hire_2026_01_01_end_2026_01_31: leaveAllowance(empHireEnd, 2026),
  note: "leaveAllowance ignores endDate entirely — only depends on hireDate & year",
};

console.log(JSON.stringify(results, null, 2));
