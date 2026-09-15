"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { memberships } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import {
  countUnread,
  isNotificationType,
  listNotifications,
  markRead,
  NOTIFICATION_TYPES,
  parseNotificationPrefs,
  type NotificationPrefs,
  type NotificationType,
} from "@/lib/services/notifications";
import type { ActionResult } from "./customers";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function fetchNotificationsAction(): Promise<{ items: NotificationItem[]; unread: number }> {
  const db = await getDb();
  const { org, user, membership } = await requireContext(db);
  const [rows, unread] = await Promise.all([
    listNotifications(db, org.id, user.id, membership.notificationPrefsJson, 25),
    countUnread(db, org.id, user.id, membership.notificationPrefsJson),
  ]);
  return { items: rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, readAt: r.readAt, createdAt: r.createdAt })), unread };
}

export async function markNotificationReadAction(id: string | "all"): Promise<ActionResult> {
  const db = await getDb();
  const { org, user } = await requireContext(db);
  await markRead(db, org.id, user.id, id);
  return { ok: true };
}

export async function saveNotificationPrefsAction(prefs: Partial<Record<string, { inApp?: boolean; email?: boolean }>>): Promise<ActionResult> {
  const db = await getDb();
  const { membership } = await requireContext(db);
  const current = parseNotificationPrefs(membership.notificationPrefsJson);
  const next: NotificationPrefs = { ...current };
  for (const key of Object.keys(prefs)) {
    if (!isNotificationType(key)) continue;
    const p = prefs[key] ?? {};
    next[key as NotificationType] = {
      inApp: typeof p.inApp === "boolean" ? p.inApp : current[key as NotificationType].inApp,
      email: typeof p.email === "boolean" ? p.email : current[key as NotificationType].email,
    };
  }
  // Αποθηκεύουμε μόνο ό,τι διαφέρει από τα defaults ώστε μελλοντικές αλλαγές στα defaults να ισχύουν.
  const compact: Record<string, { inApp?: boolean; email?: boolean }> = {};
  for (const key of Object.keys(NOTIFICATION_TYPES) as NotificationType[]) {
    const d = NOTIFICATION_TYPES[key].defaults;
    const v = next[key];
    const diff: { inApp?: boolean; email?: boolean } = {};
    if (v.inApp !== d.inApp) diff.inApp = v.inApp;
    if (v.email !== d.email) diff.email = v.email;
    if (Object.keys(diff).length) compact[key] = diff;
  }
  await db.update(memberships).set({ notificationPrefsJson: JSON.stringify(compact) }).where(eq(memberships.id, membership.id));
  revalidatePath("/account");
  return { ok: true };
}
