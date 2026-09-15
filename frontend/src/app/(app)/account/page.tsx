import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { currentSessionId } from "@/lib/auth/session";
import { describeUserAgent, listUserSessions } from "@/lib/auth/security";
import { PageHeader } from "@/components/page-header";
import { PasswordCard, ProfileCard, SessionsCard, TwoFactorCard } from "@/components/account/account-panels";
import { PasskeysCard } from "@/components/account/passkeys-card";
import { NotificationPrefsCard } from "@/components/account/notification-prefs-card";
import { NOTIFICATION_TYPES, parseNotificationPrefs, type NotificationType } from "@/lib/services/notifications";

export const metadata = { title: "Ο λογαριασμός μου" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const db = await getDb();
  const { user, membership } = await requireContext(db);
  const prefs = parseNotificationPrefs(membership.notificationPrefsJson);
  const prefRows = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => ({
    type,
    label: NOTIFICATION_TYPES[type].label,
    description: NOTIFICATION_TYPES[type].description,
    inApp: prefs[type].inApp,
    email: prefs[type].email,
  }));
  const [sessionRows, current] = await Promise.all([listUserSessions(db, user.id), currentSessionId()]);
  const sessions = sessionRows
    .filter((s) => new Date(s.expiresAt) > new Date())
    .sort((a, b) => (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt))
    .map((s) => ({
      id: s.id,
      device: describeUserAgent(s.userAgent),
      ipAddress: s.ipAddress ?? "",
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === current,
    }));

  return (
    <>
      <PageHeader title="Ο λογαριασμός μου" description="Προφίλ, κωδικός, επαλήθευση δύο βημάτων, ειδοποιήσεις και ενεργές συνδέσεις." />
      <div className="grid gap-6">
        <ProfileCard name={user.name} email={user.email} emailVerifiedAt={user.emailVerifiedAt} />
        <NotificationPrefsCard rows={prefRows} smtpConfigured={!!process.env.SMTP_HOST} />
        <TwoFactorCard enabledAt={user.totpEnabledAt} />
        <PasskeysCard />
        <PasswordCard />
        <SessionsCard sessions={sessions} />
      </div>
    </>
  );
}
