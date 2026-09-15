import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, invoices, organizations, payments, type Customer, type Invoice, type Organization, type Payment } from "@/db/schema";
import { randomToken } from "@/lib/auth/password";
import { getDocumentType } from "@/lib/greek/document-types";
import { round2 } from "@/lib/invoice/totals";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";
import { ensurePublicToken } from "./invoices";
import { invoiceDisplayNumber } from "./invoice-display";
import { creditSummary } from "./credits";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Εξασφαλίζει σταθερό token πρόσβασης του πελάτη στο portal. */
export async function ensurePortalToken(db: Db, customer: Customer) {
  if (customer.portalToken) return customer.portalToken;
  const token = randomToken(32);
  await db.update(customers).set({ portalToken: token }).where(eq(customers.id, customer.id));
  return token;
}

/** Ανανέωση token – ακυρώνει όλους τους παλιούς συνδέσμους portal του πελάτη. */
export async function rotatePortalToken(db: Db, customer: Customer) {
  const token = randomToken(32);
  await db.update(customers).set({ portalToken: token }).where(eq(customers.id, customer.id));
  return token;
}

export function portalUrl(token: string) {
  return appUrl(`/portal/${token}`);
}

export async function getPortalCustomer(db: Db, token: string): Promise<{ customer: Customer; org: Organization } | null> {
  if (!token || token.length < 16) return null;
  const customer = await db.query.customers.findFirst({ where: eq(customers.portalToken, token) });
  if (!customer) return null;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, customer.orgId) });
  if (!org) return null;
  return { customer, org };
}

export async function touchPortalSeen(db: Db, customerId: string) {
  await db.update(customers).set({ portalLastSeenAt: new Date().toISOString() }).where(eq(customers.id, customerId));
}

export interface PortalDocument {
  invoice: Invoice;
  publicToken: string;
  typeName: string;
  typeShort: string;
  kind: "invoice" | "quote" | "delivery";
  credit: boolean;
  remaining: number;
  overdue: boolean;
}

export interface PortalData {
  documents: PortalDocument[];
  payments: (Payment & { invoiceNumber: string })[];
  totals: { billed: number; paid: number; outstanding: number; overdue: number; openQuotes: number; credit: number };
}

/** Όλα τα στοιχεία που βλέπει ο πελάτης στο portal: παραστατικά (πλην προχείρων), πληρωμές, υπόλοιπα. */
export async function loadPortalData(db: Db, customer: Customer): Promise<PortalData> {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, customer.orgId), eq(invoices.customerId, customer.id), ne(invoices.status, "draft")))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));

  const today = new Date().toISOString().slice(0, 10);
  const documents: PortalDocument[] = [];
  for (const inv of rows) {
    const dt = getDocumentType(inv.invoiceType);
    const publicToken = await ensurePublicToken(db, inv);
    const remaining = dt.kind === "invoice" && !dt.credit && inv.status !== "cancelled" ? round2(inv.totalGrossValue - inv.paidAmount) : 0;
    documents.push({
      invoice: inv,
      publicToken,
      typeName: dt.name,
      typeShort: dt.short,
      kind: dt.kind,
      credit: !!dt.credit,
      remaining,
      overdue: remaining > 0 && !!inv.dueDate && inv.dueDate < today,
    });
  }

  const invoiceIds = documents.filter((d) => d.kind === "invoice").map((d) => d.invoice.id);
  const paymentRows = invoiceIds.length
    ? await db.select().from(payments).where(inArray(payments.invoiceId, invoiceIds)).orderBy(desc(payments.paidAt))
    : [];
  const numberOf = new Map(documents.map((d) => [d.invoice.id, invoiceDisplayNumber(d.invoice)]));

  const active = documents.filter((d) => d.kind === "invoice" && d.invoice.status !== "cancelled");
  const billed = round2(active.reduce((s, d) => s + (d.credit ? -1 : 1) * d.invoice.totalGrossValue, 0));
  const paid = round2(active.filter((d) => !d.credit).reduce((s, d) => s + d.invoice.paidAmount, 0));
  const outstanding = round2(active.reduce((s, d) => s + d.remaining, 0));
  const overdue = round2(active.filter((d) => d.overdue).reduce((s, d) => s + d.remaining, 0));
  const openQuotes = documents.filter((d) => d.kind === "quote" && d.invoice.status === "issued").length;
  const credit = (await creditSummary(db, customer.orgId, customer.id)).available;

  return {
    documents,
    payments: paymentRows.map((p) => ({ ...p, invoiceNumber: numberOf.get(p.invoiceId) ?? "" })),
    totals: { billed, paid, outstanding, overdue, openQuotes, credit },
  };
}

/** Αποστολή magic link πρόσβασης στο portal προς τον πελάτη. */
export async function emailPortalLink(db: Db, org: Organization, customer: Customer, opts: { to?: string; message?: string } = {}) {
  const to = (opts.to ?? customer.email ?? "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("Ο πελάτης δεν έχει έγκυρο email.");
  const token = await ensurePortalToken(db, customer);
  const url = portalUrl(token);
  const body =
    `<p>Αγαπητέ/ή ${esc(customer.name)},</p>` +
    `<p>Η <strong>${esc(org.name)}</strong> σάς παρέχει πρόσβαση στην προσωπική σας σελίδα πελάτη, όπου μπορείτε να δείτε όλα τα παραστατικά σας, ` +
    `το υπόλοιπό σας, τις πληρωμές που έχουν καταχωρηθεί και να κατεβάσετε PDF – χωρίς κωδικούς.</p>` +
    (opts.message ? `<p style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px;color:#444">${esc(opts.message)}</p>` : "") +
    `<p style="font-size:13px;color:#555">Ο σύνδεσμος είναι προσωπικός – μην τον προωθείτε σε τρίτους. Αν δεν τον ζητήσατε, μπορείτε να αγνοήσετε αυτό το μήνυμα.</p>` +
    `<p>Με εκτίμηση,<br/>${esc(org.name)}</p>`;
  const result = await sendMail(db, {
    orgId: org.id,
    to,
    subject: `Η σελίδα πελάτη σας – ${org.name}`,
    html: layoutEmail("Πρόσβαση στη σελίδα πελάτη", body, { label: "Άνοιγμα σελίδας πελάτη", url }),
    relatedEntity: "customer",
    relatedId: customer.id,
  });
  return { ...result, url };
}

/**
 * Δημόσιο αίτημα magic link με email: βρίσκει όλους τους πελάτες με αυτό το email (σε όποιον οργανισμό)
 * και στέλνει έναν σύνδεσμο ανά οργανισμό. Επιστρέφει πόσα emails στάλθηκαν (δεν αποκαλύπτεται στον χρήστη).
 */
export async function requestPortalLinks(db: Db, email: string): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 0;
  const rows = await db
    .select()
    .from(customers)
    .where(sql`lower(trim(${customers.email})) = ${normalized}`)
    .limit(10);
  let sent = 0;
  for (const c of rows) {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, c.orgId) });
    if (!org) continue;
    try {
      await emailPortalLink(db, org, c, { to: normalized });
      sent++;
    } catch {
      // Συνεχίζουμε με τους υπόλοιπους οργανισμούς.
    }
  }
  return sent;
}
