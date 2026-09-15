import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getInvoiceByPublicToken } from "@/lib/services/invoices";
import { recordDocumentView } from "@/lib/services/document-views";

export const dynamic = "force-dynamic";

// 1x1 διαφανές GIF – tracking pixel για το άνοιγμα του email.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function pixelResponse() {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "content-length": String(PIXEL.length),
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/p/[token]/open">) {
  const { token } = await ctx.params;
  try {
    const db = await getDb();
    const inv = await getInvoiceByPublicToken(db, token);
    if (inv) {
      const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
      await recordDocumentView(db, inv, "email", { ip, userAgent: req.headers.get("user-agent") });
    }
  } catch {
    // Το pixel επιστρέφεται πάντα – η καταγραφή είναι best effort.
  }
  return pixelResponse();
}
