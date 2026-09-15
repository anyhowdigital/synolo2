/**
 * IRIS Instant Payments — DIAS-compliant EPC-like QR payload.
 *
 * Το επίσημο DIAS payload για IRIS QR ακολουθεί δομή τύπου SEPA-EPC (String separated by \n):
 *   BCD                     (Service tag)
 *   001                     (Version)
 *   1                       (Character set: 1 = UTF-8)
 *   SCT                     (Identification: SEPA Credit Transfer)
 *   {BIC}                   (Optional για GR IBAN)
 *   {BeneficiaryName}       (max 70)
 *   {IBAN}                  (χωρίς κενά)
 *   EUR{amount}             (πχ EUR12.50)
 *   {Purpose}               (κενό)
 *   {RemittanceRef}         (structured reference — ISO 11649 or αναφορά τιμολογίου)
 *   {RemittanceInfo}        (max 140 — free text)
 *   {BeneficiaryToOriginator}
 */
export function buildIrisPayload(input: {
  beneficiaryName: string;
  iban: string;
  amount: number;
  invoiceNumber: string;
  bic?: string;
  info?: string;
}): string {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  const amt = `EUR${input.amount.toFixed(2)}`;
  const remitRef = `RF${input.invoiceNumber.replace(/\s+/g, "")}`.slice(0, 35);
  const remitInfo = (input.info ?? `Τιμολόγιο ${input.invoiceNumber}`).slice(0, 140);
  const lines = [
    "BCD",
    "001",
    "1",
    "SCT",
    input.bic ?? "",
    input.beneficiaryName.slice(0, 70),
    iban,
    amt,
    "",
    remitRef,
    remitInfo,
    "",
  ];
  return lines.join("\n");
}
