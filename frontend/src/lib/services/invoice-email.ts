import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { invoices, type Invoice, type Organization } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";
import { buildInvoicesDocXml } from "@/lib/mydata/xml";
import { formatRf, invoicePaymentReference } from "@/lib/invoice/payment-reference";
import { documentTitle, formatDocDate, formatDocMoney } from "@/lib/pdf/labels";
import { emailText } from "@/lib/i18n/email";
import { buildInvoicePdf } from "./invoice-pdf";
import { customerLanguage } from "./document-theme";
import { lateCharges } from "./credit-profile";
import { ensurePublicToken, getInvoiceWithLines, invoiceDisplayNumber } from "./invoices";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Αποστολή παραστατικού στον πελάτη με δημόσιο σύνδεσμο προβολής/εκτύπωσης, στη γλώσσα του πελάτη. */
export async function emailInvoice(db: Db, org: Organization, invoiceId: string, opts: { to: string; message?: string }) {
  const inv = await getInvoiceWithLines(db, org.id, invoiceId);
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (inv.status === "draft") throw new Error("Εκδώστε πρώτα το παραστατικό.");
  if (!opts.to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.to)) throw new Error("Μη έγκυρη διεύθυνση email.");

  const [token, lang] = await Promise.all([ensurePublicToken(db, inv), customerLanguage(db, inv.customerId)]);
  const tx = emailText(lang);
  const dt = getDocumentType(inv.invoiceType);
  const docName = documentTitle(dt.code, dt.name, lang);
  const number = invoiceDisplayNumber(inv);
  const url = appUrl(`/p/${token}`);
  const isQuote = dt.kind === "quote";
  const rf = !isQuote && dt.kind === "invoice" && !dt.credit ? invoicePaymentReference(inv) : null;
  const money = (n: number) => formatDocMoney(n, inv.currency, lang);
  const date = (iso: string) => formatDocDate(iso, lang);

  const body =
    `<p>${tx.dear(esc(inv.customerName || ""))}</p>` +
    `<p>${isQuote ? tx.sendingQuote : tx.sendingDocument(`${esc(docName)} ${esc(number)}`)} ${tx.datedTotal(date(inv.issueDate), money(inv.totalGrossValue))}` +
    (inv.dueDate && !isQuote ? tx.dueDate(date(inv.dueDate)) : "") +
    `</p>` +
    (opts.message ? `<p style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px;color:#444">${esc(opts.message)}</p>` : "") +
    (org.iban && !isQuote
      ? `<p>${tx.paymentDetails}: ${esc(org.bankName ?? "")} · IBAN <strong>${esc(org.iban)}</strong>${rf ? `<br/>${tx.paymentRef(formatRf(rf))}` : ""}</p>`
      : "") +
    `<p style="font-size:13px;color:#555">${inv.mydataMark && !isQuote ? tx.attachedPdfXml : tx.attachedPdf}</p>` +
    (inv.mydataMark ? `<p style="font-size:12px;color:#666">${tx.transmitted(inv.mydataMark)}</p>` : "") +
    `<p>${tx.regards}<br/>${esc(org.name)}</p>`;

  const pdf = await buildInvoicePdf(db, org, inv);
  const attachments: { filename: string; content: string | Buffer; contentType?: string }[] = [
    { filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" },
  ];
  if (inv.mydataMark && !isQuote) {
    attachments.push({ filename: `${number}.xml`, content: buildInvoicesDocXml({ org, invoice: inv, lines: inv.lines }), contentType: "application/xml" });
  }

  const result = await sendMail(db, {
    orgId: org.id,
    to: opts.to,
    subject: isQuote ? tx.quoteSubject(number, org.name) : tx.docSubject(docName, number, org.name),
    html: layoutEmail(isQuote ? tx.quoteTitle(number) : `${docName} ${number}`, body, { label: isQuote ? tx.viewAccept : tx.viewDocument, url }, { trackingPixelUrl: appUrl(`/p/${token}/open`) }),
    attachments,
    relatedEntity: "invoice",
    relatedId: inv.id,
  });
  await db.update(invoices).set({ emailedAt: new Date().toISOString() }).where(eq(invoices.id, inv.id));
  return { ...result, url };
}

