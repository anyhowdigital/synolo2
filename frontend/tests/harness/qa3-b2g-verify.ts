/**
 * QA3 B2G verification (SQL-level, offline).
 * Verifies:
 *  - Greek CIUS 6-segment BT-1 (cbc:ID)
 *  - ##M.AR.K##, ##INVOICE|URL##, ##SOFT|REJECT##, ##PROJECT|REFERENCE##
 *  - ContractDocumentReference / ProjectReference / AdditionalDocumentReference ordering
 *  - AccountingCustomerParty endpoint 9933:997001671, PartyIdentification (BT-46)
 *  - CPV listID=STI per line
 *  - CustomizationID/ProfileID PEPPOL BIS 3.0, PartyTaxScheme EL prefix
 *  - Credit note UBL: CreditNote root, no cbc:DueDate, CreditNoteTypeCode 381, BillingReference
 *  - myDATA client requestAllPages pagination for all 3 endpoints (grep)
 *  - Non-transmitted public-entity invoice → validation reports GR-R-004 (ΜΑΡΚ)
 *  - Missing BT-46 → validation reports "BT-46"
 */
import { and, eq, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as schema from "../../src/db/schema";
import { validateB2G, buildXmlFor, loadB2GCustomer, sendB2G } from "../../src/lib/services/b2g";

const ORG_ID = "fa82eab8-ce41-4d73-8a3f-05a0f63f1002";
const now = () => new Date().toISOString();
let fails = 0;
function log(name: string, ok: boolean, extra: unknown = "") {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}`, extra ?? "");
  if (!ok) fails++;
}

async function getDb(): Promise<any> {
  const client = createClient({ url: "file:./data/timologio.db" });
  return drizzle(client, { schema }) as any;
}

async function main() {
  const db: any = await getDb();
  const org: any = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, ORG_ID) });
  if (!org) throw new Error("demo org missing");
  // Ensure B2G enabled + simulation provider
  if (!org.b2gEnabled || org.b2gProvider !== "simulation") {
    await db.update(schema.organizations).set({ b2gEnabled: true, b2gProvider: "simulation", b2gEnvironment: "test" }).where(eq(schema.organizations.id, ORG_ID));
    org.b2gEnabled = true; org.b2gProvider = "simulation"; org.b2gEnvironment = "test";
  }
  log("Org: B2G enabled + simulation + IBAN present", !!org.b2gEnabled && org.b2gProvider === "simulation" && !!org.iban, { iban: !!org.iban });

  // ============ 1) Upsert QA3-ΔΗΜΟΣ customer ============
  const AFM = "090165560";
  const existing = await db.query.customers.findFirst({ where: and(eq(schema.customers.orgId, ORG_ID), eq(schema.customers.afm, AFM)) });
  const custId = existing?.id ?? randomUUID();
  const customerRow = {
    id: custId, orgId: ORG_ID, kind: "company", name: "QA3-ΔΗΜΟΣ ΔΟΚΙΜΗΣ",
    afm: AFM, doy: "", activity: "Δημόσιος φορέας", address: "Πλατεία 1", city: "Αθήνα", postalCode: "10000",
    country: "GR", email: "", phone: "", contactPerson: "", notes: "", stage: "customer",
    paymentTermsDays: null, tags: "[]", customFieldsJson: "{}", language: "el",
    publicEntity: true, b2gEndpointId: "9933:997001671",
    b2gBuyerReference: "QA3-ROUTE-01", b2gBuyerIdentifier: "1017.000000000.0183",
    b2gContractAdam: "24SYMV001234567", b2gProjectReference: "1|602ΚΚ2Π-ΨΞ4",
    b2gOrderReference: "", b2gCpv: "72000000-5", b2gKae: "",
    cardBrand: "", cardLast4: "", creditLimit: 0, discountPercent: 0,
    createdAt: existing?.createdAt ?? now(),
  } as any;
  if (existing) await db.update(schema.customers).set(customerRow).where(eq(schema.customers.id, custId));
  else await db.insert(schema.customers).values(customerRow);
  const cust: any = await db.query.customers.findFirst({ where: eq(schema.customers.id, custId) });
  log("Customer QA3-ΔΗΜΟΣ upserted with publicEntity=true, BT-46, CPV, BT-11, BT-12", !!cust?.publicEntity && cust?.b2gBuyerIdentifier === "1017.000000000.0183" && cust?.b2gCpv === "72000000-5" && cust?.b2gProjectReference === "1|602ΚΚ2Π-ΨΞ4" && cust?.b2gContractAdam === "24SYMV001234567");

  // ============ 2) Create ΤΠΥ invoice (2.1) issued + mydata MARK ============
  const series = await db.query.series.findFirst({ where: and(eq(schema.series.orgId, ORG_ID), eq(schema.series.invoiceType, "2.1")) });
  if (!series) throw new Error("series 2.1 not found");
  const nextRow = await db.select({ n: sql<number>`coalesce(max(${schema.invoices.number}),0)` }).from(schema.invoices).where(and(eq(schema.invoices.orgId, ORG_ID), eq(schema.invoices.seriesId, series.id)));
  const number = Number(nextRow[0]?.n ?? 0) + 500;
  const invId = randomUUID();
  const issueDate = "2026-10-20";
  const mark = "4000" + Math.floor(1e10 + Math.random() * 8e10).toString().slice(0, 11);
  const publicToken = "qa3-" + randomUUID();
  await db.insert(schema.invoices).values({
    id: invId, orgId: ORG_ID, customerId: custId, seriesId: series.id, seriesCode: series.code, number,
    invoiceType: "2.1", issueDate, dueDate: issueDate, currency: "EUR", paymentMethod: 1, status: "issued",
    notes: "QA3 B2G test", customerName: cust.name, customerAfm: cust.afm, customerAddress: cust.address, customerCountry: "GR",
    totalNetValue: 100, totalVatAmount: 24, totalWithheldAmount: 0, totalStampDutyAmount: 0, totalGrossValue: 124,
    paidAmount: 0, mydataStatus: "sent", mydataMark: mark, mydataSentAt: now(),
    publicToken, branch: 0, tags: "[]", customFieldsJson: "{}", channel: "",
    b2gStatus: "not_sent", b2gProvider: "", b2gBuyerReference: "", b2gContractAdam: "", b2gProjectReference: "", b2gOrderReference: "", b2gCpv: "",
    createdAt: now(), updatedAt: now(),
  } as any);
  await db.insert(schema.invoiceLines).values({
    id: randomUUID(), invoiceId: invId, lineNumber: 1, description: "QA3 Υπηρεσίες",
    quantity: 1, unitPrice: 100, discountPercent: 0, vatCategory: 1, measurementUnit: 7,
    classificationCategory: "category1_3", classificationType: "E3_561_003",
    netValue: 100, vatAmount: 24, withheldAmount: 0, stampDutyAmount: 0,
  } as any);

  let inv: any = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId) });
  let lines: any = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invId));

  // ============ 3) validateB2G with refs inherited from customer (empty invoice refs) ============
  {
    let errs = validateB2G(org, inv, lines, cust);
    const okNoBt = !errs.some((e) => /BT-11|BT-12|BT-46/.test(e));
    const okNoMark = !errs.some((e) => /ΜΑΡΚ/.test(e));
    log("Validation (empty invoice refs): does NOT complain about BT-11/12/46 (inherited from customer)", okNoBt, errs);
    log("Validation (invoice has MARK): does NOT complain about ΜΑΡΚ", okNoMark, errs.filter((e) => /ΜΑΡΚ/.test(e)));
  }

  // ============ 4) invalid CPV on invoice → validation error ============
  await db.update(schema.invoices).set({ b2gCpv: "123" }).where(eq(schema.invoices.id, invId));
  inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId) });
  {
    const errs = validateB2G(org, inv, lines, cust);
    log("Invalid CPV '123' produces CPV validation error", errs.some((e) => /CPV/.test(e)), errs.filter((e) => /CPV/.test(e)));
  }

  // ============ 5) Set valid CPV '48000000-8' → no CPV error and build XML ============
  await db.update(schema.invoices).set({ b2gCpv: "48000000-8" }).where(eq(schema.invoices.id, invId));
  inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId) });
  {
    const errs = validateB2G(org, inv, lines, cust);
    log("Valid CPV '48000000-8' → no validation errors", errs.length === 0, errs);
  }

  // ============ 6) Build UBL XML and assertions ============
  const xml = await buildXmlFor(db, org, inv, lines, cust);
  // Save XML to file for inspection
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/qa3_ubl_invoice.xml", xml);

  const dd = issueDate.slice(8, 10) + "/" + issueDate.slice(5, 7) + "/" + issueDate.slice(0, 4);
  const expectedBt1 = `${org.afm}|${dd}|0|2.1|${series.code}|${number}`;
  const idMatch = xml.match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
  log(`BT-1 cbc:ID = '${expectedBt1}'`, idMatch?.[1] === expectedBt1, { actual: idMatch?.[1] });
  log("BT-1 has 6 pipe-segments", (idMatch?.[1] || "").split("|").length === 6);
  log("##M.AR.K## present with MARK", xml.includes("##M.AR.K##") && xml.includes(`<cbc:ID>${mark}</cbc:ID>`));
  log("##INVOICE|URL## present with ExternalReference URI", xml.includes("##INVOICE|URL##") && /<cac:ExternalReference><cbc:URI>[^<]*\/p\/qa3-/.test(xml));
  log("ContractDocumentReference ID = 24SYMV001234567", /<cac:ContractDocumentReference><cbc:ID>24SYMV001234567<\/cbc:ID>/.test(xml));
  log("ProjectReference ID = 1|602ΚΚ2Π-ΨΞ4", xml.includes("<cac:ProjectReference><cbc:ID>1|602ΚΚ2Π-ΨΞ4</cbc:ID>"));
  log("AccountingCustomerParty EndpointID schemeID=9933 value=997001671", /<cac:AccountingCustomerParty>[\s\S]*?<cbc:EndpointID schemeID="9933">997001671<\/cbc:EndpointID>/.test(xml));
  log("PartyIdentification ID = 1017.000000000.0183", /<cac:PartyIdentification><cbc:ID>1017\.000000000\.0183<\/cbc:ID>/.test(xml));
  log("ItemClassificationCode listID='STI' value=48000000-8", /<cbc:ItemClassificationCode listID="STI">48000000-8<\/cbc:ItemClassificationCode>/.test(xml));
  log("CustomizationID PEPPOL BIS 3.0", xml.includes("urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0"));
  log("ProfileID PEPPOL BIS 3.0", xml.includes("urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"));
  log("Supplier PartyTaxScheme CompanyID starts with EL", /<cac:PartyTaxScheme><cbc:CompanyID>EL\d/.test(xml));

  // Element ORDER
  const iContract = xml.indexOf("<cac:ContractDocumentReference>");
  const iAddl = xml.indexOf("<cac:AdditionalDocumentReference>");
  const iProject = xml.indexOf("<cac:ProjectReference>");
  const iSupplier = xml.indexOf("<cac:AccountingSupplierParty>");
  log("Order: Contract < Additional < Project < Supplier", iContract > 0 && iAddl > iContract && iProject > iAddl && iSupplier > iProject, { iContract, iAddl, iProject, iSupplier });

  // ============ 7) Soft Reject flag → XML contains SR + ##SOFT|REJECT## ============
  await db.update(schema.invoices).set({ b2gSoftReject: true }).where(eq(schema.invoices.id, invId));
  inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId) });
  {
    const xml2 = await buildXmlFor(db, org, inv, lines, cust);
    log("Soft Reject: XML contains AdditionalDocumentReference ID='SR' + ##SOFT|REJECT##", /<cac:AdditionalDocumentReference><cbc:ID>SR<\/cbc:ID><cbc:DocumentDescription>##SOFT\|REJECT##/.test(xml2));
  }

  // ============ 8) sendB2G → status pending/sent (simulation) ============
  {
    try {
      const outcome = await sendB2G(db, org, { ...inv, lines } as any, lines, null);
      log("sendB2G simulation outcome status in (pending|sent|accepted)", ["pending", "sent", "accepted"].includes(outcome.status), outcome);
      // Refresh
      inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId) });
      log("Invoice b2gStatus persisted (pending/sent/accepted)", ["pending", "sent", "accepted"].includes(inv.b2gStatus), inv.b2gStatus);
      // saveB2GInvoiceRefsAction refuses when already sent — simulate contract by checking status guard
      // (Direct assertion done in UI + service action; here we just check that alreadySent gating condition would evaluate true.)
      log("After send, alreadySent gating true (locks refs form)", ["pending", "sent", "accepted"].includes(inv.b2gStatus) && !!inv.b2gProviderId, inv.b2gProviderId);
    } catch (err) {
      log("sendB2G threw unexpectedly", false, (err as Error).message);
    }
  }

  // ============ 9) Negative: non-transmitted issued public-entity invoice → validation GR-R-004 + UBL 4xx ============
  const invId2 = randomUUID();
  await db.insert(schema.invoices).values({
    id: invId2, orgId: ORG_ID, customerId: custId, seriesId: series.id, seriesCode: series.code, number: number + 1,
    invoiceType: "2.1", issueDate, dueDate: issueDate, currency: "EUR", paymentMethod: 1, status: "issued",
    notes: "QA3 no-MARK", customerName: cust.name, customerAfm: cust.afm, customerAddress: cust.address, customerCountry: "GR",
    totalNetValue: 100, totalVatAmount: 24, totalGrossValue: 124, paidAmount: 0,
    mydataStatus: "not_sent", mydataMark: null, branch: 0, tags: "[]", customFieldsJson: "{}", channel: "",
    b2gStatus: "not_sent", b2gProvider: "", b2gBuyerReference: "", b2gContractAdam: "", b2gProjectReference: "", b2gOrderReference: "", b2gCpv: "",
    createdAt: now(), updatedAt: now(),
  } as any);
  await db.insert(schema.invoiceLines).values({
    id: randomUUID(), invoiceId: invId2, lineNumber: 1, description: "QA3 no-MARK line",
    quantity: 1, unitPrice: 100, discountPercent: 0, vatCategory: 1, measurementUnit: 7,
    classificationCategory: "category1_3", classificationType: "E3_561_003",
    netValue: 100, vatAmount: 24,
  } as any);
  const inv2 = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invId2) });
  const lines2 = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invId2));
  {
    const errs = validateB2G(org, inv2, lines2, cust);
    log("No-MARK invoice: validation contains ΜΑΡΚ / GR-R-004 message", errs.some((e) => /ΜΑΡΚ/.test(e)), errs.filter((e) => /ΜΑΡΚ/.test(e)));
  }
  {
    let threw = false, msg = "";
    try { await buildXmlFor(db, org, inv2, lines2, cust); } catch (e) { threw = true; msg = (e as Error).message; }
    log("buildXmlFor for no-MARK invoice throws with ΜΑΡΚ message", threw && /ΜΑΡΚ/.test(msg), msg);
  }

  // ============ 10) Customer without BT-46 → validation mentions BT-46 ============
  const custNoBt46 = { ...cust, b2gBuyerIdentifier: "" };
  {
    // Save invoice without invoice-level buyer identifier (there is none — inherits) — use fresh invoice
    const errs = validateB2G(org, inv, lines, custNoBt46);
    log("Missing BT-46 (customer): validation mentions BT-46", errs.some((e) => /BT-46/.test(e)), errs.filter((e) => /BT-46/.test(e)));
  }

  // ============ 11) Credit note (5.1) correlated to inv ============
  const cnSeries = await db.query.series.findFirst({ where: and(eq(schema.series.orgId, ORG_ID), eq(schema.series.invoiceType, "5.1")) });
  if (cnSeries) {
    const nextCn = await db.select({ n: sql<number>`coalesce(max(${schema.invoices.number}),0)` }).from(schema.invoices).where(and(eq(schema.invoices.orgId, ORG_ID), eq(schema.invoices.seriesId, cnSeries.id)));
    const cnNumber = Number(nextCn[0]?.n ?? 0) + 100;
    const cnId = randomUUID();
    const cnMark = "4000" + Math.floor(1e10 + Math.random() * 8e10).toString().slice(0, 11);
    await db.insert(schema.invoices).values({
      id: cnId, orgId: ORG_ID, customerId: custId, seriesId: cnSeries.id, seriesCode: cnSeries.code, number: cnNumber,
      invoiceType: "5.1", issueDate, dueDate: null, currency: "EUR", paymentMethod: 1, status: "issued",
      notes: "QA3 credit note", correlatedInvoiceId: invId,
      customerName: cust.name, customerAfm: cust.afm, customerAddress: cust.address, customerCountry: "GR",
      totalNetValue: 100, totalVatAmount: 24, totalGrossValue: 124, paidAmount: 0,
      mydataStatus: "sent", mydataMark: cnMark, mydataSentAt: now(),
      branch: 0, tags: "[]", customFieldsJson: "{}", channel: "",
      b2gStatus: "not_sent", b2gProvider: "", b2gBuyerReference: "", b2gContractAdam: "", b2gProjectReference: "", b2gOrderReference: "", b2gCpv: "48000000-8",
      createdAt: now(), updatedAt: now(),
    } as any);
    await db.insert(schema.invoiceLines).values({
      id: randomUUID(), invoiceId: cnId, lineNumber: 1, description: "QA3 credit line",
      quantity: 1, unitPrice: 100, discountPercent: 0, vatCategory: 1, measurementUnit: 7,
      classificationCategory: "category1_3", classificationType: "E3_561_003",
      netValue: 100, vatAmount: 24,
    } as any);
    const cnInv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, cnId) });
    const cnLines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, cnId));
    const cnXml = await buildXmlFor(db, org, cnInv, cnLines, cust);
    fs.writeFileSync("/tmp/qa3_ubl_creditnote.xml", cnXml);
    log("CreditNote: root is <CreditNote", cnXml.startsWith("<?xml") && /<CreditNote\s/.test(cnXml));
    log("CreditNote: has NO cbc:DueDate", !/<cbc:DueDate>/.test(cnXml));
    log("CreditNote: CreditNoteTypeCode 381", /<cbc:CreditNoteTypeCode>381<\/cbc:CreditNoteTypeCode>/.test(cnXml));
    const origBt1 = `${org.afm}|${dd}|0|2.1|${series.code}|${number}`;
    log("CreditNote: BillingReference/InvoiceDocumentReference ID = original 6-segment BT-1", cnXml.includes(`<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${origBt1}</cbc:ID>`), origBt1);
    log("CreditNote: ProjectReference present (preceding invoice exists)", /<cac:ProjectReference><cbc:ID>1\|602ΚΚ2Π-ΨΞ4<\/cbc:ID>/.test(cnXml));
  } else {
    console.log("[SKIP] Credit note test — no series 5.1 configured");
  }

  // ============ 12) myDATA pagination grep check ============
  const clientSrc = readFileSync("./src/lib/mydata/client.ts", "utf8");
  const requestDocsUses = /export async function requestDocs[\s\S]*?requestAllPages\(/.test(clientSrc);
  const transmittedUses = /export async function requestTransmittedDocs[\s\S]*?requestAllPages\(/.test(clientSrc);
  const incomeUses = /export async function requestMyIncome[\s\S]*?requestAllPages\(/.test(clientSrc);
  const hasNextTokenHandling = /nextPartitionKey/.test(clientSrc) && /nextRowKey/.test(clientSrc);
  log("requestDocs uses requestAllPages", requestDocsUses);
  log("requestTransmittedDocs uses requestAllPages", transmittedUses);
  log("requestMyIncome uses requestAllPages", incomeUses);
  log("requestAllPages handles nextPartitionKey/nextRowKey", hasNextTokenHandling);

  console.log(`\n===== ${fails === 0 ? "ALL PASSED" : fails + " FAILED"} =====`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
