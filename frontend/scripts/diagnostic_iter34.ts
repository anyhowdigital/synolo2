/* Iteration 34 — POST-FIX regression. Read-only DB + in-process module invocations. */
import { createClient } from "@libsql/client";
import { buildPeppolInvoiceXml, hasUnsupportedB2GAdjustments } from "@/lib/b2g/ubl";
import { validateB2G } from "@/lib/services/b2g";
import { normalizeStatus } from "@/lib/b2g/providers";
import { leaveAllowance } from "@/lib/services/bonuses";
import { computeItem } from "@/lib/services/payroll";

(async () => {
const out: Record<string, unknown> = {};

const org: any = {
  id: "org-test", b2gEnabled: true, b2gProvider: "simulation", afm: "094123456",
  iban: "GR1601101250000000012300695", legalName: "Test AE", name: "Test AE",
  address: "Str 1", city: "Athens", postalCode: "10000", country: "GR",
  email: "", phone: "", bankName: "Piraeus",
};
const customer: any = {
  id: "c1", publicEntity: true, afm: "090165560", name: "Δήμος Αθηναίων",
  address: "Πλατεία", city: "Αθήνα", postalCode: "10552", country: "GR", email: "",
  b2gBuyerReference: "5001", b2gContractAdam: "22SYMV000000001",
  b2gProjectReference: "1|Έργο", b2gEndpointId: "9933:090165560", b2gBuyerIdentifier: "",
};
const baseInvoice: any = {
  id: "inv-cn-1", status: "issued", invoiceType: "5.1", currency: "EUR",
  issueDate: "2026-06-01", dueDate: "2026-06-30",
  customerId: "c1", customerName: customer.name, customerAfm: customer.afm,
  customerAddress: customer.address, customerCountry: "GR",
  correlatedInvoiceId: "inv-orig-1",
  b2gBuyerReference: customer.b2gBuyerReference, b2gContractAdam: customer.b2gContractAdam,
  b2gProjectReference: customer.b2gProjectReference, b2gOrderReference: "",
  totalNetValue: 100, totalVatAmount: 24, totalGrossValue: 124,
  totalWithheldAmount: 0, totalStampDutyAmount: 0, notes: "",
};
const brLines: any[] = [
  { lineNumber: 1, description: "Υπηρεσία", quantity: 3, netValue: 100,
    unitPrice: 33.3333, vatAmount: 24, vatCategory: 1, vatExemptionCategory: null, measurementUnit: 1 },
];

// 1. CreditNote UBL
try {
  const xml = buildPeppolInvoiceXml({ org, invoice: baseInvoice, lines: brLines, customer, documentNumber: "ΠΤ-0001", precedingInvoice: { documentNumber: "ΤΠΥ-0042", issueDate: "2026-05-15" } });
  const rootTag = xml.match(/<(Invoice|CreditNote)\b/)?.[1] ?? "?";
  const hasCreditNs = /CreditNote-2/.test(xml);
  const hasInvoiceNs = /Invoice-2/.test(xml);
  const typeCode = xml.match(/<cbc:(Invoice|CreditNote)TypeCode>(\d+)/)?.[0] ?? "";
  const hasBillingRef = /<cac:BillingReference>/.test(xml);
  const lineTag = /<cac:CreditNoteLine>/.test(xml) ? "CreditNoteLine" : (/<cac:InvoiceLine>/.test(xml) ? "InvoiceLine" : "?");
  const qtyTag = /<cbc:CreditedQuantity/.test(xml) ? "CreditedQuantity" : (/<cbc:InvoicedQuantity/.test(xml) ? "InvoicedQuantity" : "?");
  const priceAmount = Number(xml.match(/<cbc:PriceAmount[^>]*>([\d.]+)/)?.[1]);
  const baseQty = Number(xml.match(/<cbc:BaseQuantity[^>]*>([\d.]+)/)?.[1]);
  const qty = Number(xml.match(/<cbc:(Invoiced|Credited)Quantity[^>]*>([\d.]+)/)?.[2]);
  const lineExt = Number(xml.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)/)?.[1]);
  const effectivePrice = baseQty ? priceAmount / baseQty : priceAmount;
  out.creditNote = {
    rootTag, hasCreditNoteNamespace: hasCreditNs, hasInvoiceNamespace: hasInvoiceNs,
    typeCode, lineTag, quantityTag: qtyTag, hasBillingReference: hasBillingRef,
    priceAmount, baseQty, qty, lineExt,
    br24_effectivePriceXqty: Number((effectivePrice * qty).toFixed(6)),
    br24_pass: Math.abs(effectivePrice * qty - lineExt) < 0.005,
  };
} catch (e: any) {
  out.creditNote = { error: e?.message ?? String(e) };
}

