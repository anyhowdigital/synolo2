"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { officeDashboards } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_WIDGETS, WIDGETS, type WidgetId } from "@/lib/services/office-widgets";

export type WidgetSize = "sm" | "md" | "lg";
export interface WidgetPref {
  id: WidgetId;
  size: WidgetSize;
}

export async function loadDashboard(userId: string): Promise<WidgetPref[]> {
  const db = await getDb();
  const row = await db.query.officeDashboards.findFirst({ where: eq(officeDashboards.userId, userId) });
  if (!row) return DEFAULT_WIDGETS;
  try {
    const parsed = JSON.parse(row.widgetsJson) as WidgetPref[];
    const valid = parsed.filter((w) => WIDGETS.some((d) => d.id === w.id));
    return valid.length ? valid : DEFAULT_WIDGETS;
  } catch {
    return DEFAULT_WIDGETS;
  }
}

export async function saveDashboardAction(widgets: WidgetPref[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const clean = (Array.isArray(widgets) ? widgets : []).filter((w) => WIDGETS.some((d) => d.id === w.id)).slice(0, 12).map((w) => ({ id: w.id, size: (["sm", "md", "lg"].includes(w.size) ? w.size : "sm") as WidgetSize }));
  const existing = await db.query.officeDashboards.findFirst({ where: eq(officeDashboards.userId, user.id) });
  const now = new Date().toISOString();
  if (existing) await db.update(officeDashboards).set({ widgetsJson: JSON.stringify(clean), updatedAt: now }).where(eq(officeDashboards.id, existing.id));
  else await db.insert(officeDashboards).values({ id: randomUUID(), userId: user.id, widgetsJson: JSON.stringify(clean), updatedAt: now });
  revalidatePath("/office");
  return { ok: true };
}

export async function resetDashboardAction() {
  return saveDashboardAction(DEFAULT_WIDGETS);
}
