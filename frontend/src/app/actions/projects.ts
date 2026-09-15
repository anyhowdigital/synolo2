"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { projects, projectTasks, timeEntries, projectExpenses, invoices, series } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { saveDraft } from "@/lib/services/invoices";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const projectSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Το όνομα έργου είναι υποχρεωτικό."),
  code: z.string().trim().default(""),
  description: z.string().default(""),
  customerId: z.string().optional().nullable().transform((v) => (v && v !== "none" ? v : null)),
  status: z.enum(["active", "on_hold", "completed", "archived"]).default("active"),
  billable: z.coerce.boolean().default(true),
  hourlyRate: z.coerce.number().min(0).default(0),
  budgetAmount: z.coerce.number().min(0).nullable().default(null),
  budgetHours: z.coerce.number().min(0).nullable().default(null),
  startsOn: z.string().optional().nullable(),
  endsOn: z.string().optional().nullable(),
  color: z.string().default("#2563eb"),
});

function formToObject(fd: FormData) {
  const obj: Record<string, string | null> = {};
  fd.forEach((v, k) => (obj[k] = typeof v === "string" ? v : null));
  if (obj.budgetAmount === "") obj.budgetAmount = null;
  if (obj.budgetHours === "") obj.budgetHours = null;
  if (obj.startsOn === "") obj.startsOn = null;
  if (obj.endsOn === "") obj.endsOn = null;
  obj.billable = obj.billable === "on" || obj.billable === "true" ? "true" : "false";
  return obj;
}

export async function saveProject(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const { id, ...rest } = parsed.data;
  let pid = id;
  if (id) {
    await db.update(projects).set(rest).where(and(eq(projects.id, id), eq(projects.orgId, org.id)));
  } else {
    pid = randomUUID();
    await db.insert(projects).values({ id: pid, orgId: org.id, tags: "[]", ...rest, createdAt: new Date().toISOString() });
  }
  await audit(db, org.id, "project", pid!, id ? "updated" : "created", rest.name, await resolveActor(db));
  revalidatePath("/projects");
  revalidatePath(`/projects/${pid}`);
  redirect(`/projects/${pid}`);
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  await db.delete(timeEntries).where(and(eq(timeEntries.projectId, id), eq(timeEntries.orgId, org.id)));
  await db.delete(projectExpenses).where(and(eq(projectExpenses.projectId, id), eq(projectExpenses.orgId, org.id)));
  await db.delete(projectTasks).where(and(eq(projectTasks.projectId, id), eq(projectTasks.orgId, org.id)));
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.orgId, org.id)));
  await audit(db, org.id, "project", id, "deleted", "", await resolveActor(db));
  revalidatePath("/projects");
  redirect("/projects");
}

