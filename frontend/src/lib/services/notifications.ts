import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { memberships, notifications, organizations, users, type Notification } from "@/db/schema";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";

/** Τύποι ειδοποιήσεων ροής. Τα defaults καθορίζουν τι λαμβάνει ο χρήστης αν δεν έχει ρυθμίσει προτιμήσεις. */
export const NOTIFICATION_TYPES = {
  document_viewed: { label: "Ο πελάτης άνοιξε παραστατικό", description: "Πρώτο άνοιγμα email ή δημόσιου συνδέσμου.", defaults: { inApp: true, email: false } },
  quote_accepted: { label: "Αποδοχή προσφοράς", description: "Ο πελάτης αποδέχθηκε προσφορά με ηλεκτρονική υπογραφή.", defaults: { inApp: true, email: true } },
  quote_rejected: { label: "Απόρριψη προσφοράς", description: "Ο πελάτης απέρριψε προσφορά.", defaults: { inApp: true, email: true } },
  payment_received: { label: "Είσπραξη online πληρωμής", description: "Πληρωμή με κάρτα από τη δημόσια σελίδα ή το portal.", defaults: { inApp: true, email: true } },
  mydata_error: { label: "Σφάλμα διαβίβασης myDATA", description: "Η ΑΑΔΕ απέρριψε παραστατικό ή απέτυχε η σύνδεση.", defaults: { inApp: true, email: true } },
  invoice_overdue: { label: "Ληξιπρόθεσμα παραστατικά", description: "Ημερήσια σύνοψη παραστατικών που έληξαν.", defaults: { inApp: true, email: false } },
  comment_added: { label: "Μήνυμα πελάτη", description: "Ο πελάτης έγραψε στη συζήτηση ενός παραστατικού.", defaults: { inApp: true, email: true } },
  recurring_issued: { label: "Έκδοση επαναλαμβανόμενου παραστατικού", description: "Αυτόματη έκδοση από πρότυπο.", defaults: { inApp: true, email: false } },
  b2g_rejected: { label: "Απόρριψη/σφάλμα τιμολόγησης Δημοσίου", description: "Ο φορέας ή ο πάροχος PEPPOL απέρριψε παραστατικό, ή λείπουν υποχρεωτικά στοιχεία B2G.", defaults: { inApp: true, email: true } },
  compliance_risk: {
    label: "Κίνδυνος συμμόρφωσης (ΑΑΔΕ)",
    description: "Νέο εύρημα υψηλής σοβαρότητας στο radar «Κίνδυνοι» (μη διαβιβασμένα, κενά αρίθμησης, λάθη ΦΠΑ κ.ά.).",
    defaults: { inApp: true, email: true },
  },
  tax_deadline: { label: "Φορολογική προθεσμία", description: "Υπενθύμιση πριν από προθεσμίες Φ2, ΦΜΥ, ΑΠΔ και δηλώσεων.", defaults: { inApp: true, email: true } },
  tax_kb_review: { label: "Έλεγχος φορολογικών κανόνων", description: "Ετήσια/χειροκίνητη υπενθύμιση επανελέγχου της βάσης γνώσης του Συμβούλου (νέες κλίμακες/όρια).", defaults: { inApp: true, email: false } },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export type NotificationPref = { inApp: boolean; email: boolean };
export type NotificationPrefs = Record<NotificationType, NotificationPref>;

export function isNotificationType(v: string): v is NotificationType {
  return v in NOTIFICATION_TYPES;
}

/** Συγχωνεύει αποθηκευμένες προτιμήσεις με τα defaults. */
export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  let stored: Partial<Record<string, Partial<NotificationPref>>> = {};
  try {
    const parsed = JSON.parse(json || "{}");
    if (parsed && typeof parsed === "object") stored = parsed;
  } catch {
    stored = {};
  }
  const out = {} as NotificationPrefs;
  for (const key of Object.keys(NOTIFICATION_TYPES) as NotificationType[]) {
    const d = NOTIFICATION_TYPES[key].defaults;
    const s = stored[key] ?? {};
    out[key] = { inApp: typeof s.inApp === "boolean" ? s.inApp : d.inApp, email: typeof s.email === "boolean" ? s.email : d.email };
  }
  return out;
}

