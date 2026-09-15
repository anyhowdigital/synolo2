/**
 * Δομημένος κωδικός πληρωμής RF (ISO 11649 – Creditor Reference).
 * Επιτρέπει αυτόματη συμφωνία εισπράξεων: ο πελάτης τον αναγράφει στην αιτιολογία
 * του εμβάσματος και το extract της τράπεζας «ταιριάζει» μονοσήμαντα με το παραστατικό.
 */

const GREEK_TO_LATIN: Record<string, string> = {
  Α: "A", Β: "B", Γ: "G", Δ: "D", Ε: "E", Ζ: "Z", Η: "H", Θ: "TH", Ι: "I", Κ: "K", Λ: "L", Μ: "M",
  Ν: "N", Ξ: "X", Ο: "O", Π: "P", Ρ: "R", Σ: "S", Τ: "T", Υ: "Y", Φ: "F", Χ: "CH", Ψ: "PS", Ω: "W",
};

/** Μεταγραφή ελληνικών κεφαλαίων σε λατινικά, μόνο A-Z0-9 (απαίτηση του RF). */
export function toRfAlphanumeric(input: string): string {
  return input
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((ch) => GREEK_TO_LATIN[ch] ?? ch)
    .join("")
    .replace(/[^A-Z0-9]/g, "");
}

function mod97(numeric: string): number {
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem;
}

function toNumeric(s: string): string {
  return s
    .split("")
    .map((ch) => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join("");
}

/** Υπολογισμός RF από αλφαριθμητική αναφορά (έως 21 χαρακτήρες). */
export function buildRfReference(reference: string): string {
  const ref = toRfAlphanumeric(reference).slice(0, 21);
  if (!ref) throw new Error("Κενή αναφορά RF.");
  const check = 98 - mod97(toNumeric(ref + "RF00"));
  return `RF${String(check).padStart(2, "0")}${ref}`;
}

/** Έλεγχος εγκυρότητας ενός RF. */
export function isValidRf(rf: string): boolean {
  const clean = rf.replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(clean)) return false;
  return mod97(toNumeric(clean.slice(4) + clean.slice(0, 4))) === 1;
}

/** RF παραστατικού: σειρά (λατινικά) + έτος + αριθμός. Σταθερός για το ίδιο παραστατικό. */
export function invoicePaymentReference(inv: { seriesCode: string; number: number; issueDate: string; status: string }): string | null {
  if (inv.status === "draft" || !inv.number) return null;
  const series = toRfAlphanumeric(inv.seriesCode).slice(0, 8) || "INV";
  const year = inv.issueDate.slice(2, 4);
  return buildRfReference(`${series}${year}${String(inv.number).padStart(6, "0")}`);
}

/** Μορφή με κενά ανά 4 για ευανάγνωστη εκτύπωση. */
export function formatRf(rf: string): string {
  return rf.replace(/(.{4})/g, "$1 ").trim();
}
