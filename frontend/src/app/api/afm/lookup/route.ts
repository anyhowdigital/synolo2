import { NextResponse } from "next/server";

/**
 * ΑΦΜ ΑΑΔΕ Lookup (Αναζήτηση Βασικών Στοιχείων Μητρώου).
 *
 * Η πραγματική υπηρεσία της ΑΑΔΕ απαιτεί ειδικά διαπιστευτήρια (username/subscription key
 * με πρόσβαση στην υπηρεσία «Αναζήτηση Βασικών Στοιχείων Μητρώου» — RgWsPublicService).
 * Εάν τα credentials είναι διαμορφωμένα στο περιβάλλον (AADE_RG_USERNAME/AADE_RG_PASSWORD),
 * χρησιμοποιείται πραγματική κλήση SOAP. Αλλιώς επιστρέφουμε ένα demo/mock αποτέλεσμα ώστε
 * η ροή του UI να είναι πλήρως λειτουργική για δοκιμές.
 */

const DEMO_DB: Record<string, {
  name: string;
  legalName?: string;
  doy: string;
  activity: string;
  address: string;
  city: string;
  postalCode: string;
  active: boolean;
}> = {
  "094019245": {
    name: "ΟΤΕ Α.Ε.",
    legalName: "ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΕΛΛΑΔΟΣ ΑΕ",
    doy: "ΦΑΕ ΑΘΗΝΩΝ",
    activity: "Τηλεπικοινωνίες",
    address: "Λ. Κηφισίας 99",
    city: "Μαρούσι",
    postalCode: "15124",
    active: true,
  },
  "094149814": {
    name: "ΔΕΗ Α.Ε.",
    legalName: "ΔΗΜΟΣΙΑ ΕΠΙΧΕΙΡΗΣΗ ΗΛΕΚΤΡΙΣΜΟΥ ΑΕ",
    doy: "ΦΑΕ ΑΘΗΝΩΝ",
    activity: "Παραγωγή & εμπορία ηλεκτρικής ενέργειας",
    address: "Χαλκοκονδύλη 30",
    city: "Αθήνα",
    postalCode: "10432",
    active: true,
  },
  "800000118": {
    name: "Δ. ΠΑΠΑΔΟΠΟΥΛΟΣ & ΣΙΑ Ε.Ε.",
    legalName: "ΠΑΠΑΔΟΠΟΥΛΟΣ IT ΕΕ",
    doy: "ΦΑΕ ΑΘΗΝΩΝ",
    activity: "Υπηρεσίες Πληροφορικής",
    address: "Λεωφ. Κηφισίας 120",
    city: "Αθήνα",
    postalCode: "11526",
    active: true,
  },
};

function isValidGreekAfm(afm: string): boolean {
  if (!/^\d{9}$/.test(afm)) return false;
  const digits = afm.split("").map(Number);
  const check = digits[8]!;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += digits[i]! * Math.pow(2, 8 - i);
  return sum % 11 % 10 === check;
}

async function credentials() {
  let username = process.env.AADE_RG_USERNAME || "";
  let password = process.env.AADE_RG_PASSWORD || "";
  try {
    const { getDb } = await import("@/db");
    const { organizations } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { getCurrentOrg } = await import("@/lib/services/org");
    const db = await getDb();
    // Πάντα ο οργανισμός της συνεδρίας – δεν γίνεται δεκτό orgId από το αίτημα (αποφυγή διαρροής μεταξύ οργανισμών).
    const org = await getCurrentOrg(db);
    if (org?.aadeRgUsername) username = org.aadeRgUsername;
    if (org?.aadeRgPassword) password = org.aadeRgPassword;
  } catch {
    /* χωρίς συνεδρία (π.χ. κλήση από cron) – μένουν τα env */
  }
  return { username, password };
}

