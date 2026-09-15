import Link from "next/link";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { quarterPeriod } from "@/lib/services/reports";
import { can } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BulkTransmitButton, MyDataSyncPanel } from "@/components/mydata/mydata-sync-panel";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { orgHasFeature } from "@/lib/billing/limits";

export const metadata = { title: "myDATA – Συμφωνία & διαβίβαση" };

export default async function MyDataPage() {
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const period = quarterPeriod();
  const [pending, [stats]] = await Promise.all([
    listPendingTransmissions(db, org.id),
    db
      .select({
        sent: count(sql`case when ${invoices.mydataStatus} = 'sent' then 1 end`),
        errors: count(sql`case when ${invoices.mydataStatus} = 'error' then 1 end`),
        cancelled: count(sql`case when ${invoices.mydataStatus} = 'cancelled' then 1 end`),
      })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), gte(invoices.issueDate, period.from), lte(invoices.issueDate, period.to))),
  ]);
  const envLabel = org.mydataEnvironment === "prod" ? "Παραγωγή" : org.mydataEnvironment === "dev" ? "Δοκιμαστικό ΑΑΔΕ" : "Προσομοίωση";

  return (
    <>
      <PageHeader title="myDATA – Συμφωνία & διαβίβαση" description="Έλεγχος ότι τα ηλεκτρονικά βιβλία της ΑΑΔΕ συμφωνούν με τα παραστατικά σας, μαζική διαβίβαση εκκρεμών και σύγκριση εσόδων πριν τις δηλώσεις.">
        {canWrite ? <BulkTransmitButton pending={pending.length} mock={org.mydataEnvironment === "mock"} /> : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Περιβάλλον</CardDescription>
            <CardTitle className="text-lg">
              <Badge variant={org.mydataEnvironment === "prod" ? "default" : "secondary"}>{envLabel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {org.mydataUserId ? `Χρήστης ${org.mydataUserId}` : "Χωρίς διαπιστευτήρια – "}
            {!org.mydataUserId ? (
              <Link href="/settings?tab=mydata" className="underline">
                ρύθμιση
              </Link>
            ) : null}
          </CardContent>
        </Card>
        <Card className={pending.length ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Εκκρεμή προς διαβίβαση</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{pending.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">Εκδοθέντα χωρίς MARK ή με σφάλμα (όλες οι περίοδοι)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Διαβιβασμένα τριμήνου</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.sent}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {period.from} – {period.to} · {stats.cancelled} ακυρωμένα
          </CardContent>
        </Card>
        <Card className={stats.errors ? "border-red-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Σφάλματα ΑΑΔΕ τριμήνου</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.errors}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {stats.errors ? (
              <Link href="/invoices?mydata=error" className="underline">
                Προβολή παραστατικών με σφάλμα
              </Link>
            ) : (
              "Καμία απόρριψη από την ΑΑΔΕ"
            )}
          </CardContent>
        </Card>
      </div>

      {orgHasFeature(org, "mydataSync") ? (
        <MyDataSyncPanel from={period.from} to={period.to} mock={org.mydataEnvironment === "mock"} canWrite={canWrite} />
      ) : (
        <UpgradeNotice capability="mydataSync" description="Αντιπαραβολή MARK και εσόδων με τα ηλεκτρονικά βιβλία της ΑΑΔΕ (RequestTransmittedDocs / RequestMyIncome) πριν τις δηλώσεις ΦΠΑ και Ε3. Η μαζική διαβίβαση είναι διαθέσιμη σε όλα τα πακέτα." />
      )}
    </>
  );
}
