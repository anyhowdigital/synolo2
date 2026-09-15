import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { memberships } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm } from "@/lib/services/firm";
import { OfficeContext } from "@/components/office/office-context";
import { OfficeMobileNav, OfficeSidebar } from "@/components/office/office-sidebar";

const ROLE_LABELS: Record<string, string> = { owner: "Ιδιοκτήτης γραφείου", partner: "Συνεργάτης", staff: "Υπάλληλος" };

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  const firm = await resolveFirm(db, user.id);
  if (!firm) {
    // Χρήστης επιχείρησης: δεν είναι λογιστικό γραφείο — πίσω στο δικό του πάνελ.
    const membership = await db.query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
    redirect(membership ? "/dashboard?office=denied" : "/accountant-signup");
  }
  const clients = await firmClients(db, firm);

  const props = {
    firmName: firm.firmName || "Λογιστικό γραφείο",
    userName: user.name || user.email,
    roleLabel: ROLE_LABELS[firm.role] ?? firm.role,
    clientCount: clients.length,
    alerts: 0,
  };

  return (
    <div className="flex min-h-screen bg-background">
      <OfficeSidebar {...props} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 space-y-2 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
          <div className="flex items-center gap-2 lg:hidden"><OfficeMobileNav {...props} /><span className="truncate text-sm">{props.firmName}</span></div>
          <OfficeContext firmName={props.firmName} clients={clients.map((client) => ({ id: client.org.id, name: client.org.name, afm: client.org.afm }))} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
