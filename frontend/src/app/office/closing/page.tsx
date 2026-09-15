import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClients, resolveFirm } from "@/lib/services/firm";
import { closingStatus } from "@/app/actions/office-tools";
import { CLOSING_STEPS } from "@/lib/services/closing-steps";
import { ClosingMatrix } from "@/components/office/closing-matrix";
import { currentMonth } from "@/lib/services/monthly-close";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { bankTransactions, expenses, periodLocks } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Μηνιαίο κλείσιμο πελατών" };

export default async function OfficeClosingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : currentMonth();
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);
  const orgIds = clients.map((c) => c.org.id);

  const [status, pendings, drafts, unmatched, locks] = await Promise.all([
    closingStatus(orgIds, month),
    Promise.all(clients.map(async (c) => ({ orgId: c.org.id, n: (await listPendingTransmissions(db, c.org.id)).length }))),
    orgIds.length ? db.select().from(expenses).where(and(inArray(expenses.orgId, orgIds), eq(expenses.status, "draft"))) : Promise.resolve([]),
    orgIds.length ? db.select().from(bankTransactions).where(and(inArray(bankTransactions.orgId, orgIds), eq(bankTransactions.status, "unmatched"))) : Promise.resolve([]),
    orgIds.length ? db.select().from(periodLocks).where(inArray(periodLocks.orgId, orgIds)) : Promise.resolve([]),
  ]);

  const rows = clients.map((c) => ({
    orgId: c.org.id,
    name: c.org.name,
    steps: status[c.org.id] ?? {},
    checks: {
      mydataPending: pendings.find((p) => p.orgId === c.org.id)?.n ?? 0,
      draftExpenses: drafts.filter((d) => d.orgId === c.org.id).length,
      unmatchedBank: unmatched.filter((t) => t.orgId === c.org.id).length,
      locked: locks.some((l) => l.orgId === c.org.id && l.month === month),
    },
    readOnly: c.accessLevel === "read",
  }));

  return <ClosingMatrix month={month} rows={rows} steps={CLOSING_STEPS.map((s) => ({ code: s.code, label: s.label }))} />;
}
