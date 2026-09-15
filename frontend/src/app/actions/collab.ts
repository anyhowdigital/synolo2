"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type Db } from "@/db";
import { customers, documentNotes, expenses, invoices } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { addAttachment, addNote, deleteAttachment, deleteNote, type CollabEntity } from "@/lib/services/collab";
import type { ActionResult } from "./customers";

const ENTITIES: CollabEntity[] = ["invoice", "customer", "expense"];

async function entityInOrg(db: Db, orgId: string, entityType: CollabEntity, entityId: string) {
  if (entityType === "invoice") return !!(await db.query.invoices.findFirst({ where: and(eq(invoices.orgId, orgId), eq(invoices.id, entityId)), columns: { id: true } }));
  if (entityType === "customer") return !!(await db.query.customers.findFirst({ where: and(eq(customers.orgId, orgId), eq(customers.id, entityId)), columns: { id: true } }));
  return !!(await db.query.expenses.findFirst({ where: and(eq(expenses.orgId, orgId), eq(expenses.id, entityId)), columns: { id: true } }));
}

function pathFor(entityType: CollabEntity, entityId: string) {
  return entityType === "invoice" ? `/invoices/${entityId}` : entityType === "customer" ? `/customers/${entityId}` : "/expenses";
}

export async function addNoteAction(entityType: CollabEntity, entityId: string, body: string, visibility: "internal" | "customer" = "internal"): Promise<ActionResult> {
  const text = body.trim();
  if (!ENTITIES.includes(entityType)) return { ok: false, error: "Άγνωστος τύπος εγγραφής." };
  if (!text) return { ok: false, error: "Γράψτε πρώτα τη σημείωση." };
  if (text.length > 4000) return { ok: false, error: "Η σημείωση δεν μπορεί να ξεπερνά τους 4.000 χαρακτήρες." };
  const db = await getDb();
  // Και ο λογιστής (read-only) μπορεί να αφήσει σημείωση προς την ομάδα.
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  if (!(await entityInOrg(db, ctx.org.id, entityType, entityId))) return { ok: false, error: "Η εγγραφή δεν βρέθηκε." };
  const customerVisible = visibility === "customer" && entityType === "invoice";
  const id = await addNote(db, ctx.org.id, entityType, entityId, text, await resolveActor(db), { visibility: customerVisible ? "customer" : "internal" });
  revalidatePath(pathFor(entityType, entityId));
  if (customerVisible) {
    const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, entityId), eq(invoices.orgId, ctx.org.id)), columns: { publicToken: true } });
    if (inv?.publicToken) revalidatePath(`/p/${inv.publicToken}`);
  }
  return { ok: true, id };
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "read");
  if (error) return { ok: false, error };
  const note = await db.query.documentNotes.findFirst({ where: and(eq(documentNotes.orgId, ctx.org.id), eq(documentNotes.id, noteId)) });
  if (!note) return { ok: false, error: "Η σημείωση δεν βρέθηκε." };
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";
  if (!isAdmin && note.authorId !== ctx.user.id) return { ok: false, error: "Μπορείτε να διαγράψετε μόνο τις δικές σας σημειώσεις." };
  await deleteNote(db, ctx.org.id, noteId);
  revalidatePath(pathFor(note.entityType as CollabEntity, note.entityId));
  return { ok: true };
}

export async function uploadAttachmentAction(entityType: CollabEntity, entityId: string, formData: FormData): Promise<ActionResult> {
  if (!ENTITIES.includes(entityType)) return { ok: false, error: "Άγνωστος τύπος εγγραφής." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Επιλέξτε ένα αρχείο." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  if (!(await entityInOrg(db, ctx.org.id, entityType, entityId))) return { ok: false, error: "Η εγγραφή δεν βρέθηκε." };
  try {
    const id = await addAttachment(db, ctx.org.id, entityType, entityId, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, await resolveActor(db));
    revalidatePath(pathFor(entityType, entityId));
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteAttachmentAction(id: string): Promise<ActionResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const ok = await deleteAttachment(db, ctx.org.id, id, await resolveActor(db));
  if (!ok) return { ok: false, error: "Το συνημμένο δεν βρέθηκε." };
  revalidatePath("/", "layout");
  return { ok: true };
}
