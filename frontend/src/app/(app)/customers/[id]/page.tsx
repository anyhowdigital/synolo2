import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { BookOpenText, FilePlus, Mail, MapPin, Pencil, Phone, User } from "lucide-react";
import { getDb } from "@/db";
import { customerActivities, customers } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { invoiceDisplayNumber, invoicesForCustomer } from "@/lib/services/invoices";
import { formatDate, formatMoney, round2 } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge, MyDataStatusBadge, StageBadge } from "@/components/status-badge";
import { ActivityPanel } from "@/components/customers/activity-panel";
import { DeleteCustomerButton } from "@/components/customers/delete-customer-button";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { orgHasFeature } from "@/lib/billing/limits";
import { ActivityPanel as CollabPanel } from "@/components/collab/activity-panel";
import { listActivity, listAttachments } from "@/lib/services/collab";
import { AUDIT_ACTION_LABELS } from "@/lib/services/audit";
import { TagList } from "@/components/tags/tag-input";
import { CustomFieldList } from "@/components/custom-fields/custom-field-inputs";
import { defsFor, parseCustomFieldValues, parseTags } from "@/lib/services/custom-fields";
import { listOrgMembers } from "@/lib/services/dimensions";
import { DOCUMENT_LANGUAGES } from "@/lib/i18n/languages";
import { PortalCard } from "@/components/customers/portal-card";
import { portalUrl } from "@/lib/services/portal";
import { CREDIT_KIND_LABELS, creditSummary, customerOutstanding, listCredits, offsetTargets, type CreditKind } from "@/lib/services/credits";
import { listAccounts } from "@/lib/services/banking";
import { ApplyCreditDialog, CreditMoneyDialog, DeleteCreditButton, ManualCreditDialog } from "@/components/customers/credit-ui";
import { CreditProfileCard } from "@/components/customers/credit-profile-card";
import { customerCreditProfile } from "@/lib/services/credit-profile";
import { paymentBehaviourByCustomer } from "@/lib/services/payment-prediction";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_METHODS } from "@/lib/greek/document-types";
import { cn } from "@/lib/utils";

