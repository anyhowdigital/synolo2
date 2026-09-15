import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, invoices, type Customer, type Invoice, type InvoiceLine, type Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { isValidAfm } from "@/lib/greek/afm";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { audit } from "@/lib/services/audit";
import { B2G_ADJUSTMENT_ERROR, b2gReferences, buildPeppolInvoiceXml, hasUnsupportedB2GAdjustments, isValidProjectReference, isValidCpv, greekInvoiceId } from "@/lib/b2g/ubl";
import { getProvider, providerSend, providerStatus } from "@/lib/b2g/providers";
import type { AuditActor } from "@/lib/services/audit";

// Τα labels κατάστασης ζουν στο @/lib/b2g/providers (client-safe)


/** Έλεγχοι πληρότητας πριν την αποστολή στο Δημόσιο. Επιστρέφει λίστα λαθών (κενή = OK). */
export function validateB2G(org: Organization, invoice: Invoice, lines: InvoiceLine[], customer: Customer | null): string[] {
  const errors: string[] = [];
  const dt = getDocumentType(invoice.invoiceType);
  const refs = b2gReferences(invoice, customer);

  if (!org.b2gEnabled) errors.push("Η τιμολόγηση Δημοσίου δεν είναι ενεργή. Ρυθμίσεις → Δημόσιο (B2G).");
  if (dt.kind !== "invoice") errors.push("Μόνο φορολογικά παραστατικά (τιμολόγια/πιστωτικά) διαβιβάζονται στο Δημόσιο.");
  if (invoice.status === "draft") errors.push("Εκδώστε πρώτα το παραστατικό (είναι πρόχειρο).");
  else if (!["issued", "partially_paid", "paid"].includes(invoice.status)) errors.push("Ακυρωμένα ή μη ενεργά παραστατικά δεν διαβιβάζονται στο Δημόσιο.");
  if (hasUnsupportedB2GAdjustments(invoice)) errors.push(B2G_ADJUSTMENT_ERROR);
  if (dt.requiresCorrelation && !invoice.correlatedInvoiceId) errors.push("Συνδέστε το πιστωτικό με το αρχικό παραστατικό (BT-25).");
  if (!customer?.publicEntity) errors.push("Ο πελάτης δεν είναι σημειωμένος ως «Φορέας Δημοσίου».");
  if (!org.afm) errors.push("Λείπει το ΑΦΜ της επιχείρησής σας (εκδότης).");
  if (!org.iban) errors.push("Λείπει IBAN πληρωμής στα στοιχεία της επιχείρησης (απαιτείται από το PEPPOL).");
  const buyerAfm = invoice.customerAfm || customer?.afm || "";
  if (!buyerAfm) errors.push("Λείπει το ΑΦΜ του φορέα (λήπτης).");
  else if ((invoice.customerCountry || "GR") === "GR" && !isValidAfm(buyerAfm)) errors.push("Το ΑΦΜ του φορέα δεν είναι έγκυρο.");
  if (!refs.buyerIdentifier) errors.push("Λείπει ο κωδικός Αναθέτουσας Αρχής (BT-46, «C.A. label code», π.χ. 1017.000000000.0183) — τον δίνει ο φορέας.");
  if (!refs.contractAdam) errors.push("Λείπει ο ΑΔΑΜ σύμβασης ΚΗΜΔΗΣ (BT-12, π.χ. 24SYMV001234567). Αν δεν υπάρχει σύμβαση, καταχωρίστε «0».");
  else if (refs.contractAdam !== "0" && !/^\d{2}(SYMV|PROC|AWRD|REQ)\d{9}$/i.test(refs.contractAdam)) errors.push("Ο ΑΔΑΜ (BT-12) έχει μορφή «24SYMV001234567» (2 ψηφία έτους + SYMV + 9 ψηφία) ή «0».");
  if (!refs.projectReference) errors.push("Λείπει η αναφορά προϋπολογισμού/έργου (BT-11): «1|ΑΔΑ ανάληψης» (τακτικός), «2|ενάριθμος ΠΔΕ», «3|ΑΔΑ» (λοιποί).");
  else if (!isValidProjectReference(refs.projectReference)) errors.push("Η αναφορά έργου (BT-11) πρέπει να έχει μορφή «1|ΑΔΑ», «2|ενάριθμος» ή «3|ΑΔΑ» χωρίς κενά.");
  if (refs.cpv && !isValidCpv(refs.cpv)) errors.push("Ο κωδικός CPV (BT-158) έχει μορφή 8 ψηφίων με προαιρετικό ψηφίο ελέγχου, π.χ. 72000000-5.");
  if ((org.country || "GR") === "GR" && !invoice.mydataMark) errors.push("Απαιτείται ΜΑΡΚ myDATA (GR-R-004): διαβιβάστε πρώτα το παραστατικό στο myDATA.");
  if (!org.legalName && !org.name) errors.push("Λείπει η επωνυμία όπως στο ΓΕΜΗ/Μητρώο (GR-R-002).");
  if (invoice.currency && invoice.currency !== "EUR") errors.push("Το Δημόσιο δέχεται παραστατικά μόνο σε EUR.");
  if (!lines.length) errors.push("Το παραστατικό δεν έχει γραμμές.");
  if (lines.some((l) => !l.description.trim())) errors.push("Όλες οι γραμμές πρέπει να έχουν περιγραφή.");
  return errors;
}