// 2. Invoice root regression: invoiceType 1.1 should still emit <Invoice>
try {
  const xml = buildPeppolInvoiceXml({
    org, invoice: { ...baseInvoice, id: "inv-i-1", invoiceType: "1.1" },
    lines: brLines, customer, documentNumber: "ΤΠ-1",
  });
  const rootTag = xml.match(/<(Invoice|CreditNote)\b/)?.[1] ?? "?";
  const hasInvNs = /Invoice-2/.test(xml);
  out.invoiceRoot = { rootTag, hasInvoiceNamespace: hasInvNs,
    pass: rootTag === "Invoice" && hasInvNs };
} catch (e: any) { out.invoiceRoot = { error: e?.message ?? String(e) }; }

// 3. Unsupported adjustments flag + XML build refusal
try {
  const wInv = { ...baseInvoice, id: "inv-wh-1", invoiceType: "1.1", totalWithheldAmount: 20 };
  out.unsupportedFlag = hasUnsupportedB2GAdjustments(wInv);
  try {
    buildPeppolInvoiceXml({ org, invoice: wInv, lines: brLines, customer, documentNumber: "ΤΠ-2" });
    out.unsupportedThrow = "NO_THROW";
  } catch (e: any) { out.unsupportedThrow = e?.message ?? String(e); }
} catch (e: any) { out.unsupportedFlagErr = String(e); }

// 4. validateB2G on cancelled, draft, unsupported adjustments
const cancelledInv = { ...baseInvoice, id: "inv-c-1", invoiceType: "1.1", status: "cancelled" };
out.validateB2G_cancelled = validateB2G(org, cancelledInv, brLines, customer);
const draftInv = { ...baseInvoice, id: "inv-d-1", invoiceType: "1.1", status: "draft" };
out.validateB2G_draft = validateB2G(org, draftInv, brLines, customer);
const whInv = { ...baseInvoice, id: "inv-wh-2", invoiceType: "1.1", status: "issued", totalWithheldAmount: 20 };
out.validateB2G_withheld = validateB2G(org, whInv, brLines, customer);

// 5. normalizeStatus regression
out.normalizeStatus = {
  "not accepted": normalizeStatus("not accepted"),
  unsuccessful: normalizeStatus("unsuccessful"),
  failed: normalizeStatus("failed"),
  failure: normalizeStatus("failure"),
  "Accepted by entity": normalizeStatus("Accepted by entity"),
  "ΑΠΟΔΕΚΤΟ": normalizeStatus("ΑΠΟΔΕΚΤΟ"),
  "Sent to buyer": normalizeStatus("Sent to buyer"),
  PARTIALLY_ACCEPTED: normalizeStatus("PARTIALLY_ACCEPTED"),
  delivered: normalizeStatus("delivered"),
  sent: normalizeStatus("sent"),
  rejected: normalizeStatus("rejected"),
  error: normalizeStatus("error"),
};

