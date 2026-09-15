import { XMLParser } from "fast-xml-parser";
import { createHash, randomInt } from "node:crypto";

/**
 * Πελάτης REST API ΑΑΔΕ myDATA (ERP flow).
 *
 * Περιβάλλοντα:
 *  - prod: https://mydatapi.aade.gr/myDATA/
 *  - dev : https://mydataapidev.aade.gr/
 *  - mock: τοπική προσομοίωση (χωρίς δικτυακή κλήση) για δοκιμές/επιδείξεις.
 *
 * Αυθεντικοποίηση με headers `aade-user-id` και `ocp-apim-subscription-key`,
 * όπως εκδίδονται από το myAADE (Εγγραφή στο myDATA REST API).
 */
export type MyDataEnvironment = "mock" | "dev" | "prod";

export interface MyDataCredentials {
  environment: MyDataEnvironment;
  userId: string;
  subscriptionKey: string;
}

export interface MyDataSendResult {
  ok: boolean;
  mark?: string;
  uid?: string;
  authenticationCode?: string;
  qrUrl?: string;
  cancellationMark?: string;
  errors?: { code: string; message: string }[];
  rawResponse: string;
}

const BASE_URLS: Record<Exclude<MyDataEnvironment, "mock">, string> = {
  prod: "https://mydatapi.aade.gr/myDATA/",
  dev: "https://mydataapidev.aade.gr/",
};

export function mydataEnvironmentLabel(env: string) {
  switch (env) {
    case "prod":
      return "Παραγωγή (mydatapi.aade.gr)";
    case "dev":
      return "Δοκιμαστικό (mydataapidev.aade.gr)";
    default:
      return "Προσομοίωση (χωρίς αποστολή στην ΑΑΔΕ)";
  }
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === "response" || name === "error",
});

/**
 * Η πύλη APIM της ΑΑΔΕ επιστρέφει κατά περίπτωση το XML τυλιγμένο σε WCF string:
 * `<string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">&lt;?xml …&gt;</string>`.
 * Ξετυλίγουμε και αποκωδικοποιούμε τις οντότητες για να πάρουμε το πραγματικό ResponseDoc/RequestedDoc.
 */
export function unwrapAadeXml(text: string): string {
  let t = text.replace(/^\uFEFF/, "").trim();
  for (let i = 0; i < 2; i++) {
    const m = t.match(/^<string(?:\s[^>]*)?>([\s\S]*)<\/string>\s*$/i);
    if (!m) break;
    t = m[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&amp;/g, "&")
      .trim();
  }
  return t;
}

export function parseResponseDoc(rawXml: string): MyDataSendResult {
  const xml = unwrapAadeXml(rawXml);
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml);
  } catch {
    return { ok: false, errors: [{ code: "PARSE", message: "Μη έγκυρη απάντηση XML από την ΑΑΔΕ" }], rawResponse: xml };
  }
  const doc = parsed.ResponseDoc as { response?: Record<string, unknown>[] } | undefined;
  const response = doc?.response?.[0];
  if (!response) {
    const snippet = xml.replace(/\s+/g, " ").trim().slice(0, 300);
    return {
      ok: false,
      errors: [
        {
          code: "EMPTY",
          message: snippet
            ? `Η ΑΑΔΕ επέστρεψε απάντηση χωρίς ResponseDoc/response. Περιεχόμενο: ${snippet}`
            : "Κενή απάντηση από την ΑΑΔΕ (χωρίς περιεχόμενο). Ελέγξτε περιβάλλον και διαπιστευτήρια στις Ρυθμίσεις → myDATA («Έλεγχος σύνδεσης»).",
        },
      ],
      rawResponse: xml,
    };
  }
  const statusCode = String(response.statusCode ?? "");
  if (statusCode === "Success") {
    return {
      ok: true,
      mark: response.invoiceMark ? String(response.invoiceMark) : undefined,
      uid: response.invoiceUid ? String(response.invoiceUid) : undefined,
      authenticationCode: response.authenticationCode ? String(response.authenticationCode) : undefined,
      qrUrl: response.qrUrl ? String(response.qrUrl) : undefined,
      cancellationMark: response.cancellationMark ? String(response.cancellationMark) : undefined,
      rawResponse: xml,
    };
  }
  const errorsNode = response.errors as { error?: { code?: string; message?: string }[] } | undefined;
  const errors = (errorsNode?.error ?? []).map((e) => ({
    code: String(e.code ?? ""),
    message: String(e.message ?? ""),
  }));
  return {
    ok: false,
    errors: errors.length ? errors : [{ code: statusCode || "ERROR", message: "Η ΑΑΔΕ επέστρεψε σφάλμα" }],
    rawResponse: xml,
  };
}

