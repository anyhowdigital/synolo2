import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { series } from "@/db/schema";
import { apiError, apiJson, requireApiOrg } from "@/lib/api/auth";
import { getInvoiceWithLines, issueInvoice, listInvoices, saveDraft, transmitToMyData } from "@/lib/services/invoices";
import { serializeInvoice } from "@/lib/api/serializers";
import { invoicePayloadSchema } from "@/lib/invoice/schema";
import { defsFor, normalizeTags, serializeTags, validateCustomFieldValues } from "@/lib/services/custom-fields";

export async function GET(req: Request) {
  const db = await getDb();
  const gate = await requireApiOrg(db, req);
  if (gate.error) return gate.error;
  const { org, headers } = gate;
  const url = new URL(req.url);
  const result = await listInvoices(db, org.id, {
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    customerId: url.searchParams.get("customerId") ?? undefined,
    kind: (url.searchParams.get("kind") as "all" | "quote" | "invoice" | "delivery" | "fiscal" | null) ?? "fiscal",
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Math.min(100, Number(url.searchParams.get("pageSize") ?? 25)),
  });
  return apiJson({
    data: result.rows.map((r) => serializeInvoice(r)),
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, pages: result.pages },
  }, headers);
}

const createSchema = invoicePayloadSchema.omit({ id: true, seriesId: true, issueNow: true }).extend({
  series: z.string().min(1, "Απαιτείται κωδικός σειράς (π.χ. ΤΠΥ)."),
  issue: z.boolean().default(false),
  transmit: z.boolean().default(false),
});

export async function POST(req: Request) {
  const db = await getDb();
  const gate = await requireApiOrg(db, req);
  if (gate.error) return gate.error;
  const { org, headers } = gate;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Μη έγκυρο JSON.");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "Μη έγκυρα στοιχεία.", parsed.error.issues);
  const d = parsed.data;
  const ser = await db.query.series.findFirst({ where: and(eq(series.orgId, org.id), eq(series.code, d.series)) });
  if (!ser) return apiError(422, `Δεν υπάρχει σειρά «${d.series}».`);
  try {
    const { tags, customFields, ...rest } = d;
    const cf = validateCustomFieldValues(customFields ?? {}, defsFor(org.customFieldDefsJson, "invoice"));
    if (cf.error) return apiError(422, cf.error);
    const id = await saveDraft(db, org, {
      ...rest,
      seriesId: ser.id,
      dueDate: d.dueDate || null,
      tags: serializeTags(normalizeTags(tags ?? [])),
      customFieldsJson: JSON.stringify(cf.values),
    });
    if (d.issue) {
      await issueInvoice(db, org, id);
      if (d.transmit || org.autoTransmit) await transmitToMyData(db, org, id);
    }
    const inv = await getInvoiceWithLines(db, org.id, id);
    return apiJson({ data: serializeInvoice(inv!, inv!.lines) }, headers, { status: 201 });
  } catch (err) {
    return apiError(422, (err as Error).message);
  }
}
