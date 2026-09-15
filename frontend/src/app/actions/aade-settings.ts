"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";

export type ActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  aadeRgUsername: z.string().trim().max(80).default(""),
  aadeRgPassword: z.string().trim().max(200).default(""),
});

export async function saveAadeCredentials(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({
    aadeRgUsername: formData.get("aadeRgUsername") ?? "",
    aadeRgPassword: formData.get("aadeRgPassword") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const patch: { aadeRgUsername: string; aadeRgPassword?: string } = { aadeRgUsername: parsed.data.aadeRgUsername };
  // Κενό πεδίο κωδικού = διατήρηση του αποθηκευμένου (όπως δηλώνει το placeholder). Καθαρίζει μόνο όταν καθαρίζει και το username.
  if (parsed.data.aadeRgPassword) patch.aadeRgPassword = parsed.data.aadeRgPassword;
  else if (!parsed.data.aadeRgUsername) patch.aadeRgPassword = "";
  await db.update(organizations).set(patch).where(eq(organizations.id, ctx.org.id));
  await audit(db, ctx.org.id, "organization", ctx.org.id, "aade_creds_updated", parsed.data.aadeRgUsername ? "set" : "cleared", await resolveActor(db));
  revalidatePath("/settings");
  return { ok: true };
}

export async function testAadeCredentials(): Promise<{ ok: true; source: string; sample?: unknown } | { ok: false; error: string }> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "manageSettings");
  if (error) return { ok: false, error };
  const org = ctx.org;
  if (!org.aadeRgUsername || !org.aadeRgPassword) return { ok: false, error: "Δεν έχετε αποθηκεύσει διαπιστευτήρια." };
  // Δοκιμαστική κλήση με το ΑΦΜ της ίδιας της επιχείρησης
  const testAfm = org.afm;
  if (!testAfm) return { ok: false, error: "Δεν βρέθηκε ΑΦΜ επιχείρησης για δοκιμή." };
  try {
    const resp = await fetch(`${process.env.APP_URL || "http://localhost:3000"}/api/afm/lookup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ afm: testAfm, orgId: org.id }),
    });
    const data = await resp.json();
    if (!data.ok) return { ok: false, error: data.error ?? "Αποτυχία." };
    return { ok: true, source: data.source, sample: data.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Σφάλμα." };
  }
}
