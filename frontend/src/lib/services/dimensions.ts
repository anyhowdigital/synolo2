import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, expenses, invoices, memberships, products, suppliers, users } from "@/db/schema";
import { parseTags } from "./custom-fields";

import type { MemberOption } from "@/lib/i18n/languages";

export { DOCUMENT_LANGUAGES, isDocumentLanguage, type DocumentLanguage, type MemberOption } from "@/lib/i18n/languages";

/** Μέλη του οργανισμού (για επιλογή πωλητή/υπεύθυνου). */
export async function listOrgMembers(db: Db, orgId: string): Promise<MemberOption[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(users.name));
  return rows;
}

/** Όλες οι ετικέτες που χρησιμοποιούνται σε μια οντότητα (για προτάσεις). */
export type TagEntity = "customer" | "invoice" | "expense" | "product" | "supplier";

export async function collectTags(db: Db, orgId: string, entity: TagEntity): Promise<string[]> {
  const table =
    entity === "customer" ? customers : entity === "invoice" ? invoices : entity === "expense" ? expenses : entity === "supplier" ? suppliers : products;
  const rows = await db.select({ tags: table.tags }).from(table).where(eq(table.orgId, orgId));
  const set = new Map<string, string>();
  for (const r of rows) for (const t of parseTags(r.tags)) set.set(t.toLowerCase(), t);
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b, "el"));
}

export function parseChannels(salesChannels: string | null | undefined) {
  return (salesChannels ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Κοινά δεδομένα φορμών: μέλη, ετικέτες, κανάλια. */
export async function loadFormExtras(db: Db, orgId: string, entity: TagEntity) {
  const [members, tagSuggestions] = await Promise.all([listOrgMembers(db, orgId), collectTags(db, orgId, entity)]);
  return { members, tagSuggestions };
}
