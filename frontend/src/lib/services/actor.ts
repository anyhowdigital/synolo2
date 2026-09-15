import { cache } from "react";
import type { Db } from "@/db";
import { getCurrentContext, requestIp } from "@/lib/auth/session";
import type { AuditActor } from "./audit";

/**
 * Ο «δράστης» της τρέχουσας ενέργειας για το ιστορικό: ο συνδεδεμένος χρήστης,
 * ή «API» / «Σύστημα» όταν η κλήση προέρχεται από κλειδί API ή cron.
 */
export const resolveActor = cache(async (db: Db): Promise<AuditActor | null> => {
  try {
    const ctx = await getCurrentContext(db);
    if (ctx) return { id: ctx.user.id, name: ctx.user.name, ip: await requestIp() };
  } catch {
    // Εκτός request scope (π.χ. seed) – χωρίς δράστη.
  }
  return null;
});

export const API_ACTOR: AuditActor = { id: "api", name: "API" };
export const SYSTEM_ACTOR: AuditActor = { id: "system", name: "Σύστημα (αυτοματισμός)" };