export async function loadB2GCustomer(db: Db, invoice: Invoice): Promise<Customer | null> {
  if (!invoice.customerId) return null;
  return (await db.query.customers.findFirst({ where: and(eq(customers.id, invoice.customerId), eq(customers.orgId, invoice.orgId)) })) ?? null;
}

export async function buildXmlFor(db: Db, org: Organization, invoice: Invoice, lines: InvoiceLine[], customer: Customer | null): Promise<string> {
  const original = invoice.correlatedInvoiceId ? await db.query.invoices.findFirst({ where: and(eq(invoices.id, invoice.correlatedInvoiceId), eq(invoices.orgId, org.id)) }) : null;
  if (invoice.correlatedInvoiceId && (!original || original.status === "draft" || original.status === "cancelled" || original.customerId !== invoice.customerId || original.currency !== invoice.currency || getDocumentType(original.invoiceType).credit)) throw new Error("Το αρχικό παραστατικό του πιστωτικού δεν είναι έγκυρο για αυτόν τον πελάτη και νόμισμα.");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  return buildPeppolInvoiceXml({
    org,
    invoice,
    lines,
    customer,
    documentNumber: greekInvoiceId(org, invoice),
    precedingInvoice: original ? { documentNumber: greekInvoiceId(org, original), issueDate: original.issueDate } : null,
    mark: invoice.mydataMark,
    invoiceUrl: appUrl && invoice.publicToken ? `${appUrl.replace(/\/$/, "")}/p/${invoice.publicToken}` : null,
    softReject: !!invoice.b2gSoftReject,
  });
}

export interface SendOutcome {
  status: string;
  providerId: string | null;
  message?: string;
}

/** Παραγωγή UBL + αποστολή στον πάροχο + καταγραφή κατάστασης. */
export async function sendB2G(db: Db, org: Organization, invoice: Invoice, lines: InvoiceLine[], actor: AuditActor | null): Promise<SendOutcome> {
  const customer = await loadB2GCustomer(db, invoice);
  if (invoice.b2gProviderId && ["pending", "sent", "accepted"].includes(invoice.b2gStatus)) throw new Error("Το παραστατικό έχει ήδη παραληφθεί από τον πάροχο. Χρησιμοποιήστε «Έλεγχος κατάστασης» αντί για νέα αποστολή.");
  const errors = validateB2G(org, invoice, lines, customer);
  if (errors.length) throw new Error(errors.join(" "));
  const xml = await buildXmlFor(db, org, invoice, lines, customer);
  const provider = getProvider(org.b2gProvider);
  const now = new Date().toISOString();
  try {
    const result = await providerSend(org, xml, invoiceDisplayNumber(invoice));
    await db
      .update(invoices)
      .set({
        b2gStatus: result.status,
        b2gProvider: provider.id,
        b2gProviderId: result.providerId,
        b2gRawStatus: result.rawStatus,
        b2gError: null,
        b2gSentAt: now,
        b2gStatusAt: now,
        b2gXml: xml,
        updatedAt: now,
      })
      .where(eq(invoices.id, invoice.id));
    await audit(db, org.id, "invoice", invoice.id, "b2g_sent", `${provider.label} · ${result.rawStatus}`, actor);
    return { status: result.status, providerId: result.providerId, message: result.message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(invoices)
      .set({ b2gStatus: "error", b2gProvider: provider.id, b2gError: message.slice(0, 500), b2gStatusAt: now, b2gXml: xml, updatedAt: now })
      .where(eq(invoices.id, invoice.id));
    await audit(db, org.id, "invoice", invoice.id, "b2g_error", message.slice(0, 200), actor);
    throw err;
  }
}

/** Ανανέωση κατάστασης από τον πάροχο (polling). */
export async function refreshB2GStatus(db: Db, org: Organization, invoice: Invoice, actor: AuditActor | null): Promise<SendOutcome> {
  if (!invoice.b2gProviderId) throw new Error("Το παραστατικό δεν έχει σταλεί ακόμη στο Δημόσιο.");
  if (invoice.b2gProvider !== org.b2gProvider || (invoice.b2gProviderId.startsWith("SIM-") && org.b2gProvider !== "simulation")) throw new Error("Ο πάροχος των ρυθμίσεων διαφέρει από αυτόν της αποστολής. Επιλέξτε τον αρχικό πάροχο πριν τον έλεγχο κατάστασης.");
  const now = new Date().toISOString();
  try {
    const result = await providerStatus(org, invoice.b2gProviderId, invoice.b2gStatus);
    await db
      .update(invoices)
      .set({ b2gStatus: result.status, b2gRawStatus: result.rawStatus, b2gError: result.status === "rejected" ? (result.message ?? "Απορρίφθηκε από τον φορέα.") : null, b2gStatusAt: now, updatedAt: now })
      .where(eq(invoices.id, invoice.id));
    if (result.status === "accepted" || result.status === "rejected") {
      await audit(db, org.id, "invoice", invoice.id, result.status === "accepted" ? "b2g_accepted" : "b2g_rejected", result.rawStatus, actor);
    }
    return { status: result.status, providerId: invoice.b2gProviderId, message: result.message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(invoices).set({ b2gError: message.slice(0, 500), b2gStatusAt: now }).where(eq(invoices.id, invoice.id));
    throw err;
  }
}