function mockSuccess(xml: string, extra: Record<string, string> = {}): MyDataSendResult {
  const uid = createHash("sha1").update(xml + Date.now()).digest("hex").toUpperCase();
  const mark = `4000${randomInt(10_000_000, 99_999_999)}${randomInt(100, 999)}`;
  const authCode = createHash("md5").update(uid).digest("hex").slice(0, 32).toUpperCase();
  const qrUrl = `https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=${authCode.slice(0, 16)}`;
  const rawResponse =
    `<?xml version="1.0" encoding="utf-8"?>\n<ResponseDoc xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n` +
    `  <response>\n    <index>1</index>\n    <invoiceUid>${uid}</invoiceUid>\n    <invoiceMark>${mark}</invoiceMark>\n` +
    `    <qrUrl>${qrUrl}</qrUrl>\n    <authenticationCode>${authCode}</authenticationCode>\n` +
    Object.entries(extra)
      .map(([k, v]) => `    <${k}>${v}</${k}>\n`)
      .join("") +
    `    <statusCode>Success</statusCode>\n  </response>\n</ResponseDoc>`;
  return { ok: true, mark, uid, authenticationCode: authCode, qrUrl, rawResponse, ...extra };
}

/**
 * Ερμηνεία HTTP σφαλμάτων της πύλης APIM της ΑΑΔΕ. Η ΑΑΔΕ απαντά συχνά με 401/403 και ΚΕΝΟ σώμα
 * όταν τα διαπιστευτήρια δεν ισχύουν για το συγκεκριμένο περιβάλλον – εξηγούμε τι σημαίνει.
 */
export function describeHttpError(status: number, text: string, environment: Exclude<MyDataEnvironment, "mock">) {
  const envLabel = environment === "prod" ? "παραγωγής (mydatapi.aade.gr)" : "δοκιμαστικό (mydataapidev.aade.gr)";
  const otherLabel = environment === "prod" ? "δοκιμαστικού" : "παραγωγής";
  const body = text.trim();
  const snippet = body ? ` Απάντηση: ${body.replace(/\s+/g, " ").slice(0, 300)}` : " Η ΑΑΔΕ δεν επέστρεψε περιεχόμενο.";
  if (status === 401 || status === 403) {
    return (
      `ΑΑΔΕ HTTP ${status}: τα διαπιστευτήρια απορρίφθηκαν για το περιβάλλον ${envLabel}. ` +
      `Ελέγξτε ότι το aade-user-id και το ocp-apim-subscription-key είναι αυτά που εκδόθηκαν από το myAADE για ΑΥΤΟ το περιβάλλον ` +
      `(τα κλειδιά ${otherLabel} δεν ισχύουν εδώ), ότι δεν έχουν κενά/αλλαγές γραμμής και ότι η εγγραφή στο myDATA REST API είναι ενεργή.` +
      snippet
    );
  }
  if (status === 429) return `ΑΑΔΕ HTTP 429: υπέρβαση ορίου κλήσεων. Δοκιμάστε ξανά σε λίγα λεπτά.${snippet}`;
  if (status >= 500) return `ΑΑΔΕ HTTP ${status}: η υπηρεσία myDATA δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε ξανά αργότερα.${snippet}`;
  return `ΑΑΔΕ HTTP ${status}.${snippet}`;
}

