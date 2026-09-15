import type { Organization } from "@/db/schema";

export type B2GProviderId = "simulation" | "generic" | "impact" | "epsilon" | "softone" | "cosmos" | "retail_link" | "storm_global" | "entersoft";
export type B2GStatus = "pending" | "sent" | "accepted" | "rejected" | "error";

export type B2GCredentialField = "b2gBaseUrl" | "b2gApiKey" | "b2gApiSecret" | "b2gUsername" | "b2gSubscriptionKey";

export interface B2GProviderDescriptor {
  id: B2GProviderId;
  label: string;
  /** Πώς αυθεντικοποιείται η κλήση προς τον πάροχο. */
  auth: "none" | "header" | "bearer" | "basic" | "impact-login";
  /** Όνομα header για auth = "header". */
  headerName?: string;
  defaultBaseUrl?: { test?: string; prod?: string };
  sendPath: string;
  statusPath: string;
  /** Πεδία που πρέπει να συμπληρώσει ο χρήστης. */
  fields: B2GCredentialField[];
  /** Οδηγίες απόκτησης διαπιστευτηρίων. */
  help: string;
}

export const B2G_PROVIDERS: B2GProviderDescriptor[] = [
  {
    id: "simulation",
    label: "Προσομοίωση (χωρίς αποστολή)",
    auth: "none",
    sendPath: "",
    statusPath: "",
    fields: [],
    help: "Το XML παράγεται και αποθηκεύεται τοπικά με ροή κατάστασης pending → sent → accepted. Ιδανικό για δοκιμές πριν την εμπορική σύμβαση με πάροχο.",
  },
  {
    id: "generic",
    label: "Γενικός πάροχος (REST / raw UBL)",
    auth: "header",
    headerName: "X-API-Key",
    sendPath: "/api/v1/invoices",
    statusPath: "/api/v1/invoices/{id}",
    fields: ["b2gBaseUrl", "b2gApiKey"],
    help: "Για κάθε πιστοποιημένο Access Point που δέχεται POST με raw UBL XML και API key σε header. Βάλτε το base URL και το κλειδί από την τεχνική ενεργοποίηση του παρόχου.",
  },
  {
    id: "impact",
    label: "Impact (Information Systems Impact)",
    auth: "impact-login",
    defaultBaseUrl: { test: "https://einvoiceapiuat.impact.gr", prod: "https://einvoiceapi.impact.gr" },
    sendPath: "/B2GInvoice",
    statusPath: "/GetLastStatus?invoiceId={id}",
    fields: ["b2gBaseUrl", "b2gUsername", "b2gApiKey"],
    help: "Username = ΑΦΜ της επιχείρησης, κλειδί από το onboarding της Impact. Το API κάνει πρώτα /Authentication/login και επιστρέφει bearer token.",
  },
  {
    id: "epsilon",
    label: "EPSILON NET / Epsilon Digital",
    auth: "basic",
    sendPath: "/api/b2g/invoices",
    statusPath: "/api/b2g/invoices/{id}",
    fields: ["b2gBaseUrl", "b2gUsername", "b2gApiSecret", "b2gSubscriptionKey"],
    help: "Από το Epsilon Digital: Ενέργειες → Δημιουργία API User → Service Account. Κρατήστε username, password και subscription key.",
  },
  {
    id: "softone",
    label: "SoftOne / EntersoftOne",
    auth: "bearer",
    sendPath: "/api/einvoice/b2g/send",
    statusPath: "/api/einvoice/b2g/status/{id}",
    fields: ["b2gBaseUrl", "b2gApiKey"],
    help: "Base URL και API token από το τεχνικό onboarding SoftOne e-Invoicing.",
  },
  {
    id: "cosmos",
    label: "Cosmos Business Systems",
    auth: "header",
    headerName: "Ocp-Apim-Subscription-Key",
    sendPath: "/peppol/v1/invoices",
    statusPath: "/peppol/v1/invoices/{id}",
    fields: ["b2gBaseUrl", "b2gApiKey"],
    help: "Subscription key από την πύλη API της Cosmos μετά τη σύμβαση PEPPOL/B2G.",
  },
  {
    id: "retail_link",
    label: "Retail@Link",
    auth: "header",
    headerName: "X-RL-ApiKey",
    sendPath: "/api/b2g/invoice",
    statusPath: "/api/b2g/invoice/{id}/status",
    fields: ["b2gBaseUrl", "b2gApiKey"],
    help: "API key από το customer portal του Retail@Link (υπηρεσία e-Invoicing / PEPPOL).",
  },
  {
    id: "storm_global",
    label: "Storm / Global (Q&R)",
    auth: "bearer",
    sendPath: "/api/v1/peppol/invoices",
    statusPath: "/api/v1/peppol/invoices/{id}",
    fields: ["b2gBaseUrl", "b2gApiKey"],
    help: "Base URL και token από την ενεργοποίηση της υπηρεσίας ηλεκτρονικής τιμολόγησης.",
  },
  {
    id: "entersoft",
    label: "Entersoft",
    auth: "bearer",
    sendPath: "/einvoicing/b2g/invoices",
    statusPath: "/einvoicing/b2g/invoices/{id}",
    fields: ["b2gBaseUrl", "b2gApiKey"],
    help: "Token από την πύλη e-Invoicing της Entersoft. Ορισμένοι λογαριασμοί δρομολογούνται μέσω EntersoftOne/Impact — επιβεβαιώστε το με τον πάροχο.",
  },
];

