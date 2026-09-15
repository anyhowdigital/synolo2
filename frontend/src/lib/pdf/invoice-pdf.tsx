/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> has no alt prop */
import path from "node:path";
import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Invoice, InvoiceLine, Organization } from "@/db/schema";
import { getDocumentType, MOVE_PURPOSES } from "@/lib/greek/document-types";
import { getVatCategory, VAT_EXEMPTION_REASONS } from "@/lib/greek/vat";
import { getWithholdingTax } from "@/lib/greek/classifications";
import { round2 } from "@/lib/invoice/totals";
import { formatRf, invoicePaymentReference } from "@/lib/invoice/payment-reference";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { documentTitle, formatDocDate, formatDocMoney, label, paymentMethodLabel, unitShort, type DocLang } from "./labels";
import { pdfCustomFields } from "@/lib/services/custom-fields";
import { parsePdfTheme, themeTokens, type PdfTheme } from "./theme";

/**
 * Server-side PDF παραστατικού με @react-pdf/renderer.
 * Χρησιμοποιεί Noto Sans (ενσωματωμένη στο /public/fonts) για πλήρη κάλυψη ελληνικών.
 */

/** Κεφαλαία χωρίς τόνους (ελληνική τυπογραφική σύμβαση) – διατηρούνται τα διαλυτικά. */
export function upper(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0301\u0300\u0342\u0345\u0313\u0314]/g, "")
    .normalize("NFC");
}

/**
 * Οι γραμματοσειρές επανεγγράφονται σε κάθε render: το fontkit/react-pdf κρατά cache glyphs ανά αντικείμενο
 * γραμματοσειράς και, όταν το ίδιο αντικείμενο επαναχρησιμοποιείται σε διαδοχικά έγγραφα με διαφορετικό
 * σύνολο χαρακτήρων (π.χ. ελληνικό και μετά αγγλικό), χάνονται glyphs (π.χ. το «T» στο «Total»).
 * Το parse των τοπικών TTF είναι φθηνό (λίγα ms) σε σχέση με το υπόλοιπο render.
 */