/** Υπενθύμιση πληρωμής για ληξιπρόθεσμο παραστατικό, στη γλώσσα του πελάτη. */
export async function emailPaymentReminder(db: Db, org: Organization, inv: Invoice, to: string, options: { tone?: "upcoming" | "due" | "late" | "final" } = {}) {
  const [token, lang] = await Promise.all([ensurePublicToken(db, inv), customerLanguage(db, inv.customerId)]);
  const tx = emailText(lang);
  const number = invoiceDisplayNumber(inv);
  const remaining = inv.totalGrossValue - inv.paidAmount;
  const daysLate = inv.dueDate ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000) : 0;
  const date = (iso: string) => formatDocDate(iso, lang);
  const rf = invoicePaymentReference(inv);
  const charges = lateCharges(org, inv);
  const toneNote =
    lang === "el" && options.tone
      ? {
          upcoming: `<p>Υπενθυμίζουμε φιλικά ότι το παραστατικό λήγει σε ${Math.abs(daysLate)} ${Math.abs(daysLate) === 1 ? "ημέρα" : "ημέρες"}.</p>`,
          due: `<p>Το παραστατικό λήγει σήμερα. Θα εκτιμούσαμε την έγκαιρη εξόφλησή του.</p>`,
          late: `<p>Το παραστατικό παραμένει ανεξόφλητο. Παρακαλούμε να προχωρήσετε στην εξόφληση ή να επικοινωνήσετε μαζί μας για διακανονισμό.</p>`,
          final: `<p><strong>Τελική όχληση.</strong> Εφόσον η οφειλή δεν εξοφληθεί άμεσα, επιφυλασσόμαστε παντός νομίμου δικαιώματος, συμπεριλαμβανομένης της χρέωσης τόκων υπερημερίας.</p>`,
        }[options.tone]
      : "";
  const chargesNote =
    lang === "el" && charges.total > 0.005
      ? `<p>Λόγω καθυστέρησης ${charges.daysLate} ημερών έχουν υπολογιστεί ${formatDocMoney(charges.total, inv.currency, lang)} ` +
        `(${charges.interest > 0 ? `τόκοι υπερημερίας ${formatDocMoney(charges.interest, inv.currency, lang)}` : ""}${charges.interest > 0 && charges.flat > 0 ? " · " : ""}${charges.flat > 0 ? `χρέωση καθυστέρησης ${formatDocMoney(charges.flat, inv.currency, lang)}` : ""}).</p>`
      : "";
  const body =
    `<p>${tx.dear(esc(inv.customerName || ""))}</p>` +
    `<p>${tx.reminderBody(esc(number), date(inv.issueDate), formatDocMoney(remaining, inv.currency, lang))}` +
    (daysLate > 0 ? tx.overdueBy(daysLate, date(inv.dueDate!)) : tx.dueOn(inv.dueDate ? date(inv.dueDate) : "—")) +
    `</p>` +
    toneNote +
    chargesNote +
    (org.iban ? `<p>${tx.paymentDetails}: ${esc(org.bankName ?? "")} · IBAN <strong>${esc(org.iban)}</strong><br/>${rf ? tx.reminderPayRef(formatRf(rf)) : tx.reminderPayNumber(esc(number))}</p>` : "") +
    `<p>${tx.alreadyPaid}</p><p>${tx.regards}<br/>${esc(org.name)}</p>`;
  const result = await sendMail(db, {
    orgId: org.id,
    to,
    subject: tx.reminderSubject(number, org.name),
    html: layoutEmail(tx.reminderTitle, body, { label: tx.viewDocument, url: appUrl(`/p/${token}`) }, { trackingPixelUrl: appUrl(`/p/${token}/open`) }),
    relatedEntity: "invoice",
    relatedId: inv.id,
  });
  await db
    .update(invoices)
    .set({ lastReminderAt: new Date().toISOString(), reminderCount: inv.reminderCount + 1 })
    .where(eq(invoices.id, inv.id));
  return result;
}
