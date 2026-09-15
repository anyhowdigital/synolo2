/**
 * Επαλήθευση ΑΦΜ/VAT μέσω VIES (Ευρωπαϊκή Επιτροπή). Για ελληνικά ΑΦΜ ο κωδικός χώρας είναι "EL".
 * Δημόσιο REST API: https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{cc}/vat/{number}
 */
export interface ViesResult {
  valid: boolean;
  name: string;
  address: string;
  street: string;
  city: string;
  postalCode: string;
  countryCode: string;
  vatNumber: string;
  error?: string;
}

export function viesCountryCode(iso2: string) {
  return iso2.toUpperCase() === "GR" ? "EL" : iso2.toUpperCase();
}

function parseAddress(raw: string) {
  // Η ΑΑΔΕ επιστρέφει "ΟΔΟΣ ΑΡΙΘΜΟΣ \nΤΚ ΠΟΛΗ" – προσπαθούμε να διαχωρίσουμε.
  const parts = raw.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const rest = parts.slice(1).join(" ").trim();
  const m = /^(\d{3}\s?\d{2}|\d{4,6})\s+(.*)$/.exec(rest);
  return { street, postalCode: m ? m[1].replace(/\s/g, "") : "", city: m ? m[2] : rest };
}

export async function lookupVat(country: string, vatNumber: string): Promise<ViesResult> {
  const cc = viesCountryCode(country);
  const number = vatNumber.replace(/^(EL|GR)/i, "").replace(/\s/g, "");
  const empty: ViesResult = { valid: false, name: "", address: "", street: "", city: "", postalCode: "", countryCode: cc, vatNumber: number };
  if (!number) return { ...empty, error: "Συμπληρώστε ΑΦΜ." };
  try {
    const res = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${encodeURIComponent(number)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { ...empty, error: `Η υπηρεσία VIES απάντησε με σφάλμα ${res.status}.` };
    const data = (await res.json()) as { isValid?: boolean; name?: string; address?: string; userError?: string };
    if (data.userError && data.userError !== "VALID" && data.userError !== "INVALID") {
      return { ...empty, error: `VIES: ${data.userError} (η υπηρεσία του κράτους μέλους ενδέχεται να μην είναι διαθέσιμη).` };
    }
    const addr = parseAddress(data.address ?? "");
    return {
      valid: !!data.isValid,
      name: (data.name ?? "").trim() === "---" ? "" : (data.name ?? "").trim(),
      address: (data.address ?? "").trim(),
      ...addr,
      countryCode: cc,
      vatNumber: number,
    };
  } catch (err) {
    return { ...empty, error: `Δεν ήταν δυνατή η σύνδεση με το VIES: ${(err as Error).message}` };
  }
}
