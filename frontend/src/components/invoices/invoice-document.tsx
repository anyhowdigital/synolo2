import type { Invoice, InvoiceLine, Organization } from "@/db/schema";
import { getDocumentType, MOVE_PURPOSES } from "@/lib/greek/document-types";
import { getVatCategory, VAT_EXEMPTION_REASONS } from "@/lib/greek/vat";
import { getWithholdingTax } from "@/lib/greek/classifications";
import { round2 } from "@/lib/invoice/totals";
import { baseLang, documentTitle, formatDocDate, formatDocMoney, label, paymentMethodLabel, unitShort, type DocLang } from "@/lib/pdf/labels";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { formatRf, invoicePaymentReference } from "@/lib/invoice/payment-reference";
import { cn } from "@/lib/utils";
import { pdfCustomFields } from "@/lib/services/custom-fields";
import { parsePdfTheme, themeTokens, type PdfTheme } from "@/lib/pdf/theme";

interface Props {
  org: Organization;
  invoice: Invoice;
  lines: InvoiceLine[];
  qrDataUrl?: string | null;
  correlated?: Invoice | null;
  className?: string;
  /** Θέμα εμφάνισης – αν λείπει, διαβάζεται από τον οργανισμό. */
  theme?: PdfTheme;
  /** Όροι σειράς/οργανισμού που εκτυπώνονται κάτω από τις σημειώσεις. */
  terms?: string;
  /** Γλώσσα ετικετών (el | en | de | it | bilingual). */
  lang?: DocLang;
}