// 6. leaveAllowance guard
const empBase: any = { id: "e1", grossSalary: 1200, hireDate: "2026-01-01", contractType: "μισθωτός", active: true };
try { out.leaveAllowance_noEnd = leaveAllowance({ ...empBase, endDate: null }, 2026); }
catch (e: any) { out.leaveAllowance_noEnd_error = e?.message; }
try { out.leaveAllowance_endJan = leaveAllowance({ ...empBase, endDate: "2026-01-31" }, 2026); }
catch (e: any) { out.leaveAllowance_endJan_error = e?.message; }
// 3rd-year employee (hired 2024) with endDate 2026-06-30
try { out.leaveAllowance_3rdYear = leaveAllowance({ ...empBase, hireDate: "2024-01-01", endDate: "2026-06-30" }, 2026); }
catch (e: any) { out.leaveAllowance_3rdYear_error = e?.message; }

// 7. computeItem salaried
out.computeItem = {
  days_25: computeItem(empBase, { days: 25 } as any),
  days_1: computeItem(empBase, { days: 1 } as any),
  days_0: computeItem(empBase, { days: 0 } as any),
};

// 8. DB integrity
try {
  const db = createClient({ url: "file:/app/frontend/data/timologio.db" });
  const q = async (sql: string) => (await db.execute(sql)).rows as any[];
  const fk = await q("PRAGMA foreign_key_check");
  const integrity = await q("PRAGMA integrity_check");
  const tables = (await q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r: any) => r.name);
  const counts = {
    orgs: (await q("SELECT COUNT(*) c FROM organizations"))[0]?.c,
    customers: (await q("SELECT COUNT(*) c FROM customers"))[0]?.c,
    invoices: (await q("SELECT COUNT(*) c FROM invoices"))[0]?.c,
    invoice_lines: (await q("SELECT COUNT(*) c FROM invoice_lines"))[0]?.c,
    tables: tables.length,
  };
  const crossOrgInv = await q(`SELECT COUNT(*) c FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.customer_id IS NOT NULL AND c.org_id != i.org_id`);
  const dupSeries = await q(`SELECT COUNT(*) c FROM (SELECT org_id, series_code, number FROM invoices WHERE status IN ('issued','paid','partially_paid') AND number IS NOT NULL GROUP BY org_id, series_code, number HAVING COUNT(*) > 1)`);
  const totalsMismatch = await q(`SELECT COUNT(*) c FROM invoices WHERE status IN ('issued','paid','partially_paid') AND ABS(ROUND(total_net_value + total_vat_amount - total_withheld_amount + total_stamp_duty_amount - total_gross_value, 2)) > 0.02`);
  let leaveOverlaps: any[] = [{ c: 0 }];
  if (tables.includes("leave_requests")) leaveOverlaps = await q(`SELECT COUNT(*) c FROM leave_requests a JOIN leave_requests b ON a.employee_id=b.employee_id AND a.id<b.id WHERE a.status IN ('approved','pending') AND b.status IN ('approved','pending') AND NOT (a.to_date < b.from_date OR b.to_date < a.from_date)`);
  let glImbalance: any[] = [{ c: 0 }];
  if (tables.includes("gl_lines") && tables.includes("gl_entries")) glImbalance = await q(`SELECT COUNT(*) c FROM (SELECT e.id FROM gl_entries e JOIN gl_lines l ON l.entry_id=e.id GROUP BY e.id HAVING ABS(ROUND(SUM(l.debit),2)-ROUND(SUM(l.credit),2)) > 0.01)`);
  out.db = {
    integrity_check: integrity, fk_violations: fk.length, counts,
    cross_org_invoice_customer: crossOrgInv[0]?.c,
    duplicate_issued_numbers: dupSeries[0]?.c,
    invoice_totals_mismatch: totalsMismatch[0]?.c,
    leave_overlaps: leaveOverlaps[0]?.c,
    gl_journal_imbalance: glImbalance[0]?.c,
  };
} catch (e: any) { out.db = { error: e?.message ?? String(e) }; }

console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
