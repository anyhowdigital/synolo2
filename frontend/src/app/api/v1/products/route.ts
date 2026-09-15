import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { apiJson, requireApiOrg } from "@/lib/api/auth";
import { serializeProduct } from "@/lib/api/serializers";

export async function GET(req: Request) {
  const db = await getDb();
  const gate = await requireApiOrg(db, req);
  if (gate.error) return gate.error;
  const { org, headers } = gate;
  const rows = await db.select().from(products).where(eq(products.orgId, org.id)).orderBy(asc(products.name));
  return apiJson({ data: rows.map(serializeProduct) }, headers);
}
