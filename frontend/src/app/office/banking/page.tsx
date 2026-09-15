import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { bankTransactions } from "@/db/schema";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { listAccounts } from "@/lib/services/banking";
import { round2 } from "@/lib/invoice/totals";
import { OfficeBankingTable } from "@/components/office/office-banking-table";

export const dynamic = "force-dynamic";

export default async function OfficeBankingPage() {
  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);

  const rows = await Promise.all(
    clients.map(async (c) => {
      const accounts = await listAccounts(db, c.org.id);
      const txs = accounts.length
        ? await db
            .select()
            .from(bankTransactions)
            .where(
              and(
                eq(bankTransactions.orgId, c.org.id),
                eq(bankTransactions.status, "unmatched"),
                inArray(
                  bankTransactions.accountId,
                  accounts.map((a) => a.id),
                ),
              ),
            )
        : [];
      return {
        orgId: c.org.id,
        name: c.org.name,
        afm: c.org.afm,
        accounts: accounts.length,
        unmatched: txs.length,
        inflow: round2(txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
        outflow: round2(txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)),
        oldest: txs.map((t) => t.bookedAt).sort()[0] ?? null,
        accessLevel: c.accessLevel,
      };
    }),
  );

  return <OfficeBankingTable rows={rows} />;
}
