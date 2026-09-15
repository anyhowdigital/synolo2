import { getDb } from "@/db";
import { documentFile } from "@/lib/services/doc-registry";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = await getDb();
  const file = await documentFile(db, decodeURIComponent(code));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
    },
  });
}