// ---------- Tasks ----------
export async function saveTask(projectId: string, name: string, hourlyRate: number | null): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  if (!name.trim()) return { ok: false, error: "Το όνομα εργασίας είναι υποχρεωτικό." };
  await db.insert(projectTasks).values({
    id: randomUUID(),
    orgId: org.id,
    projectId,
    name: name.trim(),
    hourlyRate: hourlyRate ?? null,
    billable: true,
    done: false,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function toggleTaskDone(id: string, projectId: string): Promise<ActionResult> {
  const db = await getDb();
  const { error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const row = await db.query.projectTasks.findFirst({ where: eq(projectTasks.id, id) });
  if (!row) return { ok: false, error: "Δεν βρέθηκε." };
  await db.update(projectTasks).set({ done: !row.done }).where(eq(projectTasks.id, id));
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------- Time entries ----------
const timeEntrySchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().optional().nullable().transform((v) => (v && v !== "none" ? v : null)),
  description: z.string().default(""),
  startedAt: z.string().min(1, "Ημ/νία έναρξης απαιτείται."),
  minutes: z.coerce.number().int().min(1, "Ελάχιστα 1 λεπτό."),
  hourlyRate: z.coerce.number().min(0).default(0),
  billable: z.coerce.boolean().default(true),
});

export async function logTimeEntry(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  obj.billable = obj.billable === "on" || obj.billable === "true" ? "true" : "false";
  const parsed = timeEntrySchema.safeParse(obj);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const started = new Date(parsed.data.startedAt);
  const ended = new Date(started.getTime() + parsed.data.minutes * 60000);
  await db.insert(timeEntries).values({
    id: randomUUID(),
    orgId: org.id,
    projectId: parsed.data.projectId,
    taskId: parsed.data.taskId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    description: parsed.data.description,
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    minutes: parsed.data.minutes,
    hourlyRate: parsed.data.hourlyRate,
    billable: parsed.data.billable,
    status: "logged",
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true };
}

export async function startTimer(projectId: string, taskId: string | null, description: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  // Σταμάτημα άλλων τρεχόντων timers του χρήστη
  const running = await db.select().from(timeEntries).where(and(eq(timeEntries.orgId, org.id), eq(timeEntries.userId, ctx.user.id), eq(timeEntries.status, "running")));
  const now = new Date();
  for (const r of running) {
    const startedTs = new Date(r.startedAt).getTime();
    const mins = Math.max(1, Math.round((now.getTime() - startedTs) / 60000));
    await db.update(timeEntries).set({ endedAt: now.toISOString(), minutes: mins, status: "logged" }).where(eq(timeEntries.id, r.id));
  }
  const proj = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.orgId, org.id)) });
  if (!proj) return { ok: false, error: "Δεν βρέθηκε το έργο." };
  await db.insert(timeEntries).values({
    id: randomUUID(),
    orgId: org.id,
    projectId,
    taskId: taskId && taskId !== "none" ? taskId : null,
    userId: ctx.user.id,
    userName: ctx.user.name,
    description,
    startedAt: now.toISOString(),
    endedAt: null,
    minutes: 0,
    hourlyRate: proj.hourlyRate,
    billable: proj.billable,
    status: "running",
    createdAt: now.toISOString(),
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function stopTimer(entryId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const entry = await db.query.timeEntries.findFirst({ where: and(eq(timeEntries.id, entryId), eq(timeEntries.orgId, org.id)) });
  if (!entry) return { ok: false, error: "Δεν βρέθηκε." };
  const now = new Date();
  const mins = Math.max(1, Math.round((now.getTime() - new Date(entry.startedAt).getTime()) / 60000));
  await db.update(timeEntries).set({ endedAt: now.toISOString(), minutes: mins, status: "logged" }).where(eq(timeEntries.id, entryId));
  revalidatePath(`/projects/${entry.projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteTimeEntry(entryId: string, projectId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  await db.delete(timeEntries).where(and(eq(timeEntries.id, entryId), eq(timeEntries.orgId, ctx.org.id), isNull(timeEntries.invoiceId)));
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------- Project expenses ----------
export async function logProjectExpense(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const obj = Object.fromEntries(formData.entries()) as Record<string, string>;
  const projectId = obj.projectId;
  const description = (obj.description || "").trim();
  const amount = Number(obj.amount || 0);
  const incurredOn = obj.incurredOn || new Date().toISOString().slice(0, 10);
  const markup = Number(obj.markupPercent || 0);
  if (!projectId || !description || !(amount > 0)) return { ok: false, error: "Περιγραφή και ποσό > 0 απαιτούνται." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  await db.insert(projectExpenses).values({
    id: randomUUID(),
    orgId: ctx.org.id,
    projectId,
    description,
    amount,
    incurredOn,
    billable: obj.billable === "on" || obj.billable === "true",
    markupPercent: markup,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteProjectExpense(id: string, projectId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  await db.delete(projectExpenses).where(and(eq(projectExpenses.id, id), eq(projectExpenses.orgId, ctx.org.id), isNull(projectExpenses.invoiceId)));
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------- Billing unbilled time & expenses ----------
export async function invoiceUnbilled(projectId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.orgId, org.id)) });
  if (!project) return { ok: false, error: "Δεν βρέθηκε το έργο." };
  if (!project.customerId) return { ok: false, error: "Το έργο δεν έχει συνδεδεμένο πελάτη." };

  const unbilledTime = await db.select().from(timeEntries).where(and(
    eq(timeEntries.orgId, org.id),
    eq(timeEntries.projectId, projectId),
    eq(timeEntries.status, "logged"),
    eq(timeEntries.billable, true),
    isNull(timeEntries.invoiceId),
  ));
  const unbilledExp = await db.select().from(projectExpenses).where(and(
    eq(projectExpenses.orgId, org.id),
    eq(projectExpenses.projectId, projectId),
    eq(projectExpenses.billable, true),
    isNull(projectExpenses.invoiceId),
  ));
  if (unbilledTime.length === 0 && unbilledExp.length === 0) return { ok: false, error: "Δεν υπάρχουν μη χρεωμένες ώρες ή έξοδα." };

  // Επιλογή σειράς ΤΠΥ (2.1) — υπηρεσίες. Fallback στην πρώτη ενεργή τιμολόγησης.
  const srs = await db.select().from(series).where(and(eq(series.orgId, org.id), eq(series.active, true)));
  const chosen = srs.find((s) => s.invoiceType === "2.1") ?? srs.find((s) => s.invoiceType === "1.1") ?? srs[0];
  if (!chosen) return { ok: false, error: "Δεν βρέθηκε ενεργή σειρά τιμολόγησης." };

  // Ομαδοποίηση ωρών ανά task για μία γραμμή ανά εργασία.
  const byTask = new Map<string, typeof unbilledTime>();
  for (const t of unbilledTime) {
    const k = t.taskId ?? "_none";
    const arr = byTask.get(k) ?? [];
    arr.push(t);
    byTask.set(k, arr);
  }
  const taskRows = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  const taskById = new Map(taskRows.map((t) => [t.id, t]));

  const draftLines: Parameters<typeof saveDraft>[2]["lines"] = [];
  for (const [k, arr] of byTask) {
    const totalMins = arr.reduce((s, t) => s + t.minutes, 0);
    const hours = totalMins / 60;
    if (hours <= 0) continue;
    const revenue = arr.reduce((s, t) => s + (t.hourlyRate * t.minutes) / 60, 0);
    const rate = hours > 0 ? revenue / hours : 0;
    const label = k === "_none" ? `${project.name} — Ώρες εργασίας` : `${project.name} — ${taskById.get(k)?.name ?? "Εργασία"}`;
    draftLines.push({
      productId: null,
      description: `${label} (${hours.toFixed(2)} ώρες)`,
      quantity: +hours.toFixed(2),
      unitPrice: +rate.toFixed(2),
      discountPercent: 0,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 1,
      classificationCategory: "category1_3",
      classificationType: "E3_561_001",
      withholdingCategory: 0,
      stampDutyCategory: 0,
    });
  }
  for (const e of unbilledExp) {
    const total = e.amount * (1 + (e.markupPercent || 0) / 100);
    draftLines.push({
      productId: null,
      description: `Έξοδο έργου: ${e.description}`,
      quantity: 1,
      unitPrice: +total.toFixed(2),
      discountPercent: 0,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 1,
      classificationCategory: "category1_3",
      classificationType: "E3_561_001",
      withholdingCategory: 0,
      stampDutyCategory: 0,
    });
  }
  if (draftLines.length === 0) return { ok: false, error: "Δεν υπάρχουν χρεώσιμες γραμμές (μηδενικές ώρες)." };

  let invoiceId: string;
  try {
    invoiceId = await saveDraft(db, org, {
      customerId: project.customerId,
      seriesId: chosen.id,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: null,
      currency: "EUR",
      paymentMethod: 1,
      notes: `Τιμολόγηση έργου: ${project.name}`,
      correlatedInvoiceId: null,
      lines: draftLines,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[projects.invoiceUnbilled] saveDraft failed:", msg);
    return { ok: false, error: `Αποτυχία δημιουργίας πρόχειρου: ${msg}` };
  }

  // Σύνδεση καταχωρήσεων ωρών/εξόδων με το νέο παραστατικό.
  for (const t of unbilledTime) {
    await db.update(timeEntries).set({ invoiceId, status: "invoiced" }).where(eq(timeEntries.id, t.id));
  }
  for (const e of unbilledExp) {
    await db.update(projectExpenses).set({ invoiceId }).where(eq(projectExpenses.id, e.id));
  }
  await audit(db, org.id, "project", projectId, "billed", `Τιμολογήθηκαν ${unbilledTime.length} καταχωρήσεις χρόνου + ${unbilledExp.length} έξοδα → πρόχειρο ${invoiceId}`, await resolveActor(db));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}
