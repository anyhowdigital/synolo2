import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { getRun, listEmployees } from "@/lib/services/payroll";

const xml = (v: string) => v.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
const latin = (v: string) => {
  const greek: Record<string, string> = { Α: "A", Β: "V", Γ: "G", Δ: "D", Ε: "E", Ζ: "Z", Η: "I", Θ: "TH", Ι: "I", Κ: "K", Λ: "L", Μ: "M", Ν: "N", Ξ: "X", Ο: "O", Π: "P", Ρ: "R", Σ: "S", Τ: "T", Υ: "Y", Φ: "F", Χ: "CH", Ψ: "PS", Ω: "O" };
  const name = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[Α-Ω]/g, (c) => greek[c] ?? c).replace(/[^A-Z0-9 /\-?:().,'+]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 70);
  if (!name) throw new Error("Συμπληρώστε αναγνωρίσιμο όνομα δικαιούχου/επιχείρησης για το SEPA.");
  return name;
};
const cleanIban = (v: string) => v.replace(/\s+/g, "").toUpperCase();

export function validIban(v: string) {
  const s = cleanIban(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const val = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of val) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** Αρχείο εμβασμάτων μισθοδοσίας SEPA pain.001.001.03 — ένα upload στο e-banking πληρώνει όλους. */
export async function sepaPayrollFile(db: Db, org: Organization, runKey: string, debtorIban: string, executionDate: string) {
  const data = await getRun(db, org.id, runKey);
  if (!data) throw new Error("Δεν υπάρχει υπολογισμένη μισθοδοσία για την περίοδο.");
  const iban = cleanIban(debtorIban || org.iban || "");
  if (!validIban(iban)) throw new Error("Μη έγκυρο IBAN χρεωστικού λογαριασμού επιχείρησης.");
  const staff = await listEmployees(db, org.id);
  const rows = data.items.map((it) => ({ it, emp: staff.find((e) => e.id === it.employeeId) }));
  const missing = rows.filter((r) => r.it.net > 0 && !validIban(r.emp?.iban ?? "")).map((r) => r.it.employeeName);
  if (missing.length) throw new Error(`Δεν δημιουργήθηκε αρχείο: λείπει έγκυρο IBAN για ${missing.join(", ")}. Συμπληρώστε τα στοιχεία ώστε να μην παραλειφθεί εργαζόμενος.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(executionDate) || !Number.isFinite(Date.parse(executionDate)) || new Date(executionDate).toISOString().slice(0, 10) !== executionDate) throw new Error("Μη έγκυρη ημερομηνία εκτέλεσης εμβασμάτων.");
  const payable = rows.filter((r) => validIban(r.emp?.iban ?? "") && r.it.net > 0);
  if (!payable.length) throw new Error(`Κανένας εργαζόμενος δεν έχει έγκυρο IBAN (${missing.join(", ")}).`);

  const ts = new Date().toISOString();
  const msgId = `PAY${runKey.replace(/\D/g, "")}${Date.now().toString(36).toUpperCase()}`.slice(0, 35);
  const total = payable.reduce((s, r) => s + r.it.net, 0).toFixed(2);
  const label = /^\d{4}-\d{2}$/.test(runKey) ? `MISTHODOSIA ${runKey}` : runKey.endsWith("DX") ? `DORO XRISTOUGENNON ${runKey.slice(0, 4)}` : runKey.endsWith("DP") ? `DORO PASXA ${runKey.slice(0, 4)}` : `EPIDOMA ADEIAS ${runKey.slice(0, 4)}`;

  const txs = payable
    .map(
      (r, i) => `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xml(`${msgId}-${String(i + 1).padStart(3, "0")}`)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${r.it.net.toFixed(2)}</InstdAmt></Amt>
        <Cdtr><Nm>${xml(latin(r.it.employeeName))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${cleanIban(r.emp!.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(label)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join("\n");

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xml(msgId)}</MsgId>
      <CreDtTm>${ts.slice(0, 19)}</CreDtTm>
      <NbOfTxs>${payable.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <InitgPty><Nm>${xml(latin(org.name))}</Nm><Id><OrgId><Othr><Id>${xml(org.afm)}</Id><SchmeNm><Cd>TXID</Cd></SchmeNm></Othr></OrgId></Id></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xml(msgId)}-P1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${payable.length}</NbOfTxs>
      <CtrlSum>${total}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><CtgyPurp><Cd>SALA</Cd></CtgyPurp></PmtTpInf>
      <ReqdExctnDt>${executionDate}</ReqdExctnDt>
      <Dbtr><Nm>${xml(latin(org.name))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${iban}</IBAN></Id><Ccy>EUR</Ccy></DbtrAcct>
      <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
  return { fileName: `SEPA_${org.afm}_${runKey}.xml`, content, count: payable.length, total: Number(total), missing };
}
