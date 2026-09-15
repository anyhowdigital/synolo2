import "server-only";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { platformSettings } from "@/db/schema";
import { getPlatformPlanOverrides, setPlatformPlanOverrides, type PlatformPlanOverrides } from "./plans";

const ROW_ID = "global";
let warmed: Promise<void> | null = null;

async function load(db: Db) {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, ROW_ID));
  if (row?.planOverridesJson) {
    try {
      setPlatformPlanOverrides(JSON.parse(row.planOverridesJson) as PlatformPlanOverrides);
    } catch {
      // αγνόηση κατεστραμμένου JSON — μένουν τα defaults
    }
  }
}

/** Θερμαίνει το cache των overrides μία φορά ανά διεργασία (φθηνό μετά την πρώτη κλήση). */
export async function ensurePlatformOverrides(db: Db) {
  if (!warmed) {
    warmed = load(db).catch(() => {
      warmed = null;
    });
  }
  return warmed;
}

/** Φρέσκια ανάγνωση από τη βάση (για το admin UI) και ενημέρωση του cache. */
export async function readPlatformOverrides(): Promise<PlatformPlanOverrides> {
  const db = await getDb();
  await load(db);
  return getPlatformPlanOverrides();
}

export async function savePlatformOverrides(ov: PlatformPlanOverrides) {
  const db = await getDb();
  const json = JSON.stringify(ov ?? {});
  const now = new Date().toISOString();
  await db
    .insert(platformSettings)
    .values({ id: ROW_ID, planOverridesJson: json, updatedAt: now })
    .onConflictDoUpdate({ target: platformSettings.id, set: { planOverridesJson: json, updatedAt: now } });
  setPlatformPlanOverrides(ov ?? {});
}
