import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { getAttachment } from "@/lib/services/collab";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/attachments/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const ctx = await requireContext(db);
  const row = await getAttachment(db, ctx.org.id, id);
  if (!row) return new Response("Δεν βρέθηκε.", { status: 404 });
  const bytes = Buffer.from(row.data, "base64");
  const ascii = row.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const inline = row.mimeType === "application/pdf" || row.mimeType.startsWith("image/");
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
