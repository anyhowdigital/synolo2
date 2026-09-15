import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { customers, invoices, organizations } from "@/db/schema";
import { getInvoiceByPublicToken, invoiceDisplayNumber } from "@/lib/services/invoices";
import { getDocumentType } from "@/lib/greek/document-types";
import { baseLang, documentTitle, formatDocDate, formatDocMoney } from "@/lib/pdf/labels";
import { publicText } from "@/lib/i18n/public";
import { LanguageSwitcher } from "@/components/public/language-switcher";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { documentPresentation } from "@/lib/services/document-theme";
import { PrintToolbar } from "@/components/invoices/print-toolbar";
import { QuoteDecision } from "@/components/public/quote-decision";
import { PayOnlineButton } from "@/components/public/pay-online-button";
import { Badge } from "@/components/ui/badge";
import { formatRf, invoicePaymentReference } from "@/lib/invoice/payment-reference";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, CreditCard } from "lucide-react";
import { onlinePaymentAvailable, remainingAmount, settleStripeSessionById } from "@/lib/payments/online";
import { recordDocumentView } from "@/lib/services/document-views";
import { listCustomerThread } from "@/lib/services/collab";
import { PublicThread } from "@/components/public/public-thread";
import { QuoteAcceptanceRecord } from "@/components/invoices/quote-acceptance";
import { VivaIrisPaymentOptions } from "@/components/public/viva-iris-payment";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const inv = await getInvoiceByPublicToken(db, token);
  if (!inv) return { title: "Δεν βρέθηκε" };
  return { title: `${getDocumentType(inv.invoiceType).name} ${invoiceDisplayNumber(inv)}`, robots: { index: false, follow: false } };
}