type LiveEnvironment = Exclude<MyDataEnvironment, "mock">;
type LiveCredentials = MyDataCredentials & { environment: LiveEnvironment };

function normalizeCredentials(creds: MyDataCredentials): LiveCredentials {
  if (creds.environment === "mock") throw new Error("mock environment");
  return { environment: creds.environment, userId: creds.userId.trim(), subscriptionKey: creds.subscriptionKey.replace(/\s+/g, "") };
}

async function request(rawCreds: MyDataCredentials, endpoint: string, body?: string, method: "POST" | "GET" = "POST") {
  if (rawCreds.environment === "mock") throw new Error("mock environment");
  const creds = normalizeCredentials(rawCreds);
  const base = BASE_URLS[creds.environment];
  let res: Response;
  try {
    res = await fetch(base + endpoint, {
      method,
      headers: {
        "aade-user-id": creds.userId,
        "ocp-apim-subscription-key": creds.subscriptionKey,
        "Content-Type": "application/xml",
        Accept: "application/xml",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    const msg = (err as Error).name === "TimeoutError" ? "η ΑΑΔΕ δεν απάντησε εντός 45s" : (err as Error).message;
    throw new Error(`Αποτυχία σύνδεσης με ${base}: ${msg}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(describeHttpError(res.status, text, creds.environment));
  }
  if (!text.trim()) {
    throw new Error(`ΑΑΔΕ HTTP ${res.status} χωρίς περιεχόμενο απάντησης (${endpoint.split("?")[0]}). Δοκιμάστε ξανά· αν επιμένει, ελέγξτε τα διαπιστευτήρια και το περιβάλλον.`);
  }
  return unwrapAadeXml(text);
}

export function hasCredentials(creds: MyDataCredentials) {
  return creds.environment === "mock" || (creds.userId.trim() !== "" && creds.subscriptionKey.trim() !== "");
}

/**
 * Έλεγχος σύνδεσης/διαπιστευτηρίων: καλεί RequestTransmittedDocs για σήμερα (read-only κλήση που δεν
 * δημιουργεί MARK). Επιτυχία = HTTP 200 με έγκυρο RequestedDoc (ακόμη και κενό).
 */
export async function testConnection(creds: MyDataCredentials): Promise<{ ok: boolean; message: string; httpStatus?: number }> {
  if (creds.environment === "mock") return { ok: true, message: "Περιβάλλον προσομοίωσης – δεν γίνεται κλήση στην ΑΑΔΕ." };
  if (!hasCredentials(creds)) return { ok: false, message: "Συμπληρώστε aade-user-id και subscription key." };
  const norm = normalizeCredentials(creds);
  const base = BASE_URLS[norm.environment];
  const today = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${base}RequestTransmittedDocs?mark=0&dateFrom=${today}&dateTo=${today}`, {
      method: "GET",
      headers: { "aade-user-id": norm.userId, "ocp-apim-subscription-key": norm.subscriptionKey, Accept: "application/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με ${base}: ${(err as Error).message}` };
  }
  const text = unwrapAadeXml(await res.text());
  if (!res.ok) return { ok: false, httpStatus: res.status, message: describeHttpError(res.status, text, norm.environment) };
  const looksXml = /<RequestedDoc|<ResponseDoc/i.test(text);
  if (!looksXml) {
    return { ok: false, httpStatus: res.status, message: `HTTP ${res.status} αλλά η απάντηση δεν είναι XML myDATA: ${text.replace(/\s+/g, " ").slice(0, 200) || "(κενή)"}` };
  }
  const errs = parseResponseDoc(text);
  if (/<ResponseDoc/i.test(text) && !errs.ok) {
    return { ok: false, httpStatus: res.status, message: (errs.errors ?? []).map((e) => `[${e.code}] ${e.message}`).join(" · ") };
  }
  const count = (text.match(/<invoice>/g) ?? []).length;
  return {
    ok: true,
    httpStatus: res.status,
    message: `Επιτυχής σύνδεση με ${mydataEnvironmentLabel(norm.environment)} σε ${Date.now() - started} ms · ${count} διαβιβασμένα παραστατικά σήμερα.`,
  };
}

/** Διαβίβαση παραστατικού (SendInvoices). */
export async function sendInvoices(creds: MyDataCredentials, invoicesDocXml: string): Promise<MyDataSendResult> {
  if (creds.environment === "mock") {
    await new Promise((r) => setTimeout(r, 300));
    return mockSuccess(invoicesDocXml);
  }
  if (!hasCredentials(creds)) {
    return {
      ok: false,
      errors: [{ code: "NO_CREDENTIALS", message: "Δεν έχουν οριστεί aade-user-id / subscription key στις Ρυθμίσεις." }],
      rawResponse: "",
    };
  }
  try {
    const text = await request(creds, "SendInvoices", invoicesDocXml);
    return parseResponseDoc(text);
  } catch (err) {
    return { ok: false, errors: [{ code: "NETWORK", message: (err as Error).message }], rawResponse: "" };
  }
}

/** Παραστατικό που εκδόθηκε από τρίτο (προμηθευτή) προς την επιχείρηση – από RequestDocs. */
export interface RequestedDoc {
  mark: string;
  uid: string;
  issuerAfm: string;
  issuerCountry: string;
  issuerName: string;
  series: string;
  aa: string;
  issueDate: string;
  invoiceType: string;
  totalNetValue: number;
  totalVatAmount: number;
  totalWithheldAmount: number;
  totalGrossValue: number;
  rawXml: string;
}

const docParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: (name) => name === "invoice" || name === "invoiceDetails",
});

function num(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function parseRequestedDocs(rawXml: string): RequestedDoc[] {
  const xml = unwrapAadeXml(rawXml);
  let parsed: Record<string, unknown>;
  try {
    parsed = docParser.parse(xml);
  } catch {
    return [];
  }
  const root = parsed.RequestedDoc as Record<string, unknown> | undefined;
  const list = ((root?.invoicesDoc as Record<string, unknown> | undefined)?.invoice ?? []) as Record<string, unknown>[];
  return list.map((inv) => {
    const issuer = (inv.issuer ?? {}) as Record<string, unknown>;
    const header = (inv.invoiceHeader ?? {}) as Record<string, unknown>;
    const summary = (inv.invoiceSummary ?? {}) as Record<string, unknown>;
    return {
      mark: String(inv.mark ?? ""),
      uid: String(inv.uid ?? ""),
      issuerAfm: String(issuer.vatNumber ?? ""),
      issuerCountry: String(issuer.country ?? "GR"),
      issuerName: String(issuer.name ?? ""),
      series: String(header.series ?? ""),
      aa: String(header.aa ?? ""),
      issueDate: String(header.issueDate ?? "").slice(0, 10),
      invoiceType: String(header.invoiceType ?? ""),
      totalNetValue: num(summary.totalNetValue),
      totalVatAmount: num(summary.totalVatAmount),
      totalWithheldAmount: num(summary.totalWithheldAmount),
      totalGrossValue: num(summary.totalGrossValue),
      rawXml: "",
    };
  });
}

function mockRequestedDocsXml(dateFrom: string) {
  const base = new Date(dateFrom);
  const d = (offset: number) => new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const inv = (mark: string, afm: string, name: string, series: string, aa: string, date: string, type: string, net: number, vat: number) =>
    `  <invoice>\n    <uid>${createHash("sha1").update(mark).digest("hex").toUpperCase()}</uid>\n    <mark>${mark}</mark>\n` +
    `    <issuer><vatNumber>${afm}</vatNumber><country>GR</country><branch>0</branch><name>${name}</name></issuer>\n` +
    `    <counterpart><vatNumber>800000118</vatNumber><country>GR</country><branch>0</branch></counterpart>\n` +
    `    <invoiceHeader><series>${series}</series><aa>${aa}</aa><issueDate>${date}</issueDate><invoiceType>${type}</invoiceType><currency>EUR</currency></invoiceHeader>\n` +
    `    <invoiceDetails><lineNumber>1</lineNumber><netValue>${net.toFixed(2)}</netValue><vatCategory>1</vatCategory><vatAmount>${vat.toFixed(2)}</vatAmount></invoiceDetails>\n` +
    `    <invoiceSummary><totalNetValue>${net.toFixed(2)}</totalNetValue><totalVatAmount>${vat.toFixed(2)}</totalVatAmount><totalWithheldAmount>0.00</totalWithheldAmount><totalFeesAmount>0.00</totalFeesAmount><totalStampDutyAmount>0.00</totalStampDutyAmount><totalOtherTaxesAmount>0.00</totalOtherTaxesAmount><totalDeductionsAmount>0.00</totalDeductionsAmount><totalGrossValue>${(net + vat).toFixed(2)}</totalGrossValue></invoiceSummary>\n  </invoice>\n`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n<RequestedDoc xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n<invoicesDoc>\n` +
    inv("400001234567001", "999888771", "Ενέργεια Δήμος Α.Ε.", "Α", "1048221", d(2), "2.1", 186.29, 11.18) +
    inv("400001234567002", "800123456", "Τηλεπικοινωνίες Ελλάς Α.Ε.", "ΤΠΥ", "77120344", d(5), "2.1", 64.52, 15.48) +
    inv("400001234567003", "800555449", "Γραφική Ύλη Παπαδάκης ΙΚΕ", "ΤΠ", "1523", d(9), "1.1", 240.0, 57.6) +
    `</invoicesDoc>\n</RequestedDoc>`
  );
}


/** Ακολουθεί το continuationToken (nextPartitionKey/nextRowKey) του myDATA και επιστρέφει όλες τις σελίδες. */
async function requestAllPages(creds: MyDataCredentials, endpoint: string, qs: URLSearchParams): Promise<string[]> {
  const pages: string[] = [];
  const params = new URLSearchParams(qs);
  for (let i = 0; i < 50; i++) {
    const text = await request(creds, `${endpoint}?${params.toString()}`, undefined, "GET");
    pages.push(text);
    const pk = text.match(/<nextPartitionKey>([^<]*)<\/nextPartitionKey>/)?.[1];
    const rk = text.match(/<nextRowKey>([^<]*)<\/nextRowKey>/)?.[1];
    if (!pk && !rk) break;
    params.set("nextPartitionKey", pk ?? "");
    params.set("nextRowKey", rk ?? "");
  }
  return pages;
}

/** Λήψη παραστατικών που εκδόθηκαν από τρίτους προς την επιχείρηση (RequestDocs). */
export async function requestDocs(creds: MyDataCredentials, opts: { dateFrom: string; dateTo: string; mark?: string }): Promise<{ ok: boolean; docs: RequestedDoc[]; error?: string; rawResponse: string }> {
  if (creds.environment === "mock") {
    await new Promise((r) => setTimeout(r, 300));
    const xml = mockRequestedDocsXml(opts.dateFrom);
    return { ok: true, docs: parseRequestedDocs(xml).map((d) => ({ ...d, rawXml: xml })), rawResponse: xml };
  }
  if (!hasCredentials(creds)) {
    return { ok: false, docs: [], error: "Δεν έχουν οριστεί διαπιστευτήρια myDATA.", rawResponse: "" };
  }
  try {
    const toAade = (iso: string) => iso.split("-").reverse().join("/");
    const qs = new URLSearchParams({ mark: opts.mark ?? "0", dateFrom: toAade(opts.dateFrom), dateTo: toAade(opts.dateTo) });
    const pages = await requestAllPages(creds, "RequestDocs", qs);
    return { ok: true, docs: pages.flatMap((text) => parseRequestedDocs(text).map((d) => ({ ...d, rawXml: text }))), rawResponse: pages.join("\n") };
  } catch (err) {
    return { ok: false, docs: [], error: (err as Error).message, rawResponse: "" };
  }
}

/* ---------- SendExpensesClassification ---------- */

export interface ExpenseClassificationLine {
  lineNumber: number;
  classificationType: string;
  classificationCategory: string;
  amount: number;
  vatAmount?: number;
  vatCategory?: number;
}

/** XML ExpensesClassificationsDoc για χαρακτηρισμό παραστατικού προμηθευτή (ανά MARK). */
export function buildExpensesClassificationXml(mark: string, lines: ExpenseClassificationLine[], opts: { postPerInvoice?: boolean } = {}): string {
  const esc = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ExpensesClassificationsDoc xmlns="https://www.aade.gr/myDATA/expensesClassificaton/v1.0" xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n`;
  xml += `  <expensesInvoiceClassification>\n`;
  xml += `    <invoiceMark>${esc(mark)}</invoiceMark>\n`;
  for (const l of lines) {
    xml += `    <invoicesExpensesClassificationDetails>\n`;
    xml += `      <lineNumber>${l.lineNumber}</lineNumber>\n`;
    xml += `      <expensesClassificationDetailData>\n`;
    xml += `        <classificationType>${esc(l.classificationType)}</classificationType>\n`;
    xml += `        <classificationCategory>${esc(l.classificationCategory)}</classificationCategory>\n`;
    xml += `        <amount>${l.amount.toFixed(2)}</amount>\n`;
    if (l.vatAmount !== undefined) xml += `        <vatAmount>${l.vatAmount.toFixed(2)}</vatAmount>\n`;
    if (l.vatCategory !== undefined) xml += `        <vatCategory>${l.vatCategory}</vatCategory>\n`;
    xml += `      </expensesClassificationDetailData>\n`;
    xml += `    </invoicesExpensesClassificationDetails>\n`;
  }
  if (opts.postPerInvoice) xml += `    <classificationPostMode>1</classificationPostMode>\n`;
  xml += `  </expensesInvoiceClassification>\n`;
  xml += `</ExpensesClassificationsDoc>\n`;
  return xml;
}

/** Χαρακτηρισμός εξόδου (SendExpensesClassification) για παραστατικό που εξέδωσε προμηθευτής. */
export async function sendExpensesClassification(creds: MyDataCredentials, xml: string): Promise<MyDataSendResult> {
  if (creds.environment === "mock") {
    await new Promise((r) => setTimeout(r, 200));
    const raw = `<?xml version="1.0" encoding="utf-8"?>\n<ResponseDoc><response><index>1</index><classificationMark>${randomInt(400_000_000_000, 499_999_999_999)}</classificationMark><statusCode>Success</statusCode></response></ResponseDoc>`;
    return { ok: true, rawResponse: raw };
  }
  if (!hasCredentials(creds)) {
    return { ok: false, errors: [{ code: "NO_CREDENTIALS", message: "Δεν έχουν οριστεί διαπιστευτήρια myDATA." }], rawResponse: "" };
  }
  try {
    const text = await request(creds, "SendExpensesClassification", xml);
    return parseResponseDoc(text);
  } catch (err) {
    return { ok: false, errors: [{ code: "NETWORK", message: (err as Error).message }], rawResponse: "" };
  }
}

/* ---------- RequestTransmittedDocs ---------- */

export interface TransmittedDoc {
  mark: string;
  uid: string;
  series: string;
  aa: string;
  issueDate: string;
  invoiceType: string;
  totalNetValue: number;
  totalVatAmount: number;
  totalGrossValue: number;
  counterpartAfm: string;
  /** MARK ακύρωσης αν το παραστατικό ακυρώθηκε στην ΑΑΔΕ. */
  cancelledByMark: string | null;
}

export function parseTransmittedDocs(rawXml: string): TransmittedDoc[] {
  const xml = unwrapAadeXml(rawXml);
  let parsed: Record<string, unknown>;
  try {
    parsed = docParser.parse(xml);
  } catch {
    return [];
  }
  const root = parsed.RequestedDoc as Record<string, unknown> | undefined;
  const list = ((root?.invoicesDoc as Record<string, unknown> | undefined)?.invoice ?? []) as Record<string, unknown>[];
  const cancelled = new Map<string, string>();
  const cancelledDoc = root?.cancelledInvoicesDoc as { cancelledInvoice?: Record<string, unknown> | Record<string, unknown>[] } | undefined;
  const cancelledList = cancelledDoc?.cancelledInvoice ? (Array.isArray(cancelledDoc.cancelledInvoice) ? cancelledDoc.cancelledInvoice : [cancelledDoc.cancelledInvoice]) : [];
  for (const c of cancelledList) cancelled.set(String(c.invoiceMark ?? ""), String(c.cancellationMark ?? ""));
  return list.map((inv) => {
    const header = (inv.invoiceHeader ?? {}) as Record<string, unknown>;
    const summary = (inv.invoiceSummary ?? {}) as Record<string, unknown>;
    const counterpart = (inv.counterpart ?? {}) as Record<string, unknown>;
    const mark = String(inv.mark ?? "");
    return {
      mark,
      uid: String(inv.uid ?? ""),
      series: String(header.series ?? ""),
      aa: String(header.aa ?? ""),
      issueDate: String(header.issueDate ?? "").slice(0, 10),
      invoiceType: String(header.invoiceType ?? ""),
      totalNetValue: num(summary.totalNetValue),
      totalVatAmount: num(summary.totalVatAmount),
      totalGrossValue: num(summary.totalGrossValue),
      counterpartAfm: String(counterpart.vatNumber ?? ""),
      cancelledByMark: inv.cancelledByMark ? String(inv.cancelledByMark) : cancelled.get(mark) ?? null,
    };
  });
}

/**
 * Παραστατικά που έχει διαβιβάσει η ίδια η επιχείρηση (RequestTransmittedDocs) – για συμφωνία με τα τοπικά.
 * Στο mock επιστρέφει `docs: null` και το service αντλεί τα δεδομένα από τη βάση (προσομοίωση πλήρους συμφωνίας).
 */
export async function requestTransmittedDocs(creds: MyDataCredentials, opts: { dateFrom: string; dateTo: string }): Promise<{ ok: boolean; docs: TransmittedDoc[] | null; error?: string; rawResponse: string }> {
  if (creds.environment === "mock") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true, docs: null, rawResponse: "" };
  }
  if (!hasCredentials(creds)) return { ok: false, docs: [], error: "Δεν έχουν οριστεί διαπιστευτήρια myDATA.", rawResponse: "" };
  try {
    const toAade = (iso: string) => iso.split("-").reverse().join("/");
    const qs = new URLSearchParams({ mark: "0", dateFrom: toAade(opts.dateFrom), dateTo: toAade(opts.dateTo) });
    const pages = await requestAllPages(creds, "RequestTransmittedDocs", qs);
    return { ok: true, docs: pages.flatMap((text) => parseTransmittedDocs(text)), rawResponse: pages.join("\n") };
  } catch (err) {
    return { ok: false, docs: [], error: (err as Error).message, rawResponse: "" };
  }
}

/* ---------- RequestMyIncome ---------- */

export interface MyIncomeRow {
  counterVatNumber: string;
  issueDate: string;
  invType: string;
  selfPricing: boolean;
  classificationType: string;
  classificationCategory: string;
  netValue: number;
  vatAmount: number;
  withheldAmount: number;
  grossValue: number;
  minMark: string;
  maxMark: string;
}

const bookParser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, removeNSPrefix: true, isArray: (name) => name === "bookInfo" });

export function parseMyIncome(rawXml: string): MyIncomeRow[] {
  const xml = unwrapAadeXml(rawXml);
  let parsed: Record<string, unknown>;
  try {
    parsed = bookParser.parse(xml);
  } catch {
    return [];
  }
  const root = parsed.RequestedBookInfo as { bookInfo?: Record<string, unknown>[] } | undefined;
  return (root?.bookInfo ?? []).map((b) => ({
    counterVatNumber: String(b.counterVatNumber ?? ""),
    issueDate: String(b.issueDate ?? "").slice(0, 10),
    invType: String(b.invType ?? ""),
    selfPricing: String(b.selfPricing ?? "false") === "true",
    classificationType: String(b.classificationType ?? ""),
    classificationCategory: String(b.classificationCategory ?? ""),
    netValue: num(b.netValue),
    vatAmount: num(b.vatAmount),
    withheldAmount: num(b.withheldAmount),
    grossValue: num(b.grossValue),
    minMark: String(b.minMark ?? ""),
    maxMark: String(b.maxMark ?? ""),
  }));
}

/**
 * Συνοπτικά έσοδα όπως τα βλέπει η ΑΑΔΕ (RequestMyIncome) – ανά ημέρα, αντισυμβαλλόμενο και χαρακτηρισμό.
 * Στο mock επιστρέφει `rows: null` και το service αντλεί από τη βάση.
 */
export async function requestMyIncome(creds: MyDataCredentials, opts: { dateFrom: string; dateTo: string }): Promise<{ ok: boolean; rows: MyIncomeRow[] | null; error?: string; rawResponse: string }> {
  if (creds.environment === "mock") {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true, rows: null, rawResponse: "" };
  }
  if (!hasCredentials(creds)) return { ok: false, rows: [], error: "Δεν έχουν οριστεί διαπιστευτήρια myDATA.", rawResponse: "" };
  try {
    const toAade = (iso: string) => iso.split("-").reverse().join("/");
    const qs = new URLSearchParams({ dateFrom: toAade(opts.dateFrom), dateTo: toAade(opts.dateTo) });
    const pages = await requestAllPages(creds, "RequestMyIncome", qs);
    return { ok: true, rows: pages.flatMap((text) => parseMyIncome(text)), rawResponse: pages.join("\n") };
  } catch (err) {
    return { ok: false, rows: [], error: (err as Error).message, rawResponse: "" };
  }
}

/** Ακύρωση παραστατικού (CancelInvoice). */
export async function cancelInvoice(creds: MyDataCredentials, mark: string): Promise<MyDataSendResult> {
  if (creds.environment === "mock") {
    await new Promise((r) => setTimeout(r, 200));
    const cancellationMark = `4000${randomInt(10_000_000, 99_999_999)}${randomInt(100, 999)}`;
    return mockSuccess(`cancel:${mark}`, { cancellationMark });
  }
  if (!hasCredentials(creds)) {
    return {
      ok: false,
      errors: [{ code: "NO_CREDENTIALS", message: "Δεν έχουν οριστεί διαπιστευτήρια myDATA." }],
      rawResponse: "",
    };
  }
  try {
    const text = await request(creds, `CancelInvoice?mark=${encodeURIComponent(mark)}`, undefined, "POST");
    return parseResponseDoc(text);
  } catch (err) {
    return { ok: false, errors: [{ code: "NETWORK", message: (err as Error).message }], rawResponse: "" };
  }
}
