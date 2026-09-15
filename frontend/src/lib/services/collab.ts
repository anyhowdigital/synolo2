import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { attachments, auditLog, documentNotes, emailOutbox, type Attachment } from "@/db/schema";
import { audit, type AuditActor } from "./audit";

export type CollabEntity = "invoice" | "customer" | "expense";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ENTITY = 20;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xml",
  "text/xml",
]);

export type AttachmentMeta = Omit<Attachment, "data">;

export interface ActivityItem {
  id: string;
  kind: "audit" | "email" | "note";
  at: string;
  title: string;
  detail: string;
  actor: string | null;
  noteId?: string;
  authorId?: string | null;
  visibility?: NoteVisibility;
  authorType?: NoteAuthorType;
}

export async function listNotes(db: Db, orgId: string, entityType: CollabEntity, entityId: string) {
  return db
    .select()
    .from(documentNotes)
    .where(and(eq(documentNotes.orgId, orgId), eq(documentNotes.entityType, entityType), eq(documentNotes.entityId, entityId)))
    .orderBy(desc(documentNotes.createdAt));
}

export type NoteVisibility = "internal" | "customer";
export type NoteAuthorType = "user" | "customer";

export async function addNote(
  db: Db,
  orgId: string,
  entityType: CollabEntity,
  entityId: string,
  body: string,
  actor: AuditActor | null,
  opts: { visibility?: NoteVisibility; authorType?: NoteAuthorType; authorName?: string } = {},
) {
  const id = randomUUID();
  await db.insert(documentNotes).values({
    id,
    orgId,
    entityType,
    entityId,
    authorId: actor?.id ?? null,
    authorName: opts.authorName ?? actor?.name ?? "Χρήστης",
    body,
    visibility: opts.visibility ?? "internal",
    authorType: opts.authorType ?? "user",
    createdAt: new Date().toISOString(),
  });
  return id;
}

/** Συζήτηση με τον πελάτη: μόνο τα μηνύματα που είναι ορατά σε αυτόν (δικά του + απαντήσεις ομάδας), παλαιότερα πρώτα. */
export async function listCustomerThread(db: Db, orgId: string, entityType: CollabEntity, entityId: string) {
  return db
    .select()
    .from(documentNotes)
    .where(and(eq(documentNotes.orgId, orgId), eq(documentNotes.entityType, entityType), eq(documentNotes.entityId, entityId), eq(documentNotes.visibility, "customer")))
    .orderBy(asc(documentNotes.createdAt));
}

export async function deleteNote(db: Db, orgId: string, noteId: string) {
  await db.delete(documentNotes).where(and(eq(documentNotes.orgId, orgId), eq(documentNotes.id, noteId)));
}

export async function listAttachments(db: Db, orgId: string, entityType: CollabEntity, entityId: string): Promise<AttachmentMeta[]> {
  return db
    .select({
      id: attachments.id,
      orgId: attachments.orgId,
      entityType: attachments.entityType,
      entityId: attachments.entityId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      size: attachments.size,
      uploadedBy: attachments.uploadedBy,
      uploadedByName: attachments.uploadedByName,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(and(eq(attachments.orgId, orgId), eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
    .orderBy(desc(attachments.createdAt));
}

export async function addAttachment(
  db: Db,
  orgId: string,
  entityType: CollabEntity,
  entityId: string,
  file: { name: string; type: string; bytes: Buffer },
  actor: AuditActor | null,
) {
  const existing = await listAttachments(db, orgId, entityType, entityId);
  if (existing.length >= MAX_ATTACHMENTS_PER_ENTITY) throw new Error(`Μέγιστο ${MAX_ATTACHMENTS_PER_ENTITY} συνημμένα ανά εγγραφή.`);
  if (file.bytes.byteLength === 0) throw new Error("Το αρχείο είναι κενό.");
  if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Το αρχείο ξεπερνά τα 4 MB.");
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_ATTACHMENT_TYPES.has(mime)) throw new Error("Μη επιτρεπτός τύπος αρχείου. Επιτρέπονται PDF, εικόνες, Excel/CSV, Word, XML και κείμενο.");
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    orgId,
    entityType,
    entityId,
    fileName: file.name.slice(0, 200) || "αρχείο",
    mimeType: mime,
    size: file.bytes.byteLength,
    data: file.bytes.toString("base64"),
    uploadedBy: actor?.id ?? null,
    uploadedByName: actor?.name ?? null,
    createdAt: new Date().toISOString(),
  });
  await audit(db, orgId, entityType, entityId, "attachment_added", file.name, actor);
  return id;
}

export async function getAttachment(db: Db, orgId: string, id: string) {
  return db.query.attachments.findFirst({ where: and(eq(attachments.orgId, orgId), eq(attachments.id, id)) });
}

export async function deleteAttachment(db: Db, orgId: string, id: string, actor: AuditActor | null) {
  const row = await getAttachment(db, orgId, id);
  if (!row) return false;
  await db.delete(attachments).where(eq(attachments.id, id));
  await audit(db, orgId, row.entityType, row.entityId, "attachment_removed", row.fileName, actor);
  return true;
}

/** Ενοποιημένο ιστορικό: ενέργειες (audit), emails και σημειώσεις, νεότερα πρώτα. */
export async function listActivity(db: Db, orgId: string, entityType: CollabEntity, entityId: string, labels: Record<string, string>): Promise<ActivityItem[]> {
  const [audits, emails, notes] = await Promise.all([
    db.select().from(auditLog).where(and(eq(auditLog.orgId, orgId), eq(auditLog.entity, entityType), eq(auditLog.entityId, entityId))).orderBy(desc(auditLog.createdAt)).limit(200),
    db.select().from(emailOutbox).where(and(eq(emailOutbox.orgId, orgId), eq(emailOutbox.relatedEntity, entityType), eq(emailOutbox.relatedId, entityId))).orderBy(desc(emailOutbox.createdAt)).limit(50),
    listNotes(db, orgId, entityType, entityId),
  ]);
  const items: ActivityItem[] = [
    ...audits
      .filter((a) => a.action !== "emailed")
      .map((a) => ({ id: `a-${a.id}`, kind: "audit" as const, at: a.createdAt, title: labels[a.action] ?? a.action, detail: a.detail ?? "", actor: a.actorName })),
    ...emails.map((e) => ({
      id: `e-${e.id}`,
      kind: "email" as const,
      at: e.createdAt,
      title: e.status === "sent" ? "Email στάλθηκε" : e.status === "failed" ? "Αποτυχία αποστολής email" : e.status === "logged" ? "Email καταγράφηκε (χωρίς SMTP)" : "Email σε ουρά",
      detail: `${e.to} · ${e.subject}${e.error ? ` · ${e.error}` : ""}`,
      actor: null,
    })),
    ...notes.map((n) => ({
      id: `n-${n.id}`,
      kind: "note" as const,
      at: n.createdAt,
      title: n.authorType === "customer" ? "Μήνυμα πελάτη" : n.visibility === "customer" ? "Απάντηση προς πελάτη" : "Σημείωση",
      detail: n.body,
      actor: n.authorName,
      noteId: n.id,
      authorId: n.authorId,
      visibility: n.visibility as NoteVisibility,
      authorType: n.authorType as NoteAuthorType,
    })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
