import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { vatReport, f2Report } from "@/lib/services/reports";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { lockedMonths } from "@/lib/services/periods";
import { VatComplianceTable } from "@/components/office/vat-compliance-table";

export const dynamic = "force-dynamic";

function monthPeriod(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default async function OfficeVatPage({ searchParams }: PageProps<"/office/vat">) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const period = monthPeriod(month);

  const db = await getDb();
  const user = (await getCurrentUser(db))!;
  const firm = (await resolveFirm(db, user.id))!;
  const clients = await firmClients(db, firm);

  const rows = await Promise.all(
    clients.map(async (c) => {
      const [vat, f2, pending, locks] = await Promise.all([
        vatReport(db, c.org.id, period),
        f2Report(db, c.org.id, period),
        listPendingTransmissions(db, c.org.id),
        lockedMonths(db, c.org.id),
      ]);
      const code = (c2: string) => f2.codes.find((x) => x.code === c2)?.amount ?? 0;
      return {
        orgId: c.org.id,
        name: c.org.name,
        afm: c.org.afm,
        outputVat: code("337"),
        inputVat: code("387"),
        payable: f2.payable,
        credit: f2.credit,
        booksVat: vat.totalVat,
        invoiceCount: vat.invoiceCount,
        pendingMydata: pending.length,
        locked: locks.some((l) => l.month === month),
        accessLevel: c.accessLevel,
      };
    }),
  );

  return <VatComplianceTable month={month} rows={rows} />;
}
