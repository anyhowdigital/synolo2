"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { opportunities, customers } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import type { OppStageId } from "@/lib/crm/stages";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const oppSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, "Τίτλος υποχρεωτικός."),
  customerId: z.string().optional().nullable().transform((v) => (v && v !== "none" ? v : null)),
  stage: z.enum(["lead", "qualified", "quote", "negotiation", "won", "lost"]).default("lead"),
  amount: z.coerce.number().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(20),
  expectedCloseDate: z.string().optional().nullable(),
  description: z.string().default(""),
  lostReason: z.string().default(""),
});

function toObj(fd: FormData) {
  const obj: Record<string, string | null> = {};
  fd.forEach((v, k) => (obj[k] = typeof v === "string" ? v : null));
  if (obj.expectedCloseDate === "") obj.expectedCloseDate = null;
  return obj;
}

export async function saveOpportunity(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = oppSchema.safeParse(toObj(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const { id, customerId, ...rest } = parsed.data;
  let customerName = "";
  if (customerId) {
    const cust = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.orgId, org.id)) });
    customerName = cust?.name ?? "";
  }
  const now = new Date().toISOString();
  const closedAt = (rest.stage === "won" || rest.stage === "lost") ? now : null;
  let oid = id;
  if (id) {
    await db.update(opportunities).set({ ...rest, customerId, customerName, closedAt, updatedAt: now }).where(and(eq(opportunities.id, id), eq(opportunities.orgId, org.id)));
  } else {
    oid = randomUUID();
    await db.insert(opportunities).values({
      id: oid,
      orgId: org.id,
      ...rest,
      customerId,
      customerName,
      ownerId: ctx.user.id,
      ownerName: ctx.user.name,
      sortOrder: 0,
      closedAt,
      createdAt: now,
      updatedAt: now,
    });
  }
  await audit(db, org.id, "opportunity", oid!, id ? "updated" : "created", rest.title, await resolveActor(db));
  revalidatePath("/crm");
  return { ok: true, id: oid! };
}

export async function moveOpportunity(id: string, newStage: OppStageId): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const now = new Date().toISOString();
  const closedAt = (newStage === "won" || newStage === "lost") ? now : null;
  const probMap: Record<string, number> = { lead: 10, qualified: 30, quote: 50, negotiation: 70, won: 100, lost: 0 };
  await db.update(opportunities).set({ stage: newStage, probability: probMap[newStage] ?? 20, closedAt, updatedAt: now }).where(and(eq(opportunities.id, id), eq(opportunities.orgId, ctx.org.id)));
  revalidatePath("/crm");
  return { ok: true };
}

export async function deleteOpportunity(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  await db.delete(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, ctx.org.id)));
  revalidatePath("/crm");
  return { ok: true };
}
