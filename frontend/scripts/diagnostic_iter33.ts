/* Iteration 33 — PRE-FIX baseline reproduction. NO source changes, NO live IO.
 * Focus (per review_request):
 *   - CreditNote UBL root/lineTag/BillingReference
 *   - BR-24 line Price × Quantity vs LineExtensionAmount rounding
 *   - Cancelled invoice B2G guard
 *   - status normalization (word boundary regression)
 *   - hasUnsupportedB2GAdjustments error path
 *   - Read-only SQLite integrity + cross-org association checks
 */
import { createClient } from "@libsql/client";
import { buildPeppolInvoiceXml, hasUnsupportedB2GAdjustments } from "@/lib/b2g/ubl";
import { validateB2G } from "@/lib/services/b2g";
import { normalizeStatus } from "@/lib/b2g/providers";
import { leaveAllowance } from "@/lib/services/bonuses";
import { computeItem } from "@/lib/services/payroll";


(async () => {

const out: Record<string, unknown> = {};

// ---------- Fixtures ----------
const org: any = {
  id: "org-test",
  b2gEnabled: true,
  b2gProvider: "simulation",
  afm: "094123456",
  iban: "GR1601101250000000012300695",
  legalName: "Test AE",
  name: "Test AE",
  address: "Str 1",
  city: "Athens",
  postalCode: "10000",
  country: "GR",
  email: "",
  phone: "",
  bankName: "Piraeus",
};
const customer: any = {
  id: "c1",
  publicEntity: true,
  afm: "090165560",
  name: "Δήμος Αθηναίων",
  address: "Πλατεία", city: "Αθήνα", postalCode: "10552", country: "GR", email: "",
  b2gBuyerReference: "5001",
  b2gContractAdam: "22SYMV000000001",
  b2gProjectReference: "1|Έργο",
  b2gEndpointId: "9933:090165560",
  b2gBuyerIdentifier: "",
};
const baseInvoice: any = {
  id: "inv-cn-1",
  status: "issued",
  invoiceType: "5.1", // credit note (πιστωτικό)
  currency: "EUR",
  issueDate: "2026-06-01",
  dueDate: "2026-06-30",
  customerId: "c1",
  customerName: customer.name,
  customerAfm: customer.afm,
  customerAddress: customer.address,
  customerCountry: "GR",
  correlatedInvoiceId: "inv-orig-1",
  b2gBuyerReference: customer.b2gBuyerReference,
  b2gContractAdam: customer.b2gContractAdam,
  b2gProjectReference: customer.b2gProjectReference,
  b2gOrderReference: "",
  totalNetValue: 100, totalVatAmount: 24, totalGrossValue: 124,
  totalWithheldAmount: 0, totalStampDutyAmount: 0,
  notes: "",
};
// Line: quantity 3, netValue 100 -> unit price rounds to 33.33 -> 3×33.33=99.99 (BR-24 fail)
const brLines: any[] = [
  { lineNumber: 1, description: "Υπηρεσία", quantity: 3, netValue: 100, unitPrice: 33.3333, vatAmount: 24, vatCategory: 1, vatExemptionCategory: null, measurementUnit: 1 },
];

// ---------- 1. CreditNote UBL ----------
try {
  const xml = buildPeppolInvoiceXml({ org, invoice: baseInvoice, lines: brLines, customer, documentNumber: "ΠΤ-0001" });
  const rootTag = xml.match(/<(Invoice|CreditNote)\b/)?.[1] ?? "?";
  const hasCreditNs = /CreditNote-2/.test(xml);
  const typeCode = xml.match(/<cbc:(Invoice|CreditNote)TypeCode>(\d+)/)?.[0] ?? "";
  const hasBillingRef = /<cac:BillingReference>/.test(xml);
  const lineTag = /<cac:CreditNoteLine>/.test(xml) ? "CreditNoteLine" : (/<cac:InvoiceLine>/.test(xml) ? "InvoiceLine" : "?");
  const qtyTag = /<cbc:CreditedQuantity/.test(xml) ? "CreditedQuantity" : (/<cbc:InvoicedQuantity/.test(xml) ? "InvoicedQuantity" : "?");
  // BR-24 arithmetic (Price × Qty == LineExtensionAmount)
  const priceAmount = Number(xml.match(/<cbc:PriceAmount[^>]*>([\d.]+)/)?.[1]);
  const qty = Number(xml.match(/<cbc:(Invoice|Credit)dQuantity[^>]*>([\d.]+)/)?.[2]);
  const lineExt = Number(xml.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)/)?.[1]);
  out.creditNote = {
    rootTag,
    typeCode,
    hasCreditNoteNamespace: hasCreditNs,
    lineTag,
    quantityTag: qtyTag,
    hasBillingReference: hasBillingRef,
    br24_priceXqty: priceAmount * qty,
    br24_lineExtensionAmount: lineExt,
    br24_pass: Math.abs(priceAmount * qty - lineExt) < 0.005,
    verdict_root: rootTag === "CreditNote" ? "PASS" : "BUG — credit note emitted as <Invoice>",
    verdict_billingref: hasBillingRef ? "PASS" : "BUG — cac:BillingReference (BT-25) missing",
    verdict_br24: (priceAmount * qty === lineExt) ? "PASS" : "BUG — BR-24 rounding mismatch",
  };
} catch (e: any) {
  out.creditNote = { error: e?.message ?? String(e) };
}