async function tryRealLookup(afm: string, username: string, password: string) {
  // Ενεργό endpoint ΑΑΔΕ: RgWsPublic2 (SOAP 1.2 + WS-Security). Το παλιό RgWsPublicService έχει αποσυρθεί (404).
  const url = "https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2";
  const esc = (v: string) => v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const body = `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:ns1="http://rgwspublic2/RgWsPublic2Service" xmlns:ns2="http://rgwspublic2/RgWsPublic2">
  <env:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" env:mustUnderstand="true">
      <wsse:UsernameToken>
        <wsse:Username>${esc(username)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${esc(password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </env:Header>
  <env:Body>
    <ns1:rgWsPublic2AfmMethod>
      <ns1:INPUT_REC>
        <ns2:afm_called_by/>
        <ns2:afm_called_for>${afm}</ns2:afm_called_for>
      </ns1:INPUT_REC>
    </ns1:rgWsPublic2AfmMethod>
  </env:Body>
</env:Envelope>`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8", Accept: "application/soap+xml, text/xml" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const xml = await resp.text();
    const pick = (tag: string) => {
      const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "i"));
      return m?.[1]?.trim() ?? "";
    };
    if (!resp.ok && !xml.includes("rgWsPublic2AfmMethodResponse")) {
      const fault = pick("Text") || pick("faultstring");
      return { error: fault || `Η υπηρεσία της ΑΑΔΕ απάντησε με σφάλμα ${resp.status}.` };
    }
    const aadeError = pick("error_descr") || pick("error_code");
    const name = pick("onomasia") || pick("commer_title");
    if (!name) return { error: aadeError || pick("Text") || "Η ΑΑΔΕ δεν επέστρεψε στοιχεία για το ΑΦΜ." };
    const deactivation = pick("deactivation_flag");
    return {
      afm,
      name,
      legalName: pick("commer_title") || undefined,
      doy: pick("doy_descr"),
      activity: pick("firm_act_descr"),
      address: `${pick("postal_address")} ${pick("postal_address_no")}`.trim(),
      city: pick("postal_area_description"),
      postalCode: pick("postal_zip_code"),
      active: deactivation ? deactivation !== "1" : true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Αποτυχία επικοινωνίας με την ΑΑΔΕ: ${msg}` };
  }
}

export async function POST(req: Request) {
  let afm = "";
  try {
    const body = await req.json();
    afm = String(body.afm ?? "").replace(/[^\d]/g, "");
  } catch {
    return NextResponse.json({ ok: false, error: "Μη έγκυρο αίτημα." }, { status: 400 });
  }
  if (!isValidGreekAfm(afm)) {
    return NextResponse.json({ ok: false, error: "Μη έγκυρο ελληνικό ΑΦΜ (modulo-11)." }, { status: 400 });
  }
  const { username, password } = await credentials();
  if (username && password) {
    const real = await tryRealLookup(afm, username, password);
    if (real && !("error" in real)) return NextResponse.json({ ok: true, source: "aade", data: real });
    return NextResponse.json({ ok: false, source: "aade", error: real?.error ?? "Η αναζήτηση στην ΑΑΔΕ απέτυχε." });
  }

  const demo = DEMO_DB[afm];
  if (demo)
    return NextResponse.json({
      ok: true,
      source: "demo",
      data: { afm, ...demo, notice: "Δοκιμαστικό αποτέλεσμα. Καταχωρίστε διαπιστευτήρια ΑΑΔΕ στις Ρυθμίσεις → Αναζήτηση ΑΦΜ (ΑΑΔΕ) για πραγματικά στοιχεία μητρώου." },
    });

  return NextResponse.json({
    ok: true,
    source: "demo",
    data: {
      afm,
      name: `Επιχείρηση ${afm}`,
      legalName: `ΕΤΑΙΡΕΙΑ ${afm} ΑΕ (demo)`,
      doy: "ΦΑΕ ΑΘΗΝΩΝ",
      activity: "Παροχή υπηρεσιών",
      address: "",
      city: "",
      postalCode: "",
      active: true,
      notice: "Δοκιμαστικό αποτέλεσμα. Καταχωρίστε διαπιστευτήρια ΑΑΔΕ στις Ρυθμίσεις → Αναζήτηση ΑΦΜ (ΑΑΔΕ) για πραγματικά στοιχεία μητρώου.",
    },
  });
}