export default async function CustomerDetailPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const { org, role, user } = await requireContext(db);
  const canWrite = can(role, "write");
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.orgId, org.id)) });
  if (!customer) notFound();

  const [invs, activities, history, files, members, credit, creditRows, targets, accountRows] = await Promise.all([
    invoicesForCustomer(db, org.id, id),
    db.select().from(customerActivities).where(eq(customerActivities.customerId, id)).orderBy(desc(customerActivities.createdAt)),
    listActivity(db, org.id, "customer", id, AUDIT_ACTION_LABELS),
    listAttachments(db, org.id, "customer", id),
    listOrgMembers(db, org.id),
    creditSummary(db, org.id, id),
    listCredits(db, org.id, id),
    offsetTargets(db, org.id, id),
    listAccounts(db, org.id),
  ]);
  const creditProfile = await customerCreditProfile(db, org.id, customer);
  const paymentBehaviour = (await paymentBehaviourByCustomer(db, org.id)).get(customer.id) ?? null;
  const accounts = accountRows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, isDefault: a.isDefault }));
  const accountName = (aid: string | null) => accountRows.find((a) => a.id === aid)?.name;
  const salesperson = customer.salespersonId ? members.find((m) => m.id === customer.salespersonId) : null;
  const tags = parseTags(customer.tags);
  const customerDefs = defsFor(org.customFieldDefsJson, "customer");
  const languageLabel = DOCUMENT_LANGUAGES.find((l) => l.id === customer.language)?.label ?? "Ελληνικά";
  const active = invs.filter((i) => i.status !== "draft" && i.status !== "cancelled");
  const billed = round2(active.reduce((s, i) => s + (getDocumentType(i.invoiceType).credit ? -1 : 1) * i.totalGrossValue, 0));
  const outstanding = customerOutstanding(active);
  const openTasks = activities.filter((a) => a.kind === "task" && !a.done).length;

  return (
    <>
      <PageHeader title={customer.name} description={customer.activity || (customer.kind === "individual" ? "Ιδιώτης" : "Επιχείρηση")}>
        <StageBadge stage={customer.stage} className="h-7 px-3" />
        <Button asChild variant="outline">
          <Link href={`/print/customers/${customer.id}/statement`}>
            <BookOpenText data-icon="inline-start" /> Καρτέλα
          </Link>
        </Button>
        {canWrite ? (
          <>
            <Button asChild variant="outline">
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil data-icon="inline-start" /> Επεξεργασία
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/invoices/new?customer=${customer.id}`}>
                <FilePlus data-icon="inline-start" /> Νέο παραστατικό
              </Link>
            </Button>
          </>
        ) : null}
      </PageHeader>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Στοιχεία</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-1 [&>span]:break-words">
                <span className="text-muted-foreground">ΑΦΜ</span>
                <span className="font-mono">{customer.afm || "—"}</span>
                <span className="text-muted-foreground">ΔΟΥ</span>
                <span>{customer.doy || "—"}</span>
                <span className="text-muted-foreground">Χώρα</span>
                <span>{customer.country}</span>
                <span className="text-muted-foreground">Όροι</span>
                <span>{customer.paymentTermsDays != null ? `${customer.paymentTermsDays} ημέρες` : `${org.defaultPaymentTermsDays} ημέρες (προεπιλογή)`}</span>
                <span className="text-muted-foreground">Γλώσσα</span>
                <span>{languageLabel}</span>
                {salesperson ? (
                  <>
                    <span className="text-muted-foreground">Πωλητής</span>
                    <span>{salesperson.name || salesperson.email}</span>
                  </>
                ) : null}
              </div>
              {tags.length ? <TagList tags={tags} max={20} className="border-t pt-3" /> : null}
              {customerDefs.length ? <CustomFieldList defs={customerDefs} values={parseCustomFieldValues(customer.customFieldsJson)} className="border-t pt-3" /> : null}
              <div className="space-y-2 border-t pt-3">
                {customer.address || customer.city ? (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 text-muted-foreground" />
                    <span>{[customer.address, customer.postalCode, customer.city].filter(Boolean).join(", ")}</span>
                  </div>
                ) : null}
                {customer.contactPerson ? (
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span>{customer.contactPerson}</span>
                  </div>
                ) : null}
                {customer.email ? (
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <a href={`mailto:${customer.email}`} className="hover:underline">
                      {customer.email}
                    </a>
                  </div>
                ) : null}
                {customer.phone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    <a href={`tel:${customer.phone}`} className="hover:underline">
                      {customer.phone}
                    </a>
                  </div>
                ) : null}
              </div>
              {customer.notes ? <p className="border-t pt-3 text-muted-foreground whitespace-pre-wrap">{customer.notes}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Οικονομική εικόνα</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Τζίρος</div>
                <div className="text-lg font-semibold tabular-nums">{formatMoney(billed)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Υπόλοιπο</div>
                <div className={cn("text-lg font-semibold tabular-nums", outstanding > 0 ? "text-amber-700" : outstanding < 0 ? "text-emerald-700" : "")}>{formatMoney(outstanding)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Πιστωτικό υπόλοιπο</div>
                <div className={cn("text-lg font-semibold tabular-nums", credit.available > 0 ? "text-emerald-700" : "")}>{formatMoney(credit.available)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Εργασίες</div>
                <div className="text-lg font-semibold tabular-nums">{openTasks}</div>
              </div>
            </CardContent>
          </Card>

          <CreditProfileCard profile={creditProfile} behaviour={paymentBehaviour} />

          <Card>
            <CardHeader>
              <CardTitle>Προκαταβολές & πιστωτικά</CardTitle>
              <CardDescription>
                {credit.available > 0 ? `Διαθέσιμο ${formatMoney(credit.available)} για συμψηφισμό` : "Δεν υπάρχει διαθέσιμο πιστωτικό υπόλοιπο"}
                {credit.creditNotes.length ? ` · ${credit.creditNotes.length} ανοιχτά πιστωτικά τιμολόγια` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <CreditMoneyDialog customerId={customer.id} mode="advance" accounts={accounts} />
                  <ApplyCreditDialog customerId={customer.id} available={credit.available} ledgerBalance={credit.ledgerBalance} creditNotes={credit.creditNotes} targets={targets} />
                  <CreditMoneyDialog customerId={customer.id} mode="refund" accounts={accounts} maxRefund={credit.ledgerBalance} />
                  <ManualCreditDialog customerId={customer.id} ledgerBalance={credit.ledgerBalance} />
                </div>
              ) : null}
              {credit.creditNotes.length ? (
                <ul className="divide-y rounded-md border">
                  {credit.creditNotes.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span>
                        <Link href={`/invoices/${c.id}`} className="font-medium hover:underline">
                          Πιστωτικό {c.label}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{formatDate(c.issueDate)}</span>
                      </span>
                      <span className="font-mono tabular-nums text-emerald-700">{formatMoney(c.remaining)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {creditRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Καμία προκαταβολή ή πίστωση. Οι προκαταβολές πιστώνονται στον πελάτη και συμψηφίζονται με μελλοντικά παραστατικά.</p>
              ) : (
                <ul className="divide-y">
                  {creditRows.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{CREDIT_KIND_LABELS[r.kind as CreditKind] ?? r.kind}</span>
                          {r.kind === "applied" ? <Badge variant="outline">{r.reference}</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDate(r.movedAt)}
                          {r.method ? ` · ${PAYMENT_METHODS.find((m) => m.code === r.method)?.label ?? ""}` : ""}
                          {accountName(r.accountId) ? ` · ${accountName(r.accountId)}` : ""}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className={cn("font-mono tabular-nums", r.amount > 0 ? "text-emerald-700" : "text-destructive")}>{formatMoney(r.amount)}</span>
                        {canWrite && r.kind !== "applied" ? <DeleteCreditButton id={r.id} /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {creditRows.length ? (
                <p className="border-t pt-2 text-xs text-muted-foreground">
                  Υπόλοιπο προκαταβολών {formatMoney(credit.ledgerBalance)}
                  {credit.creditNotesTotal ? ` + πιστωτικά ${formatMoney(credit.creditNotesTotal)}` : ""}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <PortalCard
            customerId={customer.id}
            email={customer.email ?? ""}
            initialUrl={customer.portalToken ? portalUrl(customer.portalToken) : null}
            lastSeenAt={customer.portalLastSeenAt}
            canWrite={canWrite}
          />

          {canWrite ? <DeleteCustomerButton id={customer.id} disabled={invs.length > 0} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Παραστατικά</CardTitle>
              <CardDescription>{invs.length} παραστατικά για αυτόν τον πελάτη.</CardDescription>
            </CardHeader>
            <CardContent>
              {invs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Δεν έχουν εκδοθεί παραστατικά.</p>
              ) : (
                <div className="w-full max-w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Αριθμός</TableHead>
                      <TableHead>Ημ/νία</TableHead>
                      <TableHead className="text-right">Σύνολο</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Υπόλοιπο</TableHead>
                      <TableHead>Κατάσταση</TableHead>
                      <TableHead className="hidden md:table-cell">myDATA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invs.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                            {invoiceDisplayNumber(inv)}
                          </Link>
                          <div className="text-xs text-muted-foreground">{getDocumentType(inv.invoiceType).short}</div>
                        </TableCell>
                        <TableCell>{formatDate(inv.issueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(inv.totalGrossValue, inv.currency)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {inv.status === "draft" || inv.status === "cancelled" ? "—" : formatMoney(inv.totalGrossValue - inv.paidAmount, inv.currency)}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {inv.status === "draft" ? "—" : <MyDataStatusBadge status={inv.mydataStatus} mark={inv.mydataMark} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ιστορικό επικοινωνίας & εργασίες</CardTitle>
              <CardDescription>Τηλεφωνήματα, συναντήσεις, σημειώσεις και εργασίες επικοινωνίας.</CardDescription>
            </CardHeader>
            <CardContent>
              {orgHasFeature(org, "crm") ? (
                <ActivityPanel customerId={customer.id} activities={activities} readOnly={!canWrite} />
              ) : (
                <UpgradeNotice capability="crm" description="Καταγράψτε τηλεφωνήματα, συναντήσεις και εργασίες ανά πελάτη, με υπενθυμίσεις στην Επισκόπηση και στάδια pipeline." />
              )}
            </CardContent>
          </Card>

          <CollabPanel
            entityType="customer"
            entityId={customer.id}
            activity={history}
            attachments={files}
            canWrite={canWrite}
            currentUserId={user.id}
            isAdmin={role === "owner" || role === "admin"}
          />
        </div>
      </div>
    </>
  );
}
