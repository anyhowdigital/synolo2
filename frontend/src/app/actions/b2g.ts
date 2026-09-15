"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { invoices, organizations } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { audit } from "@/lib/services/audit";
import { getInvoiceWithLines } from "@/lib/services/invoices";
import { buildXmlFor, loadB2GCustomer, refreshB2GStatus, sendB2G, validateB2G } from "@/lib/services/b2g";
import { B2G_PROVIDERS } from "@/lib/b2g/providers";

export type B2GActionResult = { ok: true; status: string; message?: string } | { ok: false; error: string };
export type SettingsResult = { ok: true } | { ok: false; error: string };

const settingsSchema = z.object({
  b2gEnabled: z.coerce.boolean().default(false),
  b2gAutoSend: z.coerce.boolean().default(false),
  b2gProvider: z.enum(B2G_PROVIDERS.map((p) => p.id) as [string, ...string[]]).default("simulation"),
  b2gEnvironment: z.enum(["test", "prod"]).default("test"),
  b2gBaseUrl: z.string().trim().max(300).default(""),
  b2gApiKey: z.string().trim().max(500).default(""),
  b2gApiSecret: z.string().trim().max(500).default(""),
  b2gUsername: z.string().trim().max(200).default(""),
  b2gSubscriptionKey: z.string().trim().max(300).default(""),
  eInvoiceProviderName: z.string().trim().max(120).default(""),
  eInvoiceProviderAfm: z.string().trim().max(9).default(""),
});

