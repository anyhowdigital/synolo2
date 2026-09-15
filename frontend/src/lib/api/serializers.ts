import type { Customer, Invoice, InvoiceLine, Product } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";

export function serializeInvoice(inv: Invoice, lines?: InvoiceLine[]) {
  const dt = getDocumentType(inv.invoiceType);
  return {
    id: inv.id,
    number: inv.status === "draft" ? null : invoiceDisplayNumber(inv),
    series: inv.seriesCode,
    aa: inv.number || null,
    invoiceType: inv.invoiceType,
    documentKind: dt.kind,
    documentName: dt.name,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    exchangeRate: inv.exchangeRate,
    paymentMethod: inv.paymentMethod,
    notes: inv.notes,
    customer: {
      id: inv.customerId,
      name: inv.customerName,
      afm: inv.customerAfm,
      doy: inv.customerDoy,
      address: inv.customerAddress,
      country: inv.customerCountry,
    },
    totals: {
      net: inv.totalNetValue,
      vat: inv.totalVatAmount,
      withheld: inv.totalWithheldAmount,
      stampDuty: inv.totalStampDutyAmount,
      gross: inv.totalGrossValue,
      paid: inv.paidAmount,
    },
    mydata: {
      status: inv.mydataStatus,
      mark: inv.mydataMark,
      uid: inv.mydataUid,
      authenticationCode: inv.mydataAuthCode,
      qrUrl: inv.mydataQrUrl,
      cancellationMark: inv.mydataCancellationMark,
      error: inv.mydataError,
      sentAt: inv.mydataSentAt,
    },
    publicUrl: inv.publicToken ? `/p/${inv.publicToken}` : null,
    lines: lines?.map((l) => ({
      lineNumber: l.lineNumber,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      vatCategory: l.vatCategory,
      vatExemptionCategory: l.vatExemptionCategory,
      measurementUnit: l.measurementUnit,
      classificationCategory: l.classificationCategory,
      classificationType: l.classificationType,
      withholdingCategory: l.withholdingCategory,
      stampDutyCategory: l.stampDutyCategory,
      netValue: l.netValue,
      vatAmount: l.vatAmount,
      grossValue: l.grossValue,
    })),
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

export function serializeCustomer(c: Customer) {
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    afm: c.afm,
    doy: c.doy,
    activity: c.activity,
    address: c.address,
    city: c.city,
    postalCode: c.postalCode,
    country: c.country,
    email: c.email,
    phone: c.phone,
    contactPerson: c.contactPerson,
    stage: c.stage,
    paymentTermsDays: c.paymentTermsDays,
    createdAt: c.createdAt,
  };
}

export function serializeProduct(p: Product) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    kind: p.kind,
    unitPrice: p.unitPrice,
    vatCategory: p.vatCategory,
    vatExemptionCategory: p.vatExemptionCategory,
    measurementUnit: p.measurementUnit,
    classificationCategory: p.classificationCategory,
    classificationType: p.classificationType,
    trackStock: p.trackStock,
    stockQuantity: p.stockQuantity,
    active: p.active,
  };
}