export interface NotifyInput {
  orgId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
  /** Συγκεκριμένος χρήστης· αν λείπει, η ειδοποίηση αφορά όλους τους χρήστες του οργανισμού. */
  userId?: string | null;
  /** Παράλειψη αποστολής email (π.χ. όταν ήδη στέλνεται ειδικό email για το γεγονός). */
  skipEmail?: boolean;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Καταγράφει in-app ειδοποίηση και στέλνει email στα μέλη που το έχουν ενεργό για τον τύπο.
 * Δεν πετάει ποτέ σφάλμα (best effort) ώστε να μη διακόπτει την κύρια ροή.
 */
export async function notify(db: Db, input: NotifyInput): Promise<Notification | null> {
  try {
    const row: Notification = {
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title.slice(0, 200),
      body: (input.body ?? "").slice(0, 1000),
      link: input.link ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    await db.insert(notifications).values(row);
    if (!input.skipEmail) await fanOutEmail(db, row).catch(() => undefined);
    return row;
  } catch {
    return null;
  }
}

async function fanOutEmail(db: Db, n: Notification) {
  const type = n.type as NotificationType;
  if (!isNotificationType(type)) return;
  const rows = await db
    .select({ email: users.email, name: users.name, prefs: memberships.notificationPrefsJson, userId: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(n.userId ? and(eq(memberships.orgId, n.orgId), eq(memberships.userId, n.userId)) : eq(memberships.orgId, n.orgId));
  const recipients = rows.filter((r) => r.email && parseNotificationPrefs(r.prefs)[type].email);
  if (recipients.length === 0) return;
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, n.orgId), columns: { name: true } });
  const html = layoutEmail(
    n.title,
    `<p>${esc(n.body || NOTIFICATION_TYPES[type].label)}</p><p style="font-size:12px;color:#777">Ειδοποίηση από τον οργανισμό ${esc(org?.name ?? "")}. Μπορείτε να αλλάξετε τις ειδοποιήσεις email από «Ο λογαριασμός μου».</p>`,
    n.link ? { label: "Άνοιγμα στην εφαρμογή", url: appUrl(n.link) } : undefined,
  );
  for (const r of recipients) {
    await sendMail(db, { orgId: n.orgId, to: r.email, subject: `${n.title} – ${org?.name ?? "Σύνολο ERP"}`, html }).catch(() => undefined);
  }
}

function visibleTo(orgId: string, userId: string) {
  return and(eq(notifications.orgId, orgId), or(isNull(notifications.userId), eq(notifications.userId, userId)));
}

/** Ειδοποιήσεις του χρήστη, φιλτραρισμένες με τις in-app προτιμήσεις του. */
export async function listNotifications(db: Db, orgId: string, userId: string, prefsJson: string | null | undefined, limit = 30) {
  const prefs = parseNotificationPrefs(prefsJson);
  const rows = await db.select().from(notifications).where(visibleTo(orgId, userId)).orderBy(desc(notifications.createdAt)).limit(limit * 2);
  return rows.filter((r) => !isNotificationType(r.type) || prefs[r.type].inApp).slice(0, limit);
}

export async function countUnread(db: Db, orgId: string, userId: string, prefsJson: string | null | undefined) {
  const prefs = parseNotificationPrefs(prefsJson);
  const disabled = (Object.keys(prefs) as NotificationType[]).filter((k) => !prefs[k].inApp);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(visibleTo(orgId, userId), isNull(notifications.readAt), disabled.length ? sql`${notifications.type} not in (${sql.join(disabled.map((d) => sql`${d}`), sql`, `)})` : undefined));
  return Number(count);
}

export async function markRead(db: Db, orgId: string, userId: string, id: string | "all") {
  const now = new Date().toISOString();
  const where = id === "all" ? and(visibleTo(orgId, userId), isNull(notifications.readAt)) : and(visibleTo(orgId, userId), eq(notifications.id, id));
  await db.update(notifications).set({ readAt: now }).where(where);
}