/** Εκτυπώσιμη μορφή παραστατικού (Α4) με τα υποχρεωτικά στοιχεία των ΕΛΠ (ν. 4308/2014, άρθρα 8-9). */
export function InvoiceDocument({ org, invoice, lines, qrDataUrl, correlated, className, theme: themeProp, terms: termsProp, lang = "el" }: Props) {
  const dt = getDocumentType(invoice.invoiceType);
  const t = (k: Parameters<typeof label>[0]) => label(k, lang);
  const formatMoney = (n: number, cur: string) => formatDocMoney(n, cur, lang);
  const formatDate = (iso: string | null | undefined) => formatDocDate(iso, lang);
  const theme = themeProp ?? parsePdfTheme(org.pdfThemeJson);
  const tk = themeTokens(theme);
  const terms = termsProp ?? theme.terms;
  const cols = theme.columns;
  const colCount = 3 + Number(cols.qty) + Number(cols.unitPrice) + Number(cols.discount) + Number(cols.vat);
  const vatBreakdown = new Map<number, { net: number; vat: number }>();
  for (const l of lines) {
    const rate = getVatCategory(l.vatCategory).rate;
    const e = vatBreakdown.get(rate) ?? { net: 0, vat: 0 };
    e.net = round2(e.net + l.netValue);
    e.vat = round2(e.vat + l.vatAmount);
    vatBreakdown.set(rate, e);
  }
  const exemptions = [...new Set(lines.filter((l) => l.vatCategory === 7 && l.vatExemptionCategory).map((l) => l.vatExemptionCategory!))];
  const withholdings = [...new Set(lines.filter((l) => l.withholdingCategory).map((l) => l.withholdingCategory))];
  const payment = paymentMethodLabel(invoice.paymentMethod, lang);
  const isQuote = dt.kind === "quote";
  const isDelivery = dt.kind === "delivery";
  const rf = !isQuote && !isDelivery && !dt.credit ? invoicePaymentReference(invoice) : null;

  return (
    <article
      className={cn("relative mx-auto w-full max-w-[210mm] min-h-[297mm] bg-white leading-snug text-neutral-900 shadow-sm print:max-w-none print:min-h-0 print:p-0 print:shadow-none", tk.band ? "p-0" : "p-8", tk.sideBar && "pl-12", className)}
      style={{ fontSize: `${13 * tk.scale}px`, letterSpacing: tk.letterSpacing ? "0.02em" : undefined }}
      data-template={theme.template}
      lang={baseLang(lang)}
    >
      {tk.sideBar ? <div className="absolute inset-y-0 left-0 w-4 print:hidden" style={{ backgroundColor: tk.accent }} /> : null}
      <div className={cn(tk.band && "p-8 print:p-0")} style={tk.band ? { backgroundColor: tk.accent, color: tk.onAccent } : undefined}>
      <header className={cn("flex gap-6", tk.centered ? "flex-col items-center text-center" : "items-start justify-between", !tk.band && "pb-4")} style={{ borderBottom: tk.band || tk.noRules ? "none" : `${tk.centered ? 1 : 2}px solid ${tk.rule}` }}>
        <div className={cn(tk.centered && "flex flex-col items-center")}>
          {org.logoDataUrl && theme.showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoDataUrl} alt={org.name} className="mb-2 max-h-16 max-w-[220px] object-contain object-left" />
          ) : (
            <div className={cn("font-bold tracking-tight", tk.sideBar ? "text-2xl" : "text-xl")} style={{ color: tk.band ? tk.onAccent : tk.titleColor }}>
              {org.logoText || org.name}
            </div>
          )}
          <div className="mt-1 font-medium">{org.legalName || org.name}</div>
          <div className={tk.band ? "opacity-85" : "text-neutral-600"}>{org.activity}</div>
          <div className={cn("mt-2", tk.band ? "opacity-90" : "text-neutral-700")}>
            {[org.address, org.postalCode, org.city].filter(Boolean).join(", ")}
            <br />
            {t("afm")} {org.afm} · {t("doy")} {org.doy}
            {org.gemi ? ` · ${t("gemi")} ${org.gemi}` : ""}
            <br />
            {[org.phone, org.email, org.website].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className={cn("shrink-0", tk.centered ? "text-center" : "text-right")}>
          <div className={cn("font-bold uppercase", tk.sideBar ? "text-3xl" : "text-lg")} style={{ color: tk.band ? tk.onAccent : tk.titleColor, letterSpacing: tk.letterSpacing ? "0.12em" : undefined }}>
            {documentTitle(dt.code, dt.name, lang)}
          </div>
          <div className={cn("mt-1 tabular-nums", tk.sideBar ? "text-lg font-normal" : "text-2xl font-semibold")}>{invoiceDisplayNumber(invoice)}</div>
          <table className={cn("mt-3", tk.centered ? "mx-auto text-left" : "ml-auto text-right")}>
            <tbody>
              <tr>
                <td className="pr-3 text-neutral-500">{t("date")}</td>
                <td className="font-medium">{formatDate(invoice.issueDate)}</td>
              </tr>
              {invoice.dueDate ? (
                <tr>
                  <td className="pr-3 text-neutral-500">{isQuote ? t("validUntil") : t("due")}</td>
                  <td className="font-medium">{formatDate(invoice.dueDate)}</td>
                </tr>
              ) : null}
              {!isQuote ? (
                <tr>
                  <td className="pr-3 text-neutral-500">{t("mydataType")}</td>
                  <td className="font-medium">{dt.code}</td>
                </tr>
              ) : null}
              {invoice.branch ? (
                <tr>
                  <td className="pr-3 text-neutral-500">{t("branch")}</td>
                  <td className="font-medium">{invoice.branch}</td>
                </tr>
              ) : null}
              {invoice.currency !== "EUR" && invoice.exchangeRate ? (
                <tr>
                  <td className="pr-3 text-neutral-500">{t("fxRate")}</td>
                  <td className="font-medium">1 {invoice.currency} = {invoice.exchangeRate} EUR</td>
                </tr>
              ) : null}
              {isQuote && (invoice.status === "accepted" || invoice.status === "rejected" || invoice.status === "converted") ? (
                <tr>
                  <td colSpan={2} className="pt-1 font-bold">
                    {invoice.status === "rejected" ? t("rejected") : invoice.status === "converted" ? t("converted") : t("accepted")}
                  </td>
                </tr>
              ) : null}
              {invoice.status === "cancelled" ? (
                <tr>
                  <td colSpan={2} className="pt-1 font-bold text-red-700">
                    {t("cancelled")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </header>
      </div>
      <div className={cn(tk.band && "p-8 pt-0 print:p-0")}>

      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{t("recipient")}</div>
          {dt.retail && !invoice.customerName ? (
            <div className="text-neutral-700">{t("retailCustomer")}</div>
          ) : (
            <>
              <div className="font-semibold">{invoice.customerName}</div>
              <div className="text-neutral-700">
                {invoice.customerAddress}
                {invoice.customerAfm ? (
                  <>
                    <br />
                    {invoice.customerCountry === "GR" ? t("afm") : t("vatNo")} {invoice.customerAfm}
                    {invoice.customerDoy ? ` · ${t("doy")} ${invoice.customerDoy}` : ""}
                  </>
                ) : null}
                {invoice.customerCountry !== "GR" ? (
                  <>
                    <br />
                    {t("country")}: {invoice.customerCountry}
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{isDelivery ? t("dispatch") : t("payment")}</div>
          <div className="text-neutral-700">
            {isDelivery ? (
              <>
                {t("dispatchDate")}: {invoice.dispatchDate ? formatDate(invoice.dispatchDate) : formatDate(invoice.issueDate)}
                <br />
                {t("purpose")}: {MOVE_PURPOSES.find((m) => m.code === invoice.movePurpose)?.label ?? "—"}
                {invoice.vehicleNumber ? (
                  <>
                    <br />
                    {t("vehicle")}: {invoice.vehicleNumber}
                  </>
                ) : null}
                <br />
                {t("from")}: {invoice.loadingAddress || [org.address, org.postalCode, org.city].filter(Boolean).join(", ")}
                <br />
                {t("to")}: {invoice.deliveryAddress || invoice.customerAddress || "—"}
              </>
            ) : (
              <>{t("paymentMethod")}: {payment}</>
            )}
            {org.iban && theme.showBankDetails ? (
              <>
                <br />
                IBAN: <span className="font-mono">{org.iban}</span>
                {org.bankName ? ` (${org.bankName})` : ""}
              </>
            ) : null}
            {rf && theme.showBankDetails ? (
              <>
                <br />
                {t("paymentRef")}: <span className="font-mono font-semibold text-neutral-900">{formatRf(rf)}</span>
              </>
            ) : null}
            {invoice.selfPricing ? (
              <>
                <br />
                <span className="font-semibold">{t("selfPricing")}</span>
              </>
            ) : null}
            {correlated ? (
              <>
                <br />
                {t("correlated")}: {invoiceDisplayNumber(correlated)} ({formatDate(correlated.issueDate)})
                {correlated.mydataMark ? ` · MARK ${correlated.mydataMark}` : ""}
              </>
            ) : null}
          </div>
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className={cn("text-left text-[11px] tracking-wide uppercase", tk.filledHead && "[&>th]:px-1.5 [&>th]:py-1.5 [&>th:first-child]:rounded-l [&>th:last-child]:rounded-r")} style={{ borderBottom: tk.filledHead || tk.noRules ? "none" : `1px solid ${tk.rule}`, color: tk.filledHead ? tk.onAccent : tk.headText, backgroundColor: tk.filledHead ? tk.accent : tk.striped ? "#f5f5f5" : undefined }}>
            <th className="py-1.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 pr-2 font-semibold">{t("description")}</th>
            {cols.qty ? <th className="py-1.5 pr-2 text-right font-semibold">{t("qty")}</th> : null}
            {cols.unitPrice ? <th className="py-1.5 pr-2 text-right font-semibold">{t("unitPrice")}</th> : null}
            {cols.discount ? <th className="py-1.5 pr-2 text-right font-semibold">{t("discount")}</th> : null}
            {cols.vat ? <th className="py-1.5 pr-2 text-right font-semibold">{t("vat")}</th> : null}
            <th className="py-1.5 text-right font-semibold">{t("net")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="align-top" style={{ borderBottom: tk.noRules ? "none" : `1px solid ${tk.ruleLight}`, backgroundColor: tk.striped && i % 2 === 1 ? "#fafafa" : undefined }}>
              <td className="pr-2 text-neutral-500" style={{ paddingBlock: tk.rowPad * 2 }}>{l.lineNumber}</td>
              <td className="pr-2" style={{ paddingBlock: tk.rowPad * 2 }}>
                {l.description}
                {!cols.qty && l.quantity !== 1 ? <span className="text-neutral-500"> × {l.quantity} {unitShort(l.measurementUnit, lang)}</span> : null}
              </td>
              {cols.qty ? (
                <td className="pr-2 text-right tabular-nums whitespace-nowrap" style={{ paddingBlock: tk.rowPad * 2 }}>
                  {l.quantity} {unitShort(l.measurementUnit, lang)}
                </td>
              ) : null}
              {cols.unitPrice ? <td className="pr-2 text-right tabular-nums" style={{ paddingBlock: tk.rowPad * 2 }}>{formatMoney(l.unitPrice, invoice.currency)}</td> : null}
              {cols.discount ? <td className="pr-2 text-right tabular-nums" style={{ paddingBlock: tk.rowPad * 2 }}>{l.discountPercent ? `${l.discountPercent}%` : "—"}</td> : null}
              {cols.vat ? <td className="pr-2 text-right tabular-nums" style={{ paddingBlock: tk.rowPad * 2 }}>{getVatCategory(l.vatCategory).label}</td> : null}
              <td className="text-right tabular-nums" style={{ paddingBlock: tk.rowPad * 2 }}>{formatMoney(l.netValue, invoice.currency)}</td>
            </tr>
          ))}
          {lines.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-3 text-center text-neutral-400">
                {t("noLines")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <section className="mt-5 flex items-start justify-between gap-6">
        <div className="max-w-[55%] space-y-2 text-[12px] text-neutral-700">
          {vatBreakdown.size > 0 && theme.showVatBreakdown ? (
            <table className="text-[12px]">
              <thead>
                <tr className="text-neutral-500">
                  <th className="pr-4 text-left font-medium">{t("vatRate")}</th>
                  <th className="pr-4 text-right font-medium">{t("net")}</th>
                  <th className="text-right font-medium">{t("vat")}</th>
                </tr>
              </thead>
              <tbody>
                {[...vatBreakdown.entries()].map(([rate, v]) => (
                  <tr key={rate}>
                    <td className="pr-4">{rate}%</td>
                    <td className="pr-4 text-right tabular-nums">{formatMoney(v.net, invoice.currency)}</td>
                    <td className="text-right tabular-nums">{formatMoney(v.vat, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {exemptions.map((code) => (
            <p key={code}>{t("vatExemption")}: {VAT_EXEMPTION_REASONS.find((r) => r.code === code)?.label}</p>
          ))}
          {withholdings.map((code) => (
            <p key={code}>{t("withholding")}: {getWithholdingTax(code).label}</p>
          ))}
          {pdfCustomFields(org.customFieldDefsJson, invoice.customFieldsJson).map(({ def, text }) => (
            <p key={def.id}>
              {def.label}: {text}
            </p>
          ))}
          {invoice.notes ? <p className="whitespace-pre-wrap">{invoice.notes}</p> : null}
          {terms ? <p className="whitespace-pre-wrap text-[11px] text-neutral-500">{terms}</p> : null}
        </div>

        <table className="w-64 shrink-0 text-right">
          <tbody>
            <tr>
              <td className="py-0.5 pr-3 text-neutral-500">{t("totalNet")}</td>
              <td className="py-0.5 tabular-nums">{formatMoney(invoice.totalNetValue, invoice.currency)}</td>
            </tr>
            <tr>
              <td className="py-0.5 pr-3 text-neutral-500">{t("totalVat")}</td>
              <td className="py-0.5 tabular-nums">{formatMoney(invoice.totalVatAmount, invoice.currency)}</td>
            </tr>
            {invoice.totalStampDutyAmount > 0 ? (
              <tr>
                <td className="py-0.5 pr-3 text-neutral-500">{t("stampDuty")}</td>
                <td className="py-0.5 tabular-nums">{formatMoney(invoice.totalStampDutyAmount, invoice.currency)}</td>
              </tr>
            ) : null}
            {invoice.totalWithheldAmount > 0 ? (
              <tr>
                <td className="py-0.5 pr-3 text-neutral-500">{t("withholding")}</td>
                <td className="py-0.5 tabular-nums">- {formatMoney(invoice.totalWithheldAmount, invoice.currency)}</td>
              </tr>
            ) : null}
            <tr className="text-base font-bold" style={{ borderTop: tk.noRules ? "none" : `2px solid ${tk.rule}`, color: tk.filledHead || tk.noRules ? tk.accent : undefined }}>
              <td className="py-1.5 pr-3">{t("payable")}</td>
              <td className="py-1.5 tabular-nums">{formatMoney(invoice.totalGrossValue, invoice.currency)}</td>
            </tr>
            {invoice.paidAmount > 0 ? (
              <tr className="text-[12px] text-neutral-600">
                <td className="pr-3">{t("paidRemaining")}</td>
                <td className="tabular-nums">
                  {formatMoney(invoice.paidAmount, invoice.currency)} / {formatMoney(round2(invoice.totalGrossValue - invoice.paidAmount), invoice.currency)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {theme.showSignatureBox ? (
        <section className="mt-10 grid grid-cols-2 gap-16 text-[11px] text-neutral-500">
          {theme.signatureLabels.map((label) => (
            <div key={label} className="border-t pt-1 text-center" style={{ borderColor: tk.ruleLight }}>
              {label}
            </div>
          ))}
        </section>
      ) : null}

      <footer className="mt-8 flex items-end justify-between gap-6 border-t pt-4 text-[11px] text-neutral-600" style={{ borderColor: tk.ruleLight }}>
        <div className="min-w-0 space-y-1">
          {isQuote ? (
            <>
              <div className="font-medium">
                {t("quoteNotice")} {invoice.dueDate ? `${t("validUntil")} ${formatDate(invoice.dueDate)}.` : t("quoteValid30")}
              </div>
              {invoice.acceptedAt && (invoice.status === "accepted" || invoice.status === "converted") ? (
                <div className="mt-2 flex items-end gap-3">
                  {invoice.acceptedSignature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={invoice.acceptedSignature} alt={t("signature")} className="h-12 w-28 rounded border border-neutral-200 bg-white object-contain" />
                  ) : null}
                  <div>
                    <div className="font-medium text-emerald-700">{t("acceptedBy")} {invoice.acceptedByName}</div>
                    <div>{new Date(invoice.acceptedAt).toLocaleString(lang === "de" ? "de-DE" : lang === "it" ? "it-IT" : lang === "en" ? "en-GB" : "el-GR")}{invoice.acceptedIp ? ` · IP ${invoice.acceptedIp}` : ""}</div>
                  </div>
                </div>
              ) : null}
            </>
          ) : invoice.mydataMark ? (
            <>
              <div>
                <span className="font-semibold">MARK:</span> <span className="font-mono">{invoice.mydataMark}</span>
              </div>
              {invoice.mydataUid ? (
                <div className="break-all">
                  <span className="font-semibold">UID:</span> <span className="font-mono">{invoice.mydataUid}</span>
                </div>
              ) : null}
              {invoice.mydataAuthCode ? (
                <div className="break-all">
                  <span className="font-semibold">Authentication Code:</span> <span className="font-mono">{invoice.mydataAuthCode}</span>
                </div>
              ) : null}
            </>
          ) : invoice.status !== "draft" ? (
            <div className="font-medium text-amber-700">{t("notTransmitted")}</div>
          ) : (
            <div className="font-medium">{t("draft")}</div>
          )}
          {org.invoiceFooter ? <p className="pt-1">{org.invoiceFooter}</p> : null}
          {org.eInvoiceProviderName ? (
            <p className="pt-1 text-neutral-500">
              Πάροχος ηλεκτρονικής τιμολόγησης: {org.eInvoiceProviderName}
              {org.eInvoiceProviderAfm ? ` · ΑΦΜ ${org.eInvoiceProviderAfm}` : ""}
            </p>
          ) : null}
          {invoice.b2gStatus && invoice.b2gStatus !== "not_sent" ? (
            <div className="pt-1">
              <div className="font-semibold">Τιμολόγηση Δημοσίου (PEPPOL BIS 3.0)</div>
              {invoice.b2gBuyerReference ? <div>Κωδικός δρομολόγησης φορέα: {invoice.b2gBuyerReference}</div> : null}
              {invoice.b2gContractAdam ? <div>ΑΔΑΜ / αρ. σύμβασης: {invoice.b2gContractAdam}</div> : null}
              {invoice.b2gProjectReference ? <div>Αναφορά έργου: {invoice.b2gProjectReference}</div> : null}
              {invoice.b2gOrderReference ? <div>Αρ. παραγγελίας: {invoice.b2gOrderReference}</div> : null}
              {invoice.b2gProviderId ? <div className="break-all">Αναγνωριστικό διαβίβασης: {invoice.b2gProviderId}</div> : null}
            </div>
          ) : null}
          <p className="pt-1 text-neutral-400">
            {t("issuedWith")}
            {isQuote ? "" : ` · ${t("elp")}`}
          </p>
        </div>
        {qrDataUrl && theme.showQr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt={t("qrAlt")} className="size-24 shrink-0" />
        ) : null}
      </footer>
      </div>
    </article>
  );
}