export const B2G_STATUS_LABELS: Record<string, string> = {
  not_sent: "Δεν έχει σταλεί",
  pending: "Σε αναμονή παρόχου",
  sent: "Διαβιβάστηκε",
  accepted: "Αποδεκτό από φορέα",
  rejected: "Απορρίφθηκε",
  error: "Σφάλμα",
};

export function getProvider(id: string): B2GProviderDescriptor {
  return B2G_PROVIDERS.find((p) => p.id === id) ?? B2G_PROVIDERS[0];
}

export interface ProviderResult {
  status: B2GStatus;
  providerId: string | null;
  rawStatus: string;
  message?: string;
}

function baseUrl(org: Organization, p: B2GProviderDescriptor): string {
  const configured = org.b2gBaseUrl.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const fallback = org.b2gEnvironment === "prod" ? p.defaultBaseUrl?.prod : p.defaultBaseUrl?.test;
  if (!fallback) throw new Error("Δεν έχει οριστεί base URL για τον πάροχο B2G.");
  return fallback;
}

async function impactToken(org: Organization, p: B2GProviderDescriptor): Promise<string> {
  const resp = await fetch(`${baseUrl(org, p)}/Authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vat: org.b2gUsername || org.afm, key: org.b2gApiKey }),
  });
  if (!resp.ok) throw new Error(`Impact login ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const token = data.accessToken ?? data.token;
  if (!token) throw new Error("Ο πάροχος δεν επέστρεψε token.");
  return String(token);
}

async function authHeaders(org: Organization, p: B2GProviderDescriptor): Promise<Record<string, string>> {
  switch (p.auth) {
    case "header":
      return { [p.headerName ?? "X-API-Key"]: org.b2gApiKey };
    case "bearer":
      return { Authorization: `Bearer ${org.b2gApiKey}` };
    case "basic":
      return {
        Authorization: `Basic ${Buffer.from(`${org.b2gUsername}:${org.b2gApiSecret}`).toString("base64")}`,
        ...(org.b2gSubscriptionKey ? { "Ocp-Apim-Subscription-Key": org.b2gSubscriptionKey } : {}),
      };
    case "impact-login":
      return { Authorization: `Bearer ${await impactToken(org, p)}` };
    default:
      return {};
  }
}

/** Κανονικοποίηση κατάστασης παρόχου στις 5 δικές μας τιμές. */
export function normalizeStatus(raw: string): B2GStatus {
  const s = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (/\b(not accepted|not approved|unaccepted|rejected?|refused?|invalid)\b|απορρι|μη αποδεκ|δεν εγινε αποδεκ/.test(s)) return "rejected";
  if (/\b(not delivered|not successful|not ok|unsuccessful|failed?|failure|error)\b|σφαλμα|αποτυχ/.test(s)) return "error";
  // Partial/negated responses never mean full business acceptance.
  if (/\b(partial|partially|not|awaiting|pending)\b|μερικ|αναμον/.test(s)) return "pending";
  if (/^(accepted|approved)(\s+(by|from)\s+.+)?$/.test(s) || /^(αποδεκτο|εγκριθηκε)( απο .+)?$/.test(s)) return "accepted";
  // Technical delivery or a successful API request is not acceptance by the buyer.
  if (/^(sent|transmitted|delivered|processing|in progress|queued|success|successful|ok|complete|completed)(\s+(to|by)\s+.+)?$/.test(s) || /^(σταλθηκε|διαβιβαστηκε|παραδοθηκε)( σε .+)?$/.test(s)) return "sent";
  return "pending";
}

/** Αποστολή του UBL στον πάροχο. Σε προσομοίωση δεν φεύγει τίποτα προς τα έξω. */
export async function providerSend(org: Organization, xml: string, documentNumber: string): Promise<ProviderResult> {
  const p = getProvider(org.b2gProvider);
  if (p.id === "simulation") {
    return { status: "pending", providerId: `SIM-${Date.now()}`, rawStatus: "simulation:pending", message: "Προσομοίωση – το XML δεν στάλθηκε σε πάροχο." };
  }
  const headers = { "Content-Type": "application/xml", Accept: "application/json", ...(await authHeaders(org, p)) };
  const resp = await fetch(`${baseUrl(org, p)}${p.sendPath}`, { method: "POST", headers, body: xml });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${p.label} ${resp.status}: ${text.slice(0, 300)}`);
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  const providerId = String(data.id ?? data.invoiceId ?? data.documentId ?? data.uid ?? documentNumber);
  const rawStatus = String(data.status ?? data.state ?? "sent");
  return { status: normalizeStatus(rawStatus), providerId, rawStatus, message: typeof data.message === "string" ? data.message : undefined };
}

/** Ανάκτηση τρέχουσας κατάστασης διαβίβασης από τον πάροχο. */
export async function providerStatus(org: Organization, providerId: string, previous: string): Promise<ProviderResult> {
  const p = getProvider(org.b2gProvider);
  if (p.id === "simulation") {
    const next: B2GStatus = previous === "pending" ? "sent" : "accepted";
    return { status: next, providerId, rawStatus: `simulation:${next}`, message: "Προσομοίωση ροής κατάστασης." };
  }
  const headers = { Accept: "application/json", ...(await authHeaders(org, p)) };
  const resp = await fetch(`${baseUrl(org, p)}${p.statusPath.replace("{id}", encodeURIComponent(providerId))}`, { headers });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${p.label} ${resp.status}: ${text.slice(0, 300)}`);
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { status: text.slice(0, 120) };
  }
  const rawStatus = String(data.status ?? data.state ?? data.lastStatus ?? "pending");
  const message = [data.message, data.error, data.rejectionReason].find((m) => typeof m === "string") as string | undefined;
  return { status: normalizeStatus(rawStatus), providerId, rawStatus, message };
}