export async function saveB2GSettings(_prev: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const parsed = settingsSchema.safeParse({
    b2gEnabled: formData.get("b2gEnabled") === "on" || formData.get("b2gEnabled") === "true",
    b2gAutoSend: formData.get("b2gAutoSend") === "on" || formData.get("b2gAutoSend") === "true",
    b2gProvider: formData.get("b2gProvider") ?? "simulation",
    b2gEnvironment: formData.get("b2gEnvironment") ?? "test",
    b2gBaseUrl: formData.get("b2gBaseUrl") ?? "",
    b2gApiKey: formData.get("b2gApiKey") ?? "",
    b2gApiSecret: formData.get("b2gApiSecret") ?? "",
    b2gUsername: formData.get("b2gUsername") ?? "",
    b2gSubscriptionKey: formData.get("b2gSubscriptionKey") ?? "",
    eInvoiceProviderName: formData.get("eInvoiceProviderName") ?? "",
    eInvoiceProviderAfm: formData.get("eInvoiceProviderAfm") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const d = parsed.data;
  const descriptor = B2G_PROVIDERS.find((p) => p.id === d.b2gProvider)!;
  const credentials = {
    b2gBaseUrl: formData.has("b2gBaseUrl") ? d.b2gBaseUrl : org.b2gBaseUrl,
    b2gUsername: formData.has("b2gUsername") ? d.b2gUsername : org.b2gUsername,
    b2gApiKey: d.b2gApiKey || org.b2gApiKey,
    b2gApiSecret: d.b2gApiSecret || org.b2gApiSecret,
    b2gSubscriptionKey: d.b2gSubscriptionKey || org.b2gSubscriptionKey,
  };
  if (d.b2gEnabled && descriptor.id !== "simulation") {
    const labels = { b2gBaseUrl: "διεύθυνση API", b2gUsername: "όνομα χρήστη", b2gApiKey: "κλειδί API", b2gApiSecret: "κωδικός API", b2gSubscriptionKey: "subscription key" };
    const missing = descriptor.fields.filter((f) => !credentials[f] && !(f === "b2gBaseUrl" && descriptor.defaultBaseUrl?.[d.b2gEnvironment]));
    if (missing.length) return { ok: false, error: `Για ενεργοποίηση του ${descriptor.label} συμπληρώστε: ${missing.map((f) => labels[f]).join(", ")}. Μπορείτε να αποθηκεύσετε ελλιπή στοιχεία με την υπηρεσία ανενεργή.` };
    if (!org.iban) return { ok: false, error: "Συμπληρώστε πρώτα το IBAN στις Ρυθμίσεις → Επιχείρηση." };
  }
  if (descriptor.id !== "simulation" && credentials.b2gBaseUrl) {
    try { const url = new URL(credentials.b2gBaseUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
    catch { return { ok: false, error: "Η διεύθυνση API παρόχου πρέπει να είναι έγκυρη HTTPS διεύθυνση, χωρίς κωδικούς μέσα στο URL." }; }
  }
  if (d.b2gEnabled && descriptor.id !== "simulation" && d.b2gEnvironment === "prod" && formData.get("confirmProduction") !== "on") return { ok: false, error: "Επιβεβαιώστε ότι οι αποστολές θα γίνονται στο παραγωγικό περιβάλλον." };
  // Πεδία που δεν υποβλήθηκαν παραμένουν ανέπαφα. Κενά μυστικά = διατήρηση.
  await db
    .update(organizations)
    .set({
      b2gEnabled: d.b2gEnabled,
      b2gAutoSend: d.b2gAutoSend,
      b2gProvider: d.b2gProvider,
      b2gEnvironment: d.b2gEnvironment,
      ...credentials,
      eInvoiceProviderName: d.eInvoiceProviderName,
      eInvoiceProviderAfm: d.eInvoiceProviderAfm,
    })
    .where(eq(organizations.id, org.id));
  await audit(db, org.id, "organization", org.id, "b2g_settings_updated", `${d.b2gProvider} · ${d.b2gEnvironment}`, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

export async function sendB2GAction(invoiceId: string): Promise<B2GActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const invoice = await getInvoiceWithLines(db, ctx.org.id, invoiceId);
  if (!invoice) return { ok: false, error: "Δεν βρέθηκε το παραστατικό." };
  try {
    const res = await sendB2G(db, ctx.org, invoice, invoice.lines, await resolveActor(db));
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    return { ok: true, status: res.status, message: res.message };
  } catch (err) {
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία αποστολής." };
  }
}

export async function refreshB2GStatusAction(invoiceId: string): Promise<B2GActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const invoice = await getInvoiceWithLines(db, ctx.org.id, invoiceId);
  if (!invoice) return { ok: false, error: "Δεν βρέθηκε το παραστατικό." };
  try {
    const res = await refreshB2GStatus(db, ctx.org, invoice, await resolveActor(db));
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, status: res.status, message: res.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία ανάκτησης κατάστασης." };
  }
}

export type PreviewResult = { ok: true; errors: string[]; xmlLength: number } | { ok: false; error: string };

const refsSchema = z.object({
  invoiceId: z.string().min(1),
  b2gBuyerReference: z.string().trim().max(120).default(""),
  b2gContractAdam: z.string().trim().max(60).default(""),
  b2gProjectReference: z.string().trim().max(120).default(""),
  b2gOrderReference: z.string().trim().max(120).default(""),
  b2gCpv: z.string().trim().max(12).default(""),
  b2gSoftReject: z.coerce.boolean().default(false),
});

/** Στοιχεία σύμβασης ανά παραστατικό (BT-10/11/12/158, soft reject) — υπερισχύουν των στοιχείων του πελάτη. */
export async function saveB2GInvoiceRefsAction(_prev: { ok: boolean; error?: string } | null, formData: FormData) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const parsed = refsSchema.safeParse({ ...Object.fromEntries(formData), b2gSoftReject: formData.get("b2gSoftReject") === "on" });
  if (!parsed.success) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const { invoiceId, ...refs } = parsed.data;
  const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.org.id)), columns: { id: true, b2gStatus: true } });
  if (!inv) return { ok: false, error: "Δεν βρέθηκε το παραστατικό." };
  if (["pending", "sent", "accepted"].includes(inv.b2gStatus)) return { ok: false, error: "Το παραστατικό έχει ήδη διαβιβαστεί στο Δημόσιο· τα στοιχεία σύμβασης δεν αλλάζουν." };
  await db.update(invoices).set(refs).where(eq(invoices.id, invoiceId));
  await audit(db, ctx.org.id, "invoice", invoiceId, "b2g_refs", `BT-11=${refs.b2gProjectReference} BT-12=${refs.b2gContractAdam} CPV=${refs.b2gCpv}`, await resolveActor(db));
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

/** Έλεγχος πληρότητας + μέγεθος UBL, χωρίς αποστολή. */
export async function previewB2GAction(invoiceId: string): Promise<PreviewResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  const invoice = await getInvoiceWithLines(db, ctx.org.id, invoiceId);
  if (!invoice) return { ok: false, error: "Δεν βρέθηκε το παραστατικό." };
  const customer = await loadB2GCustomer(db, invoice);
  const errors = validateB2G(ctx.org, invoice, invoice.lines, customer);
  if (errors.length) return { ok: true, errors, xmlLength: 0 };
  try {
    const xml = await buildXmlFor(db, ctx.org, invoice, invoice.lines, customer);
    return { ok: true, errors, xmlLength: xml.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Δεν ήταν δυνατή η παραγωγή του XML." };
  }
}