function ensureFonts() {
  // Όχι Font.clear(): θα αφαιρούσε και τις standard γραμματοσειρές (Helvetica) που χρειάζεται εσωτερικά.
  delete (Font.getRegisteredFonts() as Record<string, unknown>).NotoSans;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: path.join(dir, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Χωρίς συλλαβισμό – αποφυγή λανθασμένων χωρισμών σε ελληνικές λέξεις.
  Font.registerHyphenationCallback((word) => [word]);
}

type Tokens = ReturnType<typeof themeTokens>;

function makeStyles(tk: Tokens) {
  const fs = (n: number) => Math.round(n * tk.scale * 10) / 10;
  const padX = tk.sideBar ? 46 : 40;
  return StyleSheet.create({
  page: { fontFamily: "NotoSans", fontSize: fs(9), paddingTop: tk.band ? 0 : 36, paddingBottom: 48, paddingHorizontal: padX, paddingLeft: tk.sideBar ? padX + 14 : padX, color: "#171717", lineHeight: 1.35, letterSpacing: tk.letterSpacing ? 0.15 : 0 },
  band: { backgroundColor: tk.accent, marginHorizontal: -40, marginBottom: 22, paddingHorizontal: 40, paddingVertical: 22 },
  sideBar: { position: "absolute", top: 0, bottom: 0, left: 0, width: 14, backgroundColor: tk.accent },
  header: { flexDirection: tk.centered ? "column" : "row", alignItems: tk.centered ? "center" : "flex-start", justifyContent: "space-between", borderBottomWidth: tk.band || tk.noRules ? 0 : tk.centered ? 0.5 : 1.5, borderBottomColor: tk.rule, paddingBottom: tk.band ? 0 : 10, gap: tk.centered ? 10 : 0 },
  headerText: { color: tk.band ? tk.onAccent : "#171717" },
  logo: { maxHeight: 44, maxWidth: 160, objectFit: "contain", objectPosition: tk.centered ? "center" : "left", marginBottom: 6 },
  logoText: { fontSize: fs(tk.sideBar ? 20 : 16), fontWeight: 700, marginBottom: 4, color: tk.band ? tk.onAccent : tk.titleColor, letterSpacing: tk.letterSpacing },
  bold: { fontWeight: 700 },
  muted: { color: tk.band ? tk.onAccent : "#525252", opacity: tk.band ? 0.85 : 1 },
  bodyMuted: { color: "#525252" },
  faint: { color: "#737373" },
  small: { fontSize: fs(8) },
  title: { fontSize: fs(tk.sideBar ? 17 : 13), fontWeight: 700, textAlign: tk.centered ? "center" : "right", color: tk.band ? tk.onAccent : tk.titleColor, letterSpacing: tk.letterSpacing * 2, lineHeight: 1.15 },
  number: { fontSize: fs(tk.sideBar ? 13 : 17), fontWeight: tk.sideBar ? 400 : 700, textAlign: tk.centered ? "center" : "right", marginTop: 2, color: tk.band ? tk.onAccent : "#171717" },
  metaRow: { flexDirection: "row", justifyContent: tk.centered ? "center" : "flex-end", marginTop: 2 },
  metaKey: { color: tk.band ? tk.onAccent : "#737373", opacity: tk.band ? 0.8 : 1, marginRight: 8 },
  section: { flexDirection: "row", marginTop: 14, gap: 24 },
  col: { flex: 1 },
  sectionTitle: { fontSize: fs(7.5), fontWeight: 700, color: tk.filledHead ? tk.accent : "#737373", letterSpacing: 0.6 + tk.letterSpacing, marginBottom: 3 },
  table: { marginTop: 16 },
  thead: { flexDirection: "row", borderBottomWidth: tk.filledHead || tk.noRules ? 0 : 1, borderBottomColor: tk.rule, paddingBottom: tk.filledHead ? 4 : 3, paddingTop: tk.filledHead ? 4 : 0, paddingHorizontal: tk.filledHead || tk.striped ? 4 : 0, fontSize: fs(7.5), color: tk.filledHead ? tk.onAccent : tk.headText, fontWeight: 700, backgroundColor: tk.filledHead ? tk.accent : tk.striped ? "#f5f5f5" : undefined, borderRadius: tk.band ? 3 : 0 },
  tr: { flexDirection: "row", borderBottomWidth: tk.noRules ? 0 : 0.5, borderBottomColor: tk.ruleLight, paddingVertical: tk.rowPad, paddingHorizontal: tk.filledHead || tk.striped ? 4 : 0 },
  trAlt: { backgroundColor: "#fafafa" },
  cNo: { width: 18, color: "#737373" },
  cDesc: { flex: 1, paddingRight: 6 },
  cQty: { width: 52, textAlign: "right" },
  cPrice: { width: 64, textAlign: "right" },
  cDisc: { width: 40, textAlign: "right" },
  cVat: { width: 40, textAlign: "right" },
  cNet: { width: 70, textAlign: "right" },
  totals: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, gap: 24 },
  totalsBox: { width: 200, ...(tk.filledHead ? { backgroundColor: "#f5f5f5", padding: 8, borderRadius: 4 } : {}) },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: tk.noRules ? 0 : 1.5, borderTopColor: tk.rule, marginTop: 3, paddingTop: 4, fontSize: fs(11), fontWeight: 700, color: tk.filledHead || tk.noRules ? tk.accent : "#171717" },
  signatures: { flexDirection: "row", gap: 60, marginTop: 28, fontSize: fs(7.5), color: "#737373" },
  signatureBox: { flex: 1, borderTopWidth: 0.5, borderTopColor: "#a3a3a3", paddingTop: 3, textAlign: "center", marginTop: 24 },
  terms: { marginTop: 4, fontSize: fs(7.5), color: "#737373" },
  footer: { marginTop: "auto", borderTopWidth: tk.noRules ? 0 : 0.5, borderTopColor: tk.ruleLight, paddingTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", fontSize: fs(7.5), color: "#525252" },
  qr: { width: 64, height: 64 },
  mono: { fontFamily: "NotoSans" },
  stamp: { marginTop: 4, fontWeight: 700, fontSize: 11 },
  rfBox: { marginTop: 6, padding: 6, borderWidth: 0.5, borderColor: "#a3a3a3", borderRadius: 3, backgroundColor: "#fafafa" },
  });
}