// ---------- 2. hasUnsupportedB2GAdjustments + XML throw ----------
try {
  const wInv = { ...baseInvoice, id: "inv-wh-1", invoiceType: "1.1", totalWithheldAmount: 20 };
  out.unsupported_flag = hasUnsupportedB2GAdjustments(wInv);
  try {
    buildPeppolInvoiceXml({ org, invoice: wInv, lines: brLines, customer, documentNumber: "ΤΠ-0002" });
    out.unsupported_throw = "NO_THROW (unexpected)";
  } catch (e: any) {
    out.unsupported_throw = e?.message ?? String(e);
  }
} catch (e: any) {
  out.unsupported_flag_err = String(e);
}

// ---------- 3. validateB2G with status=cancelled ----------
const cancelledInv = { ...baseInvoice, id: "inv-c-1", invoiceType: "1.1", status: "cancelled" };
const cancelledErrs = validateB2G(org, cancelledInv, brLines, customer);
out.validateB2G_cancelled = { errors: cancelledErrs, guardsCancelled: cancelledErrs.some((e) => /ακυρ|cancel|void/i.test(e)) };

// ---------- 4. normalizeStatus regression ----------
out.normalizeStatus = {
  "not accepted": normalizeStatus("not accepted"),
  unsuccessful: normalizeStatus("unsuccessful"),
  failed: normalizeStatus("failed"),
  "Accepted by entity": normalizeStatus("Accepted by entity"),
  ΑΠΟΔΕΚΤΟ: normalizeStatus("ΑΠΟΔΕΚΤΟ"),
  "Sent to buyer": normalizeStatus("Sent to buyer"),
  PARTIALLY_ACCEPTED: normalizeStatus("PARTIALLY_ACCEPTED"),
  delivered: normalizeStatus("delivered"),
};

// ---------- 5. leaveAllowance endDate ignored ----------
const empBase: any = { id: "e1", grossSalary: 1200, hireDate: "2026-01-01", contractType: "μισθωτός", active: true };
out.leaveAllowance = {
  noEnd_2026: leaveAllowance({ ...empBase, endDate: null }, 2026),
  end_2026_01_31: leaveAllowance({ ...empBase, endDate: "2026-01-31" }, 2026),
};

// ---------- 6. computeItem salaried with 1 day ----------
out.computeItem_salaried = {
  days_25: computeItem(empBase, { days: 25 } as any),
  days_1: computeItem(empBase, { days: 1 } as any),
};

