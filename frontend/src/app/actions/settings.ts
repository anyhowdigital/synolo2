"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsePdfTheme, serializePdfTheme, type PdfTheme } from "@/lib/pdf/theme";
import { getDb } from "@/db";
import { series } from "@/db/schema";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import { DOCUMENT_TYPES } from "@/lib/greek/document-types";
import { requirePermission, updateOrg } from "@/lib/services/org";
import { parseReminderDays } from "@/lib/services/reminders";
import type { ActionResult } from "./customers";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { ACCOUNT_KEYS, DEFAULT_ACCOUNT_MAP } from "@/lib/accounting/bridge";
import { featureBlockedMessage } from "@/lib/billing/limits";
import { customFieldDefSchema } from "@/lib/services/custom-fields";
import { validIban } from "@/lib/services/sepa";
import { testConnection } from "@/lib/mydata/client";

/** Ορισμοί custom πεδίων & κανάλια πώλησης (Ρυθμίσεις → Πεδία). */
export async function saveCustomFieldDefsAction(input: { defs: unknown[]; salesChannels: string }): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const defs = [];
  const seen = new Set<string>();
  for (const raw of input.defs.slice(0, 40)) {
    const parsed = customFieldDefSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρος ορισμός πεδίου." };
    const key = `${parsed.data.entity}:${parsed.data.label.toLowerCase()}`;
    if (seen.has(key)) return { ok: false, error: `Το πεδίο «${parsed.data.label}» υπάρχει δύο φορές.` };
    seen.add(key);
    if (parsed.data.type === "select" && parsed.data.options.length === 0) return { ok: false, error: `Το πεδίο «${parsed.data.label}» χρειάζεται τουλάχιστον μία επιλογή.` };
    defs.push(parsed.data);
  }
  const channels = Array.from(new Set(input.salesChannels.split(",").map((c) => c.trim()).filter(Boolean))).slice(0, 20);
  await updateOrg(db, ctx.org.id, { customFieldDefsJson: JSON.stringify(defs), salesChannels: channels.join(",") });
  await audit(db, ctx.org.id, "organization", ctx.org.id, "settings_updated", "custom_fields", await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

const companySchema = z.object({
  name: z.string().trim().min(2, "Η επωνυμία είναι υποχρεωτική."),
  legalName: z.string().trim().default(""),
  afm: z.string().trim().min(9, "Το ΑΦΜ είναι υποχρεωτικό."),
  doy: z.string().trim().default(""),
  activity: z.string().trim().default(""),
  gemi: z.string().trim().default(""),
  address: z.string().trim().default(""),
  city: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  website: z.string().trim().default(""),
  iban: z.string().transform((s) => s.replace(/\s+/g, "").toUpperCase()).refine((s) => !s || validIban(s), "Το IBAN δεν είναι έγκυρο. Ελέγξτε τον αριθμό του λογαριασμού.").default(""),
  bankName: z.string().trim().default(""),
  logoText: z.string().trim().default(""),
  logoDataUrl: z.string().default(""),
  invoiceFooter: z.string().default(""),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
});

export async function saveCompany(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = companySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const data = parsed.data;
  data.afm = normalizeAfm(data.afm);
  if (!isValidAfm(data.afm)) return { ok: false, error: "Το ΑΦΜ της επιχείρησης δεν είναι έγκυρο." };
  if (data.logoDataUrl && data.logoDataUrl !== "__remove" && !/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/.test(data.logoDataUrl)) {
    return { ok: false, error: "Το λογότυπο πρέπει να είναι εικόνα PNG/JPEG/WebP/SVG." };
  }
  if (data.logoDataUrl.length > 400_000) return { ok: false, error: "Το λογότυπο είναι πολύ μεγάλο (μέγιστο ~300KB)." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const { logoDataUrl, ...rest } = data;
  await updateOrg(db, ctx.org.id, { ...rest, logoDataUrl: logoDataUrl === "__remove" ? null : logoDataUrl || ctx.org.logoDataUrl });
  await audit(db, ctx.org.id, "organization", ctx.org.id, "settings_saved", "Στοιχεία επιχείρησης", await resolveActor(db));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

const invoicingSchema = z.object({
  autoTransmit: z.string().optional(),
  yearlyNumbering: z.string().optional(),
  onlinePayments: z.string().optional(),
  stripeAccountId: z.string().trim().refine((s) => !s || /^acct_[A-Za-z0-9]+$/.test(s), "Ο λογαριασμός Stripe πρέπει να ξεκινά με acct_. Δεν είναι κλειδί API (sk_…).").default(""),
  reminderDays: z.string().trim().default("-3,0,7,21"),
  lateInterestAnnualRate: z.coerce.number().min(0).max(30).default(0),
  lateFeeFlat: z.coerce.number().min(0).max(10000).default(0),
});

export async function saveInvoicingPrefs(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = invoicingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  if (parsed.data.reminderDays && !/^-?\d+(\s*,\s*-?\d+)*$/.test(parsed.data.reminderDays)) return { ok: false, error: "Όλα τα στάδια πρέπει να είναι ακέραιες ημέρες χωρισμένες με κόμμα, π.χ. -3,0,7,21." };
  const days = parseReminderDays(parsed.data.reminderDays);
  if (parsed.data.reminderDays && days.length === 0) return { ok: false, error: "Τα στάδια υπενθύμισης πρέπει να είναι αριθμοί χωρισμένοι με κόμμα, π.χ. -3,0,7,21." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  await updateOrg(db, ctx.org.id, {
    autoTransmit: parsed.data.autoTransmit === "on",
    yearlyNumbering: parsed.data.yearlyNumbering === "on",
    onlinePayments: parsed.data.onlinePayments === "on",
    stripeAccountId: /^acct_[A-Za-z0-9]+$/.test(parsed.data.stripeAccountId) ? parsed.data.stripeAccountId : null,
    reminderDays: days.join(","),
    lateInterestAnnualRate: parsed.data.lateInterestAnnualRate,
    lateFeeFlat: parsed.data.lateFeeFlat,
  });
  await audit(db, ctx.org.id, "organization", ctx.org.id, "settings_saved", "Προτιμήσεις τιμολόγησης", await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

const mydataSchema = z.object({
  mydataEnvironment: z.enum(["mock", "dev", "prod"]),
  mydataUserId: z.string().trim().default(""),
  mydataSubscriptionKey: z.string().trim().default(""),
});

/** Δοκιμή σύνδεσης με την ΑΑΔΕ με τα στοιχεία της φόρμας (χωρίς αποθήκευση). Αν λείπει το key, χρησιμοποιείται το αποθηκευμένο. */
export async function testMyDataConnectionAction(input: { environment: string; userId: string; subscriptionKey: string }): Promise<ActionResult> {
  const parsed = mydataSchema.safeParse({ mydataEnvironment: input.environment, mydataUserId: input.userId, mydataSubscriptionKey: input.subscriptionKey });
  if (!parsed.success) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const env = parsed.data.mydataEnvironment;
  const result = await testConnection({
    environment: env,
    userId: parsed.data.mydataUserId || ctx.org.mydataUserId || "",
    subscriptionKey: parsed.data.mydataSubscriptionKey || ctx.org.mydataSubscriptionKey || "",
  });
  await audit(db, ctx.org.id, "organization", ctx.org.id, "mydata_connection_test", `${env}: ${result.ok ? "OK" : "FAIL"}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}`, await resolveActor(db));
  return result.ok ? { ok: true, warning: result.message } : { ok: false, error: result.message };
}

export async function saveMyData(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = mydataSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const data = parsed.data;
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  data.mydataSubscriptionKey = data.mydataSubscriptionKey || ctx.org.mydataSubscriptionKey || "";
  if (data.mydataEnvironment !== "mock" && (!data.mydataUserId || !data.mydataSubscriptionKey)) {
    return { ok: false, error: "Για δοκιμαστικό/παραγωγικό περιβάλλον απαιτούνται aade-user-id και subscription key. Κενό κλειδί διατηρεί το ήδη αποθηκευμένο." };
  }
  await updateOrg(db, ctx.org.id, data);
  await audit(db, ctx.org.id, "organization", ctx.org.id, "mydata_settings_saved", `Περιβάλλον: ${data.mydataEnvironment}`, await resolveActor(db));
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

const seriesSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .trim()
    .min(1, "Ο κωδικός σειράς είναι υποχρεωτικός.")
    .max(10)
    .regex(/^[A-Za-zΑ-Ωα-ω0-9\-]+$/, "Ο κωδικός σειράς επιτρέπει μόνο γράμματα, αριθμούς και παύλα."),
  name: z.string().trim().min(2),
  invoiceType: z.string().refine((v) => DOCUMENT_TYPES.some((d) => d.code === v), "Άγνωστος τύπος παραστατικού."),
  nextNumber: z.coerce.number().int().min(1).default(1),
  branch: z.coerce.number().int().min(0).max(999).default(0),
  branchName: z.string().trim().max(80).default(""),
  termsText: z.string().trim().max(2000).default(""),
});

export async function saveSeries(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = seriesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const { id, ...rest } = parsed.data;
  if (rest.branch > 0) {
    const blocked = featureBlockedMessage(org, "branches");
    if (blocked) return { ok: false, error: blocked };
  }
  const clash = await db.query.series.findFirst({ where: and(eq(series.orgId, org.id), eq(series.code, rest.code)) });
  if (clash && clash.id !== id) return { ok: false, error: `Υπάρχει ήδη σειρά με κωδικό «${rest.code}».` };
  if (id) {
    await db.update(series).set(rest).where(and(eq(series.id, id), eq(series.orgId, org.id)));
  } else {
    await db.insert(series).values({ id: randomUUID(), orgId: org.id, ...rest, numberingYear: new Date().getFullYear(), active: true });
  }
  await audit(db, org.id, "organization", org.id, id ? "updated" : "created", `Σειρά ${rest.code} (${rest.invoiceType})`, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleSeries(id: string) {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return;
  const s = await db.query.series.findFirst({ where: and(eq(series.id, id), eq(series.orgId, ctx.org.id)) });
  if (!s) return;
  await db.update(series).set({ active: !s.active }).where(eq(series.id, id));
  revalidatePath("/settings");
}

export async function saveAccountingMap(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const map: Record<string, string> = {};
  for (const k of ACCOUNT_KEYS) {
    const v = String(formData.get(k.key) ?? "").trim();
    if (v.length > 30) return { ok: false, error: `Ο κωδικός για «${k.label}» είναι πολύ μεγάλος.` };
    map[k.key] = v || DEFAULT_ACCOUNT_MAP[k.key];
  }
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const blocked = featureBlockedMessage(ctx.org, "accountingBridge");
  if (blocked) return { ok: false, error: blocked };
  await updateOrg(db, ctx.org.id, { accountingMapJson: JSON.stringify(map) });
  await audit(db, ctx.org.id, "organization", ctx.org.id, "settings_saved", "Λογαριασμοί λογιστικής γέφυρας ΕΛΠ", await resolveActor(db));
  revalidatePath("/settings");
  revalidatePath("/reports");
  return { ok: true };
}


/** Αποθήκευση θέματος εμφάνισης PDF/εκτύπωσης. */
export async function savePdfThemeAction(themeJson: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  let theme: PdfTheme;
  try {
    theme = parsePdfTheme(themeJson);
  } catch {
    return { ok: false, error: "Μη έγκυρο θέμα." };
  }
  await updateOrg(db, ctx.org.id, { pdfThemeJson: serializePdfTheme(theme) });
  await audit(db, ctx.org.id, "organization", ctx.org.id, "updated", `Εμφάνιση PDF: ${theme.template}, ${theme.accentColor}`, await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}