export interface InvoicePdfInput {
  org: Organization;
  invoice: Invoice;
  lines: InvoiceLine[];
  qrDataUrl?: string | null;
  correlated?: Invoice | null;
  lang?: DocLang;
  theme?: PdfTheme;
  terms?: string;
}

function InvoicePdfDocument({ org, invoice, lines, qrDataUrl, correlated, lang = "el", theme: themeProp, terms: termsProp }: InvoicePdfInput) {
  const theme = themeProp ?? parsePdfTheme(org.pdfThemeJson);
  const tk = themeTokens(theme);
  const s = makeStyles(tk);
  const cols = theme.columns;
  const terms = termsProp ?? theme.terms;
  const pdfFields = pdfCustomFields(org.customFieldDefsJson, invoice.customFieldsJson);
  const dt = getDocumentType(invoice.invoiceType);
  const isQuote = dt.kind === "quote";
  const isDelivery = dt.kind === "delivery";
  const t = (k: Parameters<typeof label>[0]) => label(k, lang);
  const cur = invoice.currency || "EUR";
  const money = (n: number) => formatDocMoney(n, cur, lang);
  const formatDate = (iso: string | null | undefined) => formatDocDate(iso, lang);

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
  const rf = !isQuote && !isDelivery && !dt.credit ? invoicePaymentReference(invoice) : null;
  const statusStamp =
    invoice.status === "cancelled"
      ? t("cancelled")
      : isQuote && invoice.status === "accepted"
        ? t("accepted")
        : isQuote && invoice.status === "rejected"
          ? t("rejected")
          : isQuote && invoice.status === "converted"
            ? t("converted")
            : null;

  return (
    <Document title={`${dt.name} ${invoiceDisplayNumber(invoice)}`} author={org.name} creator="Synolo ERP" producer="Synolo ERP">
      <Page size="A4" style={s.page}>
        {tk.sideBar ? <View style={s.sideBar} fixed /> : null}
        <View style={tk.band ? s.band : undefined}>
        <View style={s.header}>
          <View style={{ maxWidth: tk.centered ? 420 : 300, alignItems: tk.centered ? "center" : "flex-start" }}>
            {org.logoDataUrl && theme.showLogo ? <Image src={org.logoDataUrl} style={s.logo} /> : <Text style={s.logoText}>{org.logoText || org.name}</Text>}
            <Text style={s.bold}>{org.legalName || org.name}</Text>
            {org.activity ? <Text style={s.muted}>{org.activity}</Text> : null}
            <Text style={[s.muted, { marginTop: 3 }]}>{[org.address, org.postalCode, org.city].filter(Boolean).join(", ")}</Text>
            <Text style={s.muted}>
              {t("afm")} {org.afm} · {t("doy")} {org.doy}
              {org.gemi ? ` · ${t("gemi")} ${org.gemi}` : ""}
            </Text>
            <Text style={s.muted}>{[org.phone, org.email, org.website].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={{ maxWidth: tk.centered ? 420 : tk.sideBar ? 270 : 230, alignItems: tk.centered ? "center" : "flex-end" }}>
            <Text style={s.title}>{upper(documentTitle(dt.code, dt.name, lang))}</Text>
            <Text style={s.number}>{invoiceDisplayNumber(invoice)}</Text>
            <View style={{ marginTop: 6 }}>
              <View style={s.metaRow}>
                <Text style={s.metaKey}>{t("date")}</Text>
                <Text style={s.bold}>{formatDate(invoice.issueDate)}</Text>
              </View>
              {invoice.dueDate ? (
                <View style={s.metaRow}>
                  <Text style={s.metaKey}>{isQuote ? t("validUntil") : t("due")}</Text>
                  <Text style={s.bold}>{formatDate(invoice.dueDate)}</Text>
                </View>
              ) : null}
              {!isQuote ? (
                <View style={s.metaRow}>
                  <Text style={s.metaKey}>{t("mydataType")}</Text>
                  <Text style={s.bold}>{dt.code}</Text>
                </View>
              ) : null}
              {invoice.branch ? (
                <View style={s.metaRow}>
                  <Text style={s.metaKey}>{t("branch")}</Text>
                  <Text style={s.bold}>{invoice.branch}</Text>
                </View>
              ) : null}
              {cur !== "EUR" && invoice.exchangeRate ? (
                <View style={s.metaRow}>
                  <Text style={s.metaKey}>{t("fxRate")}</Text>
                  <Text style={s.bold}>
                    1 {cur} = {invoice.exchangeRate} EUR
                  </Text>
                </View>
              ) : null}
              {invoice.selfPricing ? <Text style={[s.stamp, { textAlign: "right", fontSize: 9 }]}>{t("selfPricing")}</Text> : null}
              {statusStamp ? <Text style={[s.stamp, { textAlign: tk.centered ? "center" : "right", color: invoice.status === "cancelled" || invoice.status === "rejected" ? "#b91c1c" : tk.band ? tk.onAccent : "#171717" }]}>{statusStamp}</Text> : null}
            </View>
          </View>
        </View>
        </View>

        <View style={s.section}>
          <View style={s.col}>
            <Text style={s.sectionTitle}>{upper(t("recipient"))}</Text>
            {dt.retail && !invoice.customerName ? (
              <Text style={s.bodyMuted}>{t("retailCustomer")}</Text>
            ) : (
              <>
                <Text style={s.bold}>{invoice.customerName}</Text>
                {invoice.customerAddress ? <Text style={s.bodyMuted}>{invoice.customerAddress}</Text> : null}
                {invoice.customerAfm ? (
                  <Text style={s.bodyMuted}>
                    {invoice.customerCountry === "GR" ? t("afm") : "VAT"} {invoice.customerAfm}
                    {invoice.customerDoy ? ` · ${t("doy")} ${invoice.customerDoy}` : ""}
                  </Text>
                ) : null}
                {invoice.customerCountry !== "GR" ? (
                  <Text style={s.bodyMuted}>
                    {t("country")}: {invoice.customerCountry}
                  </Text>
                ) : null}
              </>
            )}
          </View>
          <View style={s.col}>
            <Text style={s.sectionTitle}>{upper(isDelivery ? t("dispatch") : t("payment"))}</Text>
            {isDelivery ? (
              <>
                <Text style={s.bodyMuted}>
                  {t("dispatchDate")}: {formatDate(invoice.dispatchDate ?? invoice.issueDate)}
                </Text>
                <Text style={s.bodyMuted}>
                  {t("purpose")}: {MOVE_PURPOSES.find((m) => m.code === invoice.movePurpose)?.label ?? "—"}
                </Text>
                {invoice.vehicleNumber ? (
                  <Text style={s.bodyMuted}>
                    {t("vehicle")}: {invoice.vehicleNumber}
                  </Text>
                ) : null}
                <Text style={s.bodyMuted}>
                  {t("from")}: {invoice.loadingAddress || [org.address, org.postalCode, org.city].filter(Boolean).join(", ")}
                </Text>
                <Text style={s.bodyMuted}>
                  {t("to")}: {invoice.deliveryAddress || invoice.customerAddress || "—"}
                </Text>
              </>
            ) : (
              <Text style={s.bodyMuted}>
                {t("paymentMethod")}: {payment}
              </Text>
            )}
            {org.iban && theme.showBankDetails ? (
              <Text style={s.bodyMuted}>
                IBAN: {org.iban}
                {org.bankName ? ` (${org.bankName})` : ""}
              </Text>
            ) : null}
            {correlated ? (
              <Text style={s.bodyMuted}>
                {t("correlated")}: {invoiceDisplayNumber(correlated)} ({formatDate(correlated.issueDate)}){correlated.mydataMark ? ` · MARK ${correlated.mydataMark}` : ""}
              </Text>
            ) : null}
            {rf && theme.showBankDetails ? (
              <View style={s.rfBox}>
                <Text style={[s.small, s.faint]}>{t("paymentRef")}</Text>
                <Text style={[s.bold, { fontSize: 10, letterSpacing: 0.5 }]}>{formatRf(rf)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead} fixed>
            <Text style={s.cNo}>#</Text>
            <Text style={s.cDesc}>{upper(t("description"))}</Text>
            {cols.qty ? <Text style={s.cQty}>{upper(t("qty"))}</Text> : null}
            {cols.unitPrice ? <Text style={s.cPrice}>{upper(t("unitPrice"))}</Text> : null}
            {cols.discount ? <Text style={s.cDisc}>{upper(t("discount"))}</Text> : null}
            {cols.vat ? <Text style={s.cVat}>{upper(t("vat"))}</Text> : null}
            <Text style={s.cNet}>{upper(t("net"))}</Text>
          </View>
          {lines.map((l, i) => (
            <View key={l.id} style={tk.striped && i % 2 === 1 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
              <Text style={s.cNo}>{l.lineNumber}</Text>
              <Text style={s.cDesc}>
                {l.description}
                {!cols.qty && l.quantity !== 1 ? ` × ${l.quantity} ${unitShort(l.measurementUnit, lang)}` : ""}
              </Text>
              {cols.qty ? (
                <Text style={s.cQty}>
                  {l.quantity} {unitShort(l.measurementUnit, lang)}
                </Text>
              ) : null}
              {cols.unitPrice ? <Text style={s.cPrice}>{money(l.unitPrice)}</Text> : null}
              {cols.discount ? <Text style={s.cDisc}>{l.discountPercent ? `${l.discountPercent}%` : "—"}</Text> : null}
              {cols.vat ? <Text style={s.cVat}>{getVatCategory(l.vatCategory).label}</Text> : null}
              <Text style={s.cNet}>{money(l.netValue)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={[s.col, s.small, s.bodyMuted]}>
            {vatBreakdown.size > 0 && theme.showVatBreakdown ? (
              <View>
                <View style={{ flexDirection: "row", color: "#737373" }}>
                  <Text style={{ width: 60 }}>{t("vatRate")}</Text>
                  <Text style={{ width: 80, textAlign: "right" }}>{t("net")}</Text>
                  <Text style={{ width: 70, textAlign: "right" }}>{t("vat")}</Text>
                </View>
                {[...vatBreakdown.entries()].map(([rate, v]) => (
                  <View key={rate} style={{ flexDirection: "row" }}>
                    <Text style={{ width: 60 }}>{rate}%</Text>
                    <Text style={{ width: 80, textAlign: "right" }}>{money(v.net)}</Text>
                    <Text style={{ width: 70, textAlign: "right" }}>{money(v.vat)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {exemptions.map((code) => (
              <Text key={code} style={{ marginTop: 3 }}>
                {t("vatExemption")}: {VAT_EXEMPTION_REASONS.find((r) => r.code === code)?.label}
              </Text>
            ))}
            {withholdings.map((code) => (
              <Text key={code} style={{ marginTop: 3 }}>
                {t("withholding")}: {getWithholdingTax(code).label}
              </Text>
            ))}
            {pdfFields.map(({ def, text }) => (
              <Text key={def.id} style={{ marginTop: 3 }}>
                {def.label}: {text}
              </Text>
            ))}
            {invoice.notes ? <Text style={{ marginTop: 4 }}>{invoice.notes}</Text> : null}
            {terms ? <Text style={s.terms}>{terms}</Text> : null}
          </View>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.faint}>{t("totalNet")}</Text>
              <Text>{money(invoice.totalNetValue)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.faint}>{t("totalVat")}</Text>
              <Text>{money(invoice.totalVatAmount)}</Text>
            </View>
            {invoice.totalStampDutyAmount > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.faint}>{t("stampDuty")}</Text>
                <Text>{money(invoice.totalStampDutyAmount)}</Text>
              </View>
            ) : null}
            {invoice.totalWithheldAmount > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.faint}>{t("withholding")}</Text>
                <Text>- {money(invoice.totalWithheldAmount)}</Text>
              </View>
            ) : null}
            <View style={s.grandRow}>
              <Text>{t("payable")}</Text>
              <Text>{money(invoice.totalGrossValue)}</Text>
            </View>
            {invoice.paidAmount > 0 ? (
              <View style={[s.totalRow, s.small, s.bodyMuted]}>
                <Text>{t("paidRemaining")}</Text>
                <Text>
                  {money(invoice.paidAmount)} / {money(round2(invoice.totalGrossValue - invoice.paidAmount))}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {theme.showSignatureBox ? (
          <View style={s.signatures} wrap={false}>
            {theme.signatureLabels.map((lbl) => (
              <Text key={lbl} style={s.signatureBox}>
                {lbl}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={s.footer} wrap={false}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {isQuote ? (
              <>
                <Text style={s.bold}>
                  {t("quoteNotice")} {invoice.dueDate ? `${t("validUntil")} ${formatDate(invoice.dueDate)}.` : t("quoteValid30")}
                </Text>
                {invoice.acceptedAt && (invoice.status === "accepted" || invoice.status === "converted") ? (
                  <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
                    {invoice.acceptedSignature ? <Image src={invoice.acceptedSignature} style={{ width: 84, height: 36, marginRight: 8, borderWidth: 0.5, borderColor: "#d4d4d4" }} /> : null}
                    <View>
                      <Text style={[s.bold, { color: "#047857" }]}>
                        {t("acceptedBy")} {invoice.acceptedByName}
                      </Text>
                      <Text>
                        {new Date(invoice.acceptedAt).toLocaleString(lang === "de" ? "de-DE" : lang === "it" ? "it-IT" : lang === "en" ? "en-GB" : "el-GR")}
                        {invoice.acceptedIp ? ` · IP ${invoice.acceptedIp}` : ""}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : invoice.mydataMark ? (
              <>
                <Text>MARK: {invoice.mydataMark}</Text>
                {invoice.mydataUid ? <Text>UID: {invoice.mydataUid}</Text> : null}
                {invoice.mydataAuthCode ? <Text>Authentication Code: {invoice.mydataAuthCode}</Text> : null}
              </>
            ) : invoice.status !== "draft" ? (
              <Text style={[s.bold, { color: "#b45309" }]}>{t("notTransmitted")}</Text>
            ) : (
              <Text style={s.bold}>{t("draft")}</Text>
            )}
            {org.invoiceFooter ? <Text style={{ marginTop: 2 }}>{org.invoiceFooter}</Text> : null}
            {org.eInvoiceProviderName ? (
              <Text style={[s.faint, { marginTop: 2 }]}>
                Πάροχος ηλεκτρονικής τιμολόγησης: {org.eInvoiceProviderName}
                {org.eInvoiceProviderAfm ? ` · ΑΦΜ ${org.eInvoiceProviderAfm}` : ""}
              </Text>
            ) : null}
            {invoice.b2gStatus && invoice.b2gStatus !== "not_sent" ? (
              <>
                <Text style={[s.bold, { marginTop: 2 }]}>Τιμολόγηση Δημοσίου (PEPPOL BIS 3.0)</Text>
                {invoice.b2gBuyerReference ? <Text>Κωδικός δρομολόγησης φορέα: {invoice.b2gBuyerReference}</Text> : null}
                {invoice.b2gContractAdam ? <Text>ΑΔΑΜ / αρ. σύμβασης: {invoice.b2gContractAdam}</Text> : null}
                {invoice.b2gProjectReference ? <Text>Αναφορά έργου: {invoice.b2gProjectReference}</Text> : null}
                {invoice.b2gOrderReference ? <Text>Αρ. παραγγελίας: {invoice.b2gOrderReference}</Text> : null}
                {invoice.b2gProviderId ? <Text>Αναγνωριστικό διαβίβασης: {invoice.b2gProviderId}</Text> : null}
              </>
            ) : null}
            <Text style={[s.faint, { marginTop: 2 }]}>
              {t("issuedWith")}
              {isQuote ? "" : ` · ${t("elp")}`}
            </Text>
          </View>
          {qrDataUrl && theme.showQr ? <Image src={qrDataUrl} style={s.qr} /> : null}
        </View>
      </Page>
    </Document>
  );
}

/** Παραγωγή PDF (Buffer) για λήψη, email ή αρχειοθέτηση. */
export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  ensureFonts();
  const buf = await renderToBuffer(<InvoicePdfDocument {...input} />);
  return Buffer.from(buf);
}

export function invoicePdfFilename(inv: Invoice, lang: DocLang = "el") {
  const suffix = lang === "el" ? "" : lang === "bilingual" ? "_EL-EN" : `_${lang.toUpperCase()}`;
  return `${invoiceDisplayNumber(inv).replace(/[^\w\u0370-\u03FF-]+/g, "_")}${suffix}.pdf`;
}
