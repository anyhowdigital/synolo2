import { and, asc, eq, like, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { apiError, apiJson, requireApiOrg } from "@/lib/api/auth";
import { serializeCustomer } from "@/lib/api/serializers";
import { isValidAfm, normalizeAfm } from "@/lib/greek/afm";

export async function GET(req: Request) {
  const db = await getDb();
  const gate = await requireApiOrg(db, req);
  if (gate.error) return gate.error;
  const { org, headers } = gate;
  const q = new URL(req.url).searchParams.get("q");
  const where = q ? and(eq(customers.orgId, org.id), or(like(customers.name, `%${q}%`), like(customers.afm, `%${q}%`))) : eq(customers.orgId, org.id);
  const rows = await db.select().from(customers).where(where).orderBy(asc(customers.name)).limit(500);
  return apiJson({ data: rows.map(serializeCustomer) }, headers);
}

const schema = z.object({
  kind: z.enum(["company", "individual"]).default("company"),
  name: z.string().trim().min(2),
  afm: z.string().trim().default(""),
  doy: z.string().trim().default(""),
  activity: z.string().trim().default(""),
  address: z.string().trim().default(""),
  city: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  country: z.string().trim().length(2).default("GR"),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  contactPerson: z.string().trim().default(""),
  notes: z.string().default(""),
  stage: z.enum(["lead", "prospect", "customer", "inactive"]).default("customer"),
  paymentTermsDays: z.number().int().min(0).max(365).nullable().default(null),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(422, "Μη έγκυρα στοιχεία.", parsed.error.issues);
  const d = parsed.data;
  if (d.country === "GR" && d.afm) {
    d.afm = normalizeAfm(d.afm);
    if (!isValidAfm(d.afm)) return apiError(422, "Το ΑΦΜ δεν είναι έγκυρο.");
    const existing = await db.query.customers.findFirst({ where: and(eq(customers.orgId, org.id), eq(customers.afm, d.afm)) });
    if (existing) return apiJson({ data: serializeCustomer(existing), existing: true }, headers);
  }
  const id = randomUUID();
  await db.insert(customers).values({ id, orgId: org.id, ...d, createdAt: new Date().toISOString() });
  const row = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  return apiJson({ data: serializeCustomer(row!) }, headers, { status: 201 });
}
