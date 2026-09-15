import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { accountantProfiles, issuedDocuments, organizations, users } from "@/db/schema";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function shortCode(len = 10) {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export interface RegisterInput {
  orgId: string;
  kind: string;
  title: string;
  period?: string;
  fileName: string;
  mimeType?: string;
  bytes: Uint8Array | Buffer;
  userId?: string;
  userName?: string;
  store?: boolean;
}

/** Καταχώρηση εγγράφου στο μητρώο: μοναδικός κωδικός + SHA-256 + στοιχεία υπογράφοντος λογιστή. */
export async function registerDocument(db: Db, input: RegisterInput) {
  const buf = Buffer.from(input.bytes);
  const hash = createHash("sha256").update(buf).digest("hex");
  const profile = input.userId ? await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, input.userId) }) : undefined;
  let code = shortCode();
  for (let i = 0; i < 5; i++) {
    const clash = await db.query.issuedDocuments.findFirst({ where: eq(issuedDocuments.code, code) });
    if (!clash) break;
    code = shortCode();
  }
  const row = {
    id: randomUUID(),
    code,
    orgId: input.orgId,
    kind: input.kind,
    title: input.title,
    period: input.period ?? "",
    fileName: input.fileName,
    mimeType: input.mimeType ?? "application/pdf",
    hash,
    size: buf.byteLength,
    data: input.store === false ? "" : buf.toString("base64"),
    issuedByUserId: input.userId ?? "",
    issuedByName: profile?.signatureName || input.userName || "",
    firmName: profile?.firmName ?? "",
    regNo: profile?.regNo ?? "",
    revoked: false,
    createdAt: new Date().toISOString(),
  };
  await db.insert(issuedDocuments).values(row);
  return { code, hash, id: row.id, stampDataUrl: profile?.stampDataUrl ?? "" };
}

/** Δημόσια επαλήθευση εγγράφου με κωδικό (και προαιρετικό hash αρχείου). */
export async function verifyDocument(db: Db, code: string) {
  const doc = await db.query.issuedDocuments.findFirst({ where: eq(issuedDocuments.code, code.trim().toUpperCase()) });
  if (!doc) return null;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, doc.orgId) });
  const issuer = doc.issuedByUserId ? await db.query.users.findFirst({ where: eq(users.id, doc.issuedByUserId) }) : undefined;
  return {
    code: doc.code,
    kind: doc.kind,
    title: doc.title,
    period: doc.period,
    fileName: doc.fileName,
    hash: doc.hash,
    size: doc.size,
    revoked: doc.revoked,
    createdAt: doc.createdAt,
    orgName: org?.name ?? "",
    orgAfm: org?.afm ?? "",
    issuedByName: doc.issuedByName || issuer?.name || "",
    firmName: doc.firmName,
    regNo: doc.regNo,
    hasFile: !!doc.data,
  };
}

export async function documentFile(db: Db, code: string) {
  const doc = await db.query.issuedDocuments.findFirst({ where: eq(issuedDocuments.code, code.trim().toUpperCase()) });
  if (!doc || !doc.data) return null;
  return { bytes: Buffer.from(doc.data, "base64"), fileName: doc.fileName, mimeType: doc.mimeType };
}

export async function listDocuments(db: Db, orgIds: string[]) {
  if (!orgIds.length) return [];
  const rows = await db.select().from(issuedDocuments).orderBy(desc(issuedDocuments.createdAt)).limit(200);
  return rows.filter((r) => orgIds.includes(r.orgId));
}

export async function revokeDocument(db: Db, orgId: string, id: string) {
  await db.update(issuedDocuments).set({ revoked: true }).where(and(eq(issuedDocuments.id, id), eq(issuedDocuments.orgId, orgId)));
}