// ---------- 7. Read-only DB integrity ----------
try {
  const db = createClient({ url: "file:/app/frontend/data/timologio.db" });
  const q = async (sql: string) => (await db.execute(sql)).rows as any[];
  const fkViolations = await q("PRAGMA foreign_key_check");
  const integrity = await q("PRAGMA integrity_check");
  const tables = (await q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r: any) => r.name);

  const crossOrgInv = await q(`
    SELECT i.id AS invoiceId, i.org_id AS invOrg, c.org_id AS custOrg
    FROM invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.customer_id IS NOT NULL AND c.org_id != i.org_id
  `);
  const dupSeries = await q(`
    SELECT org_id, series_code, number, COUNT(*) c FROM invoices
    WHERE status IN ('issued','paid','partially_paid') AND number IS NOT NULL
    GROUP BY org_id, series_code, number HAVING c > 1
  `);
  const totalsMismatch = await q(`
    SELECT id, org_id, ROUND(total_net_value,2) net, ROUND(total_vat_amount,2) vat,
           ROUND(total_gross_value,2) gross,
           ROUND(total_withheld_amount,2) wh, ROUND(total_stamp_duty_amount,2) st
    FROM invoices
    WHERE status IN ('issued','paid','partially_paid')
      AND ABS(ROUND(total_net_value + total_vat_amount - total_withheld_amount + total_stamp_duty_amount - total_gross_value, 2)) > 0.02
    LIMIT 25
  `);
  const crossOrgLines = await q(`
    SELECT l.id AS lineId, i.org_id invOrg
    FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
    WHERE i.id IS NULL LIMIT 25
  `);
  const crossOrgPay = tables.includes("payments") ? await q(`
    SELECT p.id AS payId, p.org_id payOrg, i.org_id invOrg
    FROM payments p JOIN invoices i ON i.id = p.invoice_id
    WHERE p.org_id != i.org_id LIMIT 25
  `) : [];
  let leaveOverlaps: any[] = [];
  if (tables.includes("leave_requests")) {
    leaveOverlaps = await q(`
      SELECT a.id a_id, b.id b_id, a.employee_id, a.from_date a_start, a.to_date a_end, b.from_date b_start, b.to_date b_end
      FROM leave_requests a JOIN leave_requests b ON a.employee_id = b.employee_id AND a.id < b.id
      WHERE a.status IN ('approved','pending') AND b.status IN ('approved','pending')
        AND NOT (a.to_date < b.from_date OR b.to_date < a.from_date)
      LIMIT 25
    `);
  }
  let glImbalance: any[] = [];
  if (tables.includes("gl_lines") && tables.includes("gl_entries")) {
    glImbalance = await q(`
      SELECT e.id, e.org_id, ROUND(SUM(l.debit),2) d, ROUND(SUM(l.credit),2) c
      FROM gl_entries e JOIN gl_lines l ON l.entry_id = e.id
      GROUP BY e.id HAVING ABS(d - c) > 0.01 LIMIT 25
    `);
  }
  const counts = {
    orgs: (await q("SELECT COUNT(*) c FROM organizations"))[0]?.c,
    customers: (await q("SELECT COUNT(*) c FROM customers"))[0]?.c,
    invoices: (await q("SELECT COUNT(*) c FROM invoices"))[0]?.c,
    invoice_lines: (await q("SELECT COUNT(*) c FROM invoice_lines"))[0]?.c,
  };
  out.dbIntegrity = {
    integrity_check: integrity,
    fk_violations_count: fkViolations.length,
    fk_violations_sample: fkViolations.slice(0, 10),
    counts,
    cross_org_invoice_customer: { count: crossOrgInv.length, sample: crossOrgInv.slice(0, 5) },
    cross_org_lines: { count: crossOrgLines.length, sample: crossOrgLines.slice(0, 5) },
    cross_org_payments: { count: crossOrgPay.length, sample: crossOrgPay.slice(0, 5) },
    duplicate_issued_numbers: { count: dupSeries.length, sample: dupSeries.slice(0, 5) },
    invoice_totals_mismatch: { count: totalsMismatch.length, sample: totalsMismatch.slice(0, 5) },
    leave_overlaps: { count: leaveOverlaps.length, sample: leaveOverlaps.slice(0, 5) },
    gl_journal_imbalance: { count: glImbalance.length, sample: glImbalance.slice(0, 5) },
    tables_count: tables.length,
  };
} catch (e: any) {
  out.dbIntegrity = { error: e?.message ?? String(e) };
}

console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
