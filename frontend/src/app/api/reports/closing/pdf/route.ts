import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { currentMonth, monthlyClose } from "@/lib/services/monthly-close";
import { closingPdfFilename, renderClosingPdf } from "@/lib/pdf/closing-pdf";

export const dynamic = "force-dynamic";

/** Έκθεση μηνιαίου κλεισίματος σε PDF για τον λογιστή. `?month=YYYY-MM` */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const close = await monthlyClose(db, org, month);
  const buffer = await renderClosingPdf({ org, close });
  const filename = closingPdfFilename(month);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
