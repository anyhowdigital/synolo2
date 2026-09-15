import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { monthlyClose } from "@/lib/services/monthly-close";
import { closingPdfFilename, renderClosingPdf } from "@/lib/pdf/closing-pdf";
import { registerDocument } from "@/lib/services/doc-registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const firm = await resolveFirm(db, user.id);
  if (!firm) return new Response("Forbidden", { status: 403 });
  const client = await firmClient(db, firm, orgId);
  if (!client) return new Response("Forbidden", { status: 403 });

  const data = await monthlyClose(db, client.org, month);
  const buffer = await renderClosingPdf({ org: client.org, close: data });
  const reg = await registerDocument(db, {
    orgId: client.org.id,
    kind: "closing",
    title: `Μηνιαίο κλείσιμο ${month}`,
    period: month,
    fileName: closingPdfFilename(month),
    bytes: buffer,
    userId: user.id,
    userName: user.name,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${closingPdfFilename(month)}"`,
      "X-Document-Code": reg.code,
      "X-Document-Hash": reg.hash,
    },
  });
}
