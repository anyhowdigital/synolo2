import { getDb } from "@/db";
import { apiError, apiJson, requireApiOrg } from "@/lib/api/auth";
import { serializeInvoice } from "@/lib/api/serializers";
import { emailInvoice } from "@/lib/services/invoice-email";
import { cancelIssuedInvoice, getInvoiceWithLines, issueInvoice, transmitToMyData } from "@/lib/services/invoices";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/invoices/[id]">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const gate = await requireApiOrg(db, req);
  if (gate.error) return gate.error;
  const { org, headers } = gate;
  const inv = await getInvoiceWithLines(db, org.id, id);
  if (!inv) return apiError(404, "Το παραστατικό δεν βρέθηκε.");
  return apiJson({ data: serializeInvoice(inv, inv.lines) }, headers);
}

/** Ενέργειες: { "action": "issue" | "transmit" | "cancel" | "email", "to"?: string, "message"?: string } */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/invoices/[id]">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const gate = await requireApiOrg(db, req);
  if (gate.error) return gate.error;
  const { org, headers } = gate;
  let body: { action?: string; to?: string; message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError(400, "Μη έγκυρο JSON.");
  }
  const action = String(body.action ?? "");
  try {
    if (action === "issue") await issueInvoice(db, org, id);
    else if (action === "transmit") {
      const r = await transmitToMyData(db, org, id);
      if (!r.ok) return apiError(422, (r.errors ?? []).map((e) => e.message).join(", "));
    } else if (action === "cancel") await cancelIssuedInvoice(db, org, id);
    else if (action === "email") {
      if (!body.to) return apiError(422, "Απαιτείται πεδίο «to» με email παραλήπτη.");
      await emailInvoice(db, org, id, { to: body.to, message: body.message });
    } else return apiError(400, "Άγνωστη ενέργεια. Επιτρέπονται: issue, transmit, cancel, email.");
    const inv = await getInvoiceWithLines(db, org.id, id);
    return apiJson({ data: serializeInvoice(inv!, inv!.lines) }, headers);
  } catch (err) {
    return apiError(422, (err as Error).message);
  }
}
