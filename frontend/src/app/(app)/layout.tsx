import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { planLabel } from "@/lib/billing/plans";
import { ROLE_LABELS, can, type Role } from "@/lib/auth/session";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { ActiveCompany } from "@/components/active-company";
import { TrialBanner } from "@/components/trial-banner";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { countUnread, listNotifications } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const ctx = await requireContext(db);
  const { org, user, role, orgs, membership } = ctx;
  const [unread, notificationRows] = await Promise.all([
    countUnread(db, org.id, user.id, membership.notificationPrefsJson),
    listNotifications(db, org.id, user.id, membership.notificationPrefsJson, 25),
  ]);
  const sidebarProps = {
    orgName: org.name,
    orgId: org.id,
    planLabel: planLabel(org.plan),
    mydataEnv: org.mydataEnvironment,
    userName: user.name,
    userEmail: user.email,
    role,
    roleLabel: ROLE_LABELS[role as Role] ?? role,
    orgs: orgs.map((o) => ({ id: o.org.id, name: o.org.name, role: o.role })),
  };

  return (
    <div className="flex min-h-screen">
      <AppSidebar {...sidebarProps} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 space-y-2 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
          <div className="flex items-center gap-2">
            <MobileNav {...sidebarProps} />
            <div className="flex min-w-0 flex-1 items-center"><CommandPalette /></div>
            <NotificationBell initialUnread={unread} initialItems={notificationRows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, readAt: r.readAt, createdAt: r.createdAt }))} />
            <ThemeToggle />
            {can(role, "write") ? <Button asChild size="sm" data-testid="header-new-invoice"><Link href="/invoices/new" aria-label="Νέο παραστατικό"><Plus data-icon="inline-start" /><span className="sm:hidden">Νέο</span><span className="hidden sm:inline">Νέο παραστατικό</span></Link></Button> : null}
          </div>
          <ActiveCompany name={org.name} afm={org.afm} />
        </header>
        <TrialBanner plan={org.plan} planStatus={org.planStatus} trialEndsAt={org.trialEndsAt} />
        {!user.emailVerifiedAt ? <VerifyEmailBanner email={user.email} /> : null}
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
