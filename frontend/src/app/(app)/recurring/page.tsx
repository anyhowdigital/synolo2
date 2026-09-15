import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { listTemplates } from "@/lib/services/recurring";
import { INTERVAL_LABELS, type RecurringInterval } from "@/lib/services/recurring-labels";
import { loadEditorData } from "@/lib/services/editor-data";
import { formatDate, formatMoney, computeInvoice } from "@/lib/invoice/totals";
import { can } from "@/lib/auth/session";
import type { InvoicePayload } from "@/lib/invoice/schema";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { orgHasFeature } from "@/lib/billing/limits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RunDueButton, TemplateDialog, TemplateRowActions } from "@/components/recurring/recurring-ui";
import { ChangePlanDialog, RetryChargeButton, SavedCardCell } from "@/components/recurring/subscription-ui";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata = { title: "Επαναλαμβανόμενα" };

export default async function RecurringPage() {
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write") && orgHasFeature(org, "recurring");
  const locked = !orgHasFeature(org, "recurring");
  const [templates, refData] = await Promise.all([listTemplates(db, org.id), loadEditorData(db, org.id)]);
  const cardRows = await db
    .select({ id: customers.id, cardBrand: customers.cardBrand, cardLast4: customers.cardLast4, stripePaymentMethodId: customers.stripePaymentMethodId })
    .from(customers)
    .where(eq(customers.orgId, org.id));
  const cardByCustomer = new Map(cardRows.map((c) => [c.id, c]));
  const today = new Date().toISOString().slice(0, 10);
  const dueCount = templates.filter((t) => t.template.active && t.template.nextRunAt <= today).length;

  return (
    <>
      <PageHeader title="Συνδρομές & επαναλαμβανόμενα" description="Συνδρομές, συμβόλαια συντήρησης, ενοίκια: εκδίδονται (και διαβιβάζονται/αποστέλλονται) αυτόματα στην επιλεγμένη συχνότητα.">
        {canWrite ? (
          <>
            <RunDueButton />
            <TemplateDialog refData={refData} />
          </>
        ) : null}
      </PageHeader>
      {locked ? <UpgradeNotice capability="recurring" className="mb-6" description="Αυτόματη έκδοση, διαβίβαση και αποστολή παραστατικών σε μηνιαία/τριμηνιαία/ετήσια βάση. Τα υπάρχοντα πρότυπα παραμένουν ορατά αλλά δεν εκτελούνται." /> : null}

      {dueCount > 0 ? (
        <Alert className="mb-6">
          <AlertTitle>{dueCount} πρότυπα προς εκτέλεση</AlertTitle>
          <AlertDescription>
            Έχουν ημερομηνία εκτέλεσης σήμερα ή νωρίτερα. Εκτελούνται αυτόματα από το cron endpoint <code className="font-mono text-xs">/api/cron/recurring</code> ή πατήστε «Εκτέλεση ληξιπρόθεσμων».
          </AlertDescription>
        </Alert>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState
          title="Δεν υπάρχουν επαναλαμβανόμενα πρότυπα"
          description="Δημιουργήστε πρότυπο από εδώ ή από οποιοδήποτε παραστατικό (μενού ⋯ → «Μετατροπή σε επαναλαμβανόμενο»)."
          action={canWrite ? <TemplateDialog refData={refData} /> : undefined}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Πρότυπο</TableHead>
                <TableHead>Πελάτης</TableHead>
                <TableHead className="hidden md:table-cell">Συχνότητα</TableHead>
                <TableHead>Επόμενη εκτέλεση</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Ποσό</TableHead>
                <TableHead className="hidden lg:table-cell">Αυτοματισμοί</TableHead>
                <TableHead className="hidden xl:table-cell">Κάρτα</TableHead>
                <TableHead className="hidden text-right md:table-cell">Εκτελέσεις</TableHead>
                <TableHead className="w-44" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(({ template: t, customerName }) => {
                let total = 0;
                try {
                  total = computeInvoice(JSON.parse(t.linesJson) as InvoicePayload["lines"]).totalGrossValue;
                } catch {
                  total = 0;
                }
                const due = t.active && t.nextRunAt <= today;
                const customerId = t.customerId;
                const card = cardByCustomer.get(customerId);
                const cardBrand = card?.cardBrand ?? "";
                const cardLast4 = card?.cardLast4 ?? "";
                const hasCard = !!card?.stripePaymentMethodId;
                return (
                  <TableRow key={t.id} className={t.active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      {t.name}
                      {!t.active ? <Badge variant="outline" className="ml-2">Σε παύση</Badge> : null}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{customerName ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{INTERVAL_LABELS[t.interval as RecurringInterval] ?? t.interval}</TableCell>
                    <TableCell className={due ? "font-medium text-amber-700" : ""}>{formatDate(t.nextRunAt)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatMoney(total)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {t.autoIssue ? <Badge variant="secondary">Έκδοση</Badge> : <Badge variant="outline">Πρόχειρο</Badge>}
                        {t.autoTransmit ? <Badge variant="secondary">myDATA</Badge> : null}
                        {t.autoEmail ? <Badge variant="secondary">Email</Badge> : null}
                        {t.autoCharge ? <Badge className="bg-emerald-600">Αυτόματη χρέωση</Badge> : null}
                        {t.chargeFailCount > 0 ? <Badge variant="destructive" title={t.chargeLastError ?? ""}>Αποτυχίες: {t.chargeFailCount}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {customerId ? <SavedCardCell customerId={customerId} brand={cardBrand} last4={cardLast4} hasCard={hasCard} /> : "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {t.runCount}
                      {t.lastRunAt ? <div className="text-xs text-muted-foreground">{formatDate(t.lastRunAt.slice(0, 10))}</div> : null}
                    </TableCell>
                    <TableCell>
                      {canWrite ? (
                        <div className="flex items-center justify-end">
                          <ChangePlanDialog templateId={t.id} templateName={t.name} />
                          {t.autoCharge ? <RetryChargeButton templateId={t.id} /> : null}
                          <TemplateRowActions template={t} refData={refData} />
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
