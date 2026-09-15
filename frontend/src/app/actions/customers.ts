"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { customerActivities, customers, invoices } from "@/db/schema";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { featureBlockedMessage } from "@/lib/billing/limits";
import { resolveActor } from "@/lib/services/actor";
import { defsFor, normalizeTags, readCustomFieldValues, serializeTags } from "@/lib/services/custom-fields";
import { listOrgMembers } from "@/lib/services/dimensions";

export type ActionResult = { ok: true; id?: string; warning?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const customerSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["company", "individual"]),
  name: z.string().trim().min(2, "Η επωνυμία είναι υποχρεωτική."),
  afm: z.string().trim().default(""),
  doy: z.string().trim().default(""),
  activity: z.string().trim().default(""),
  address: z.string().trim().default(""),
  city: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  country: z.string().trim().length(2).default("GR"),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  contactPerson: z.string().trim().default(""),
  notes: z.string().default(""),
  stage: z.enum(["lead", "prospect", "customer", "inactive"]).default("customer"),
  paymentTermsDays: z.coerce.number().int("Οι ημέρες πρέπει να είναι ακέραιος αριθμός.").min(0, "Οι ημέρες δεν μπορούν να είναι αρνητικές.").max(365, "Επιλέξτε έως 365 ημέρες.").nullable().default(null),
  tags: z.string().default("[]").transform((v) => serializeTags(normalizeTags(v))),
  language: z.enum(["el", "en", "de", "it"]).default("el"),
  salespersonId: z
    .string()
    .nullable()
    .default(null)
    .transform((v) => (v && v !== "none" ? v : null)),
  publicEntity: z.coerce.boolean().default(false),
  b2gEndpointId: z.string().trim().max(60).default(""),
  b2gBuyerReference: z.string().trim().max(120).default(""),
  b2gBuyerIdentifier: z.string().trim().max(120).default(""),
  b2gContractAdam: z.string().trim().max(120).default(""),
  b2gProjectReference: z.string().trim().max(120).default(""),
  b2gOrderReference: z.string().trim().max(120).default(""),
  b2gKae: z.string().trim().max(60).default(""),
  b2gCpv: z.string().trim().max(12).default(""),
  creditLimit: z.coerce.number().min(0).max(10_000_000).default(0),
});

function formToObject(fd: FormData) {
  const obj: Record<string, string | null> = {};
  fd.forEach((v, k) => {
    if (k.startsWith("cf.")) return;
    obj[k] = typeof v === "string" ? v : null;
  });
  if (obj.paymentTermsDays === "") obj.paymentTermsDays = null;
  obj.publicEntity = fd.get("publicEntity") === "on" ? "true" : "";
  return obj;
}

export async function saveCustomer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία.", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])) };
  const data = parsed.data;

  if (data.country === "GR" && data.afm) {
    data.afm = normalizeAfm(data.afm);
    if (!isValidAfm(data.afm)) return { ok: false, error: "Το ΑΦΜ δεν είναι έγκυρο. Ελέγξτε τα 9 ψηφία.", fieldErrors: { afm: "Ελέγξτε τα 9 ψηφία του ΑΦΜ. Δεν συμφωνούν με το ψηφίο ελέγχου." } };
  }
  if (data.kind === "company" && data.country === "GR" && !data.afm) {
    return { ok: false, error: "Για επιχειρήσεις με έδρα Ελλάδα απαιτείται ΑΦΜ.", fieldErrors: { afm: "Συμπληρώστε το 9ψήφιο ΑΦΜ της επιχείρησης. Αν πρόκειται για ιδιώτη, αλλάξτε τον τύπο πελάτη." } };
  }

  const db = await getDb();
  const { ctx, error: permError } = await requirePermission(db, "write");
  if (permError) return { ok: false, error: permError };
  const org = ctx.org;
  const { id, ...rest } = data;
  const cf = readCustomFieldValues(formData, defsFor(org.customFieldDefsJson, "customer"));
  if (cf.error) return { ok: false, error: cf.error };
  if (rest.salespersonId) {
    const members = await listOrgMembers(db, org.id);
    if (!members.some((m) => m.id === rest.salespersonId)) rest.salespersonId = null;
  }
  const record = { ...rest, customFieldsJson: JSON.stringify(cf.values) };

  let customerId = id;
  if (id) {
    await db.update(customers).set(record).where(and(eq(customers.id, id), eq(customers.orgId, org.id)));
  } else {
    customerId = randomUUID();
    await db.insert(customers).values({ id: customerId, orgId: org.id, ...record, createdAt: new Date().toISOString() });
  }
  await audit(db, org.id, "customer", customerId!, id ? "updated" : "created", rest.name, await resolveActor(db));
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error: permError } = await requirePermission(db, "write");
  if (permError) return { ok: false, error: permError };
  const org = ctx.org;
  const used = await db.query.invoices.findFirst({ where: and(eq(invoices.customerId, id), eq(invoices.orgId, org.id)) });
  if (used) return { ok: false, error: "Ο πελάτης έχει παραστατικά και δεν μπορεί να διαγραφεί. Ορίστε τον ως «Ανενεργό»." };
  await db.delete(customerActivities).where(eq(customerActivities.customerId, id));
  await db.delete(customers).where(and(eq(customers.id, id), eq(customers.orgId, org.id)));
  await audit(db, org.id, "customer", id, "deleted", "", await resolveActor(db));
  revalidatePath("/customers");
  redirect("/customers");
}

const activitySchema = z.object({
  customerId: z.string().min(1),
  kind: z.enum(["call", "email", "meeting", "note", "task"]),
  content: z.string().trim().min(1, "Γράψτε μια σύντομη περιγραφή."),
  dueAt: z.string().optional(),
});

export async function addActivity(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = activitySchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error: permError } = await requirePermission(db, "write");
  if (permError) return { ok: false, error: permError };
  const org = ctx.org;
  const blocked = featureBlockedMessage(org, "crm");
  if (blocked) return { ok: false, error: blocked };
  await db.insert(customerActivities).values({
    id: randomUUID(),
    orgId: org.id,
    customerId: parsed.data.customerId,
    kind: parsed.data.kind,
    content: parsed.data.content,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null,
    done: parsed.data.kind !== "task",
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/customers/${parsed.data.customerId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleActivityDone(id: string, customerId: string) {
  const db = await getDb();
  const { error } = await requirePermission(db, "write");
  if (error) return;
  const act = await db.query.customerActivities.findFirst({ where: eq(customerActivities.id, id) });
  if (!act) return;
  await db.update(customerActivities).set({ done: !act.done }).where(eq(customerActivities.id, id));
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/dashboard");
}
