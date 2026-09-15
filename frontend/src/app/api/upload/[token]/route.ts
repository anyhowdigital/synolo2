import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, docRequests } from "@/db/schema";

const MAX = 8 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const rows = await db.select().from(docRequests).where(eq(docRequests.token, token)).limit(1);
  const request = rows[0];
  if (!request || request.status === "closed" || request.expiresAt < new Date().toISOString()) {
    return NextResponse.json({ error: "Ο σύνδεσμος δεν είναι ενεργός." }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const label = String(form.get("label") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Δεν βρέθηκε αρχείο." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Το αρχείο ξεπερνά τα 8 MB." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  await db.insert(attachments).values({
    id: randomUUID(),
    orgId: request.orgId,
    entityType: "doc_request",
    entityId: request.id,
    fileName: `${label ? `${label} – ` : ""}${file.name}`,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    data: bytes.toString("base64"),
    uploadedByName: "Πελάτης (link)",
    createdAt: new Date().toISOString(),
  });

  const items = (JSON.parse(request.itemsJson) as { label: string; uploaded: boolean }[]).map((i) => (i.label === label ? { ...i, uploaded: true } : i));
  const allDone = items.every((i) => i.uploaded);
  await db
    .update(docRequests)
    .set({ itemsJson: JSON.stringify(items), status: allDone ? "completed" : "open" })
    .where(eq(docRequests.id, request.id));

  return NextResponse.json({ ok: true, allDone });
}