export default async function PublicInvoicePage({ params, searchParams }: PageProps<"/p/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  // Fallback επιβεβαίωσης Stripe από το success_url (όταν δεν έχει ρυθμιστεί webhook) – idempotent.
  if (typeof sp.session_id === "string") await settleStripeSessionById(db, sp.session_id).catch(() => "ignored");
  const invoice = await getInvoiceByPublicToken(db, token);
  if (!invoice || invoice.status === "draft") notFound();
  const h = await headers();
  const [org, correlated, portalCustomer, thread] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, invoice.orgId) }),
    invoice.correlatedInvoiceId ? db.query.invoices.findFirst({ where: eq(invoices.id, invoice.correlatedInvoiceId) }) : Promise.resolve(null),
    invoice.customerId ? db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId), columns: { portalToken: true } }) : Promise.resolve(null),
    listCustomerThread(db, invoice.orgId, "invoice", invoice.id),
    recordDocumentView(db, invoice, sp.src === "portal" ? "portal" : "link", { ip: (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim(), userAgent: h.get("user-agent") }),
  ]);
  if (!org) notFound();
  const qrDataUrl = invoice.mydataQrUrl ? await QRCode.toDataURL(invoice.mydataQrUrl, { margin: 0, width: 192 }) : null;
  const presentation = await documentPresentation(db, org, invoice, typeof sp.lang === "string" ? sp.lang : null);
  const lang = presentation.lang;
  const ui = baseLang(lang);
  const tx = publicText(ui);
  const formatMoney = (n: number, cur: string) => formatDocMoney(n, cur, lang);
  const formatDate = (iso: string | null | undefined) => formatDocDate(iso, lang);
  const dt = getDocumentType(invoice.invoiceType);
  const isQuote = dt.kind === "quote";
  const remaining = remainingAmount(invoice);
  const canPayOnline = onlinePaymentAvailable(org, invoice);
  const rf = !isQuote && !dt.credit ? invoicePaymentReference(invoice) : null;
  const justPaid = sp.paid === "1";
  const cancelled = sp.cancelled === "1";

  return (
    <div className="min-h-screen bg-neutral-100">
      <PrintToolbar pdfHref={`/p/${token}/pdf?lang=${lang}`} lang={ui}>
        <LanguageSwitcher current={lang} bilingual={org.bilingualInvoices} />
      </PrintToolbar>
      <div className="mx-auto max-w-[210mm] px-4 py-8 print:p-0">
        {justPaid && invoice.status === "paid" ? (
          <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-900 print:hidden">
            <CheckCircle2 className="text-emerald-600" />
            <AlertDescription className="text-emerald-900">{tx.paymentDone}</AlertDescription>
          </Alert>
        ) : justPaid && !canPayOnline ? null : cancelled ? (
          <Alert className="mb-4 bg-white print:hidden">
            <CreditCard />
            <AlertDescription>{tx.paymentCancelled}</AlertDescription>
          </Alert>
        ) : null}
        <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm print:hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{org.name}</div>
              <h1 className="mt-1 text-xl font-semibold">
                {documentTitle(dt.code, dt.name, lang)} {invoiceDisplayNumber(invoice)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(invoice.issueDate)} · {invoice.customerName}
                {invoice.dueDate ? ` · ${isQuote ? tx.validUntil : tx.due} ${formatDate(invoice.dueDate)}` : ""}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">{formatMoney(invoice.totalGrossValue, invoice.currency)}</div>
              {!isQuote ? (
                invoice.status === "paid" ? (
                  <Badge className="mt-1 bg-emerald-600">{tx.paid}</Badge>
                ) : invoice.status === "cancelled" ? (
                  <Badge variant="destructive" className="mt-1">{tx.cancelled}</Badge>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {tx.balance} {formatMoney(remaining, invoice.currency)}
                  </div>
                )
              ) : null}
            </div>
          </div>

          {isQuote ? (
            <div className="mt-5 border-t pt-5">
              {invoice.status === "issued" ? (
                <>
                  <p className="mb-3 text-sm">{tx.quoteIntro}</p>
                  <QuoteDecision token={token} orgName={org.name} lang={ui} />
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {invoice.status === "accepted" ? tx.quoteAccepted : invoice.status === "converted" ? tx.quoteConverted : tx.quoteRejected}
                  </p>
                  <QuoteAcceptanceRecord invoice={invoice} />
                </div>
              )}
            </div>
          ) : (canPayOnline || org.iban) && invoice.status !== "paid" && invoice.status !== "cancelled" ? (
            <div className="mt-5 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
              {canPayOnline ? (
                <div>
                  <div className="mb-2 font-medium">{tx.payByCard}</div>
                  <PayOnlineButton token={token} label={`${tx.pay} ${formatMoney(remaining, invoice.currency)}`} />
                  <p className="mt-2 text-xs text-muted-foreground">{tx.payByCardHint}</p>
                </div>
              ) : null}
              {org.iban ? (
                <div>
                  <div className="font-medium">{tx.bankTransfer}</div>
                  <div className="text-muted-foreground">
                    {org.bankName ? `${org.bankName} · ` : ""}IBAN <span className="font-mono text-foreground">{org.iban}</span>
                    <br />
                    {tx.reference}: {rf ? formatRf(rf) : invoiceDisplayNumber(invoice)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <InvoiceDocument org={org} invoice={invoice} lines={invoice.lines} qrDataUrl={qrDataUrl} correlated={correlated ?? null} theme={presentation.theme} terms={presentation.terms} lang={lang} className="shadow-md" />
        {!isQuote && invoice.status !== "paid" && invoice.status !== "cancelled" && (invoice.customerCountry === "GR" || !invoice.customerCountry) ? (
          <div className="mt-6 print:hidden">
            <VivaIrisPaymentOptions
              amount={remaining}
              currency={invoice.currency}
              invoiceNumber={invoiceDisplayNumber(invoice)}
              orgName={org.name}
              iban={org.iban ?? undefined}
            />
          </div>
        ) : null}
        <div className="mt-6">
          <PublicThread
            token={token}
            orgName={org.name}
            defaultName={invoice.customerName ?? ""}
            closed={invoice.status === "cancelled"}
            lang={ui}
            messages={thread.map((m) => ({ id: m.id, authorName: m.authorName, authorType: m.authorType, body: m.body, createdAt: m.createdAt }))}
          />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">
          {portalCustomer?.portalToken ? (
            <>
              <Link href={`/portal/${portalCustomer.portalToken}`} className="font-medium text-foreground underline">
                {tx.allDocuments}
              </Link>
              {" · "}
            </>
          ) : null}
          {tx.personalLink}
        </p>
      </div>
    </div>
  );
}
