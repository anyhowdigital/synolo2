"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { series, products } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { TEMPLATES } from "@/lib/marketplace/templates";

export type ActionResult = { ok: true; imported: number } | { ok: false; error: string };

export async function applyTemplate(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const templateId = String(formData.get("templateId") ?? "");
  const tmpl = TEMPLATES[templateId];
  if (!tmpl) return { ok: false, error: "Μη έγκυρο πακέτο." };

  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const org = ctx.org;
  let imported = 0;
  const now = new Date().toISOString();

  for (const s of tmpl.series) {
    const existing = await db.select().from(series).where(and(eq(series.orgId, org.id), eq(series.code, s.code)));
    if (existing.length > 0) continue;
    await db.insert(series).values({
      id: randomUUID(),
      orgId: org.id,
      code: s.code,
      name: s.name,
      invoiceType: s.invoiceType,
      nextNumber: 1,
      active: true,
    });
    imported++;
  }

  for (const p of tmpl.products) {
    const existing = await db.select().from(products).where(and(eq(products.orgId, org.id), eq(products.sku, p.sku)));
    if (existing.length > 0) continue;
    await db.insert(products).values({
      id: randomUUID(),
      orgId: org.id,
      name: p.name,
      sku: p.sku,
      kind: "service",
      unitPrice: p.unitPrice,
      vatCategory: p.vatCategory,
      vatExemptionCategory: p.vatCategory === 7 ? 12 : null,
      classificationCategory: p.classificationCategory,
      classificationType: p.classificationType,
      measurementUnit: p.measurementUnit,
      createdAt: now,
      description: "",
      tags: "[]",
      customFieldsJson: "{}",
      category: p.category,
      stockQuantity: 0,
    });
    imported++;
  }

  await audit(db, org.id, "organization", org.id, "template_applied", `${tmpl.label} → ${imported} νέες εγγραφές`, await resolveActor(db));
  revalidatePath("/settings");
  revalidatePath("/products");
  return { ok: true, imported };
}
