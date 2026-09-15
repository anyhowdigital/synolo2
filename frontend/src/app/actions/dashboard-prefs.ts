"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { memberships } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { DASHBOARD_WIDGETS, type DashboardWidgetKey } from "@/lib/services/dashboard-prefs";

type ActionResult = { ok: true } | { ok: false; error: string };

const ALL = DASHBOARD_WIDGETS.map((w) => w.key) as string[];

export async function saveDashboardPrefs(hidden: string[], order: string[]): Promise<ActionResult> {
  try {
    const db = await getDb();
    const { membership } = await requireContext(db);
    const clean = (arr: string[]) => arr.filter((k) => ALL.includes(k)) as DashboardWidgetKey[];
    await db
      .update(memberships)
      .set({ dashboardPrefsJson: JSON.stringify({ hidden: clean(hidden), order: clean(order) }) })
      .where(eq(memberships.id, membership.id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Αποτυχία αποθήκευσης." };
  }
}
