import JSZip from "jszip";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, auditLog, customerActivities, customers, documentNotes, expenses, invoiceLines, invoices, payments, products, recurringTemplates, series } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/roles";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";

export const dynamic = "force-dynamic";

/**
 * Πλήρης εξαγωγή δεδομένων οργανισμού (GDPR / φορητότητα / backup): ZIP με JSON ανά οντότητα
 * και CSV για τα βασικά αρχεία. Διαθέσιμο σε όλους τους ρόλους με δικαίωμα ρυθμίσεων.
 */
export async function GET() {
  const db = await getDb();
  const ctx = await requireContext(db);
  if (!can(ctx.role, "manageSettings")) return new Response("Απαιτείται ρόλος διαχειριστή.", { status: 403 });
  const orgId = ctx.org.id;

  const [cust, prod, inv, pay, exp, ser, rec, act, log, notes, files] = await Promise.all([
    db.select().from(customers).where(eq(customers.orgId, orgId)),
    db.select().from(products).where(eq(products.orgId, orgId)),
    db.select().from(invoices).where(eq(invoices.orgId, orgId)),
    db.select().from(payments).where(eq(payments.orgId, orgId)),
    db.select().from(expenses).where(eq(expenses.orgId, orgId)),
    db.select().from(series).where(eq(series.orgId, orgId)),
    db.select().from(recurringTemplates).where(eq(recurringTemplates.orgId, orgId)),
    db.select().from(customerActivities).where(eq(customerActivities.orgId, orgId)),
    db.select().from(auditLog).where(eq(auditLog.orgId, orgId)),
    db.select().from(documentNotes).where(eq(documentNotes.orgId, orgId)),
    db.select().from(attachments).where(eq(attachments.orgId, orgId)),
  ]);
  const invoiceIds = inv.map((i) => i.id);
  const lines = invoiceIds.length ? await db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invoiceIds)) : [];

  const { mydataSubscriptionKey: _key, mydataUserId: _uid, stripeCustomerId: _sc, stripeSubscriptionId: _ss, ...orgPublic } = ctx.org;
  void _key;
  void _uid;
  void _sc;
  void _ss;

  const zip = new JSZip();
  const stamp = new Date().toISOString();
  zip.file("README.txt", readme(ctx.org.name, stamp));
  zip.file("organization.json", JSON.stringify(orgPublic, null, 2));
  const json = zip.folder("json")!;
  json.file("customers.json", JSON.stringify(cust, null, 2));
  json.file("products.json", JSON.stringify(prod, null, 2));
  json.file("invoices.json", JSON.stringify(inv, null, 2));
  json.file("invoice_lines.json", JSON.stringify(lines, null, 2));
  json.file("payments.json", JSON.stringify(pay, null, 2));
  json.file("expenses.json", JSON.stringify(exp, null, 2));
  json.file("series.json", JSON.stringify(ser, null, 2));
  json.file("recurring_templates.json", JSON.stringify(rec, null, 2));
  json.file("customer_activities.json", JSON.stringify(act, null, 2));
  json.file("audit_log.json", JSON.stringify(log, null, 2));
  json.file("notes.json", JSON.stringify(notes, null, 2));
  json.file("attachments.json", JSON.stringify(files.map((f) => ({ ...f, data: undefined })), null, 2));
  if (files.length) {
    const att = zip.folder("attachments")!;
    for (const f of files) att.file(`${f.entityType}/${f.entityId}/${f.id.slice(0, 8)}_${f.fileName.replace(/[\\/:*?"<>|]+/g, "_")}`, Buffer.from(f.data, "base64"));
  }
  const csv = zip.folder("csv")!;
  csv.file("customers.csv", toCsv(cust));
  csv.file("products.csv", toCsv(prod));
  csv.file("invoices.csv", toCsv(inv));
  csv.file("invoice_lines.csv", toCsv(lines));
  csv.file("payments.csv", toCsv(pay));
  csv.file("expenses.csv", toCsv(exp));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await audit(db, orgId, "organization", orgId, "data_export", `${inv.length} παραστατικά, ${cust.length} πελάτες, ${exp.length} έξοδα`, await resolveActor(db));
  const ascii = ctx.org.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "org";
  const utf8 = encodeURIComponent(ctx.org.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40));
  const date = stamp.slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="timologio_export_${ascii}_${date}.zip"; filename*=UTF-8''timologio_export_${utf8}_${date}.zip`,
      "Cache-Control": "no-store",
    },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "\uFEFF";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");
}

function readme(orgName: string, stamp: string) {
  return [
    `Σύνολο ERP – πλήρης εξαγωγή δεδομένων`,
    `Οργανισμός: ${orgName}`,
    `Ημερομηνία: ${stamp}`,
    ``,
    `json/   Όλες οι εγγραφές ανά οντότητα σε JSON (πλήρη πεδία, ISO ημερομηνίες, ποσά σε αριθμούς).`,
    `csv/    Τα βασικά αρχεία σε CSV (UTF-8 με BOM, διαχωριστικό «;») για Excel.`,
    ``,
    `Δεν περιλαμβάνονται: κωδικοί πρόσβασης, κλειδιά myDATA/API, στοιχεία Stripe.`,
    `Τα παραστατικά που έχουν διαβιβαστεί στο myDATA φέρουν MARK/UID και είναι αμετάβλητα κατά ΕΛΠ.`,
  ].join("\n");
}
