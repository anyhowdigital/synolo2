import JSZip from "jszip";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { getCurrentOrg } from "@/lib/services/org";
import { getInvoiceWithLines, invoiceDisplayNumber } from "@/lib/services/invoices";
import { buildInvoicePdf } from "@/lib/services/invoice-pdf";
import { getDocumentType } from "@/lib/greek/document-types";
import { formatDate } from "@/lib/invoice/totals";

export const dynamic = "force-dynamic";
const MAX = 100;

/** Μαζική λήψη επιλεγμένων παραστατικών: `?ids=a,b,c&format=zip` (PDF σε ZIP) ή `format=csv`. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = Array.from(new Set((url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))).slice(0, MAX);
  if (ids.length === 0) return new Response("Δεν επιλέξατε παραστατικά.", { status: 400 });
  const format = url.searchParams.get("format") === "csv" ? "csv" : "zip";
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const rows = (await db.select().from(invoices).where(inArray(invoices.id, ids))).filter((r) => r.orgId === org.id);
  rows.sort((a, b) => (a.issueDate < b.issueDate ? -1 : a.issueDate > b.issueDate ? 1 : a.number - b.number));
  const date = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const head = ["Αριθμός", "Τύπος", "Κωδικός myDATA", "Ημ/νία", "Προθεσμία", "Πελάτης", "ΑΦΜ", "Καθαρό", "ΦΠΑ", "Σύνολο", "Νόμισμα", "Εισπραχθέν", "Κατάσταση", "myDATA", "MARK"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => {
      const dt = getDocumentType(r.invoiceType);
      return [invoiceDisplayNumber(r), dt.name, dt.code, formatDate(r.issueDate), r.dueDate ? formatDate(r.dueDate) : "", r.customerName, r.customerAfm, r.totalNetValue.toFixed(2), r.totalVatAmount.toFixed(2), r.totalGrossValue.toFixed(2), r.currency, r.paidAmount.toFixed(2), r.status, r.mydataStatus, r.mydataMark ?? ""].map(esc).join(";");
    });
    const csv = "\uFEFF" + [head.map(esc).join(";"), ...lines].join("\r\n");
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="invoices_${date}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const zip = new JSZip();
  for (const r of rows) {
    const inv = await getInvoiceWithLines(db, org.id, r.id);
    if (!inv) continue;
    const { buffer, filename } = await buildInvoicePdf(db, org, inv);
    zip.file(filename, buffer);
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="invoices_${date}.zip"`, "Cache-Control": "no-store" },
  });
}
