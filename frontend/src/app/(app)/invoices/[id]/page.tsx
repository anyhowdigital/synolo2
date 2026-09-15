import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { customers, invoices, series } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { getInvoiceWithLines, invoiceDisplayNumber, listPaymentsForInvoice } from "@/lib/services/invoices";
import { formatDate, formatMoney, round2 } from "@/lib/invoice/totals";
import { getDocumentType, MOVE_PURPOSES, PAYMENT_METHODS } from "@/lib/greek/document-types";
import { mydataEnvironmentLabel } from "@/lib/mydata/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceStatusBadge, MyDataStatusBadge } from "@/components/status-badge";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { InvoiceDocumentViewer } from "@/components/invoices/invoice-document-viewer";
import { PaymentForecastNote } from "@/components/invoices/payment-forecast-note";
import { paymentBehaviourByCustomer, predictPayment } from "@/lib/services/payment-prediction";
import { documentPresentation } from "@/lib/services/document-theme";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ActivityPanel } from "@/components/collab/activity-panel";
import { listActivity, listAttachments } from "@/lib/services/collab";
import { AUDIT_ACTION_LABELS } from "@/lib/services/audit";
import { TagList } from "@/components/tags/tag-input";
import { CustomFieldList } from "@/components/custom-fields/custom-field-inputs";
import { defsFor, parseCustomFieldValues, parseTags } from "@/lib/services/custom-fields";
import { listOrgMembers } from "@/lib/services/dimensions";
import { listDocumentViews } from "@/lib/services/document-views";
import { listAccounts } from "@/lib/services/banking";
import { creditSummary } from "@/lib/services/credits";
import { ApplyCreditDialog } from "@/components/customers/credit-ui";
import { Scale } from "lucide-react";
import { DocumentViewsCard } from "@/components/invoices/document-views-card";
import { B2GCard } from "@/components/invoices/b2g-card";
import { validateB2G } from "@/lib/services/b2g";
import { lateCharges } from "@/lib/services/credit-profile";
import { LateChargesButton } from "@/components/invoices/late-charges-button";
import { getProvider } from "@/lib/b2g/providers";
import { QuoteAcceptanceRecord } from "@/components/invoices/quote-acceptance";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const { org, role, user } = await requireContext(db);
  const invoice = await getInvoiceWithLines(db, org.id, id);
  if (!invoice) notFound();

  const [paymentRows, correlated, sourceQuote, customer, seriesList, activity, files, members, views, accounts] = await Promise.all([
    listPaymentsForInvoice(db, id),
    invoice.correlatedInvoiceId ? db.query.invoices.findFirst({ where: eq(invoices.id, invoice.correlatedInvoiceId) }) : Promise.resolve(null),
    invoice.sourceQuoteId ? db.query.invoices.findFirst({ where: eq(invoices.id, invoice.sourceQuoteId) }) : Promise.resolve(null),
    invoice.customerId ? db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId) }) : Promise.resolve(null),
    db.select().from(series).where(eq(series.orgId, org.id)),
    listActivity(db, org.id, "invoice", id, AUDIT_ACTION_LABELS),
    listAttachments(db, org.id, "invoice", id),
    listOrgMembers(db, org.id),
    listDocumentViews(db, org.id, id),
    listAccounts(db, org.id),
  ]);
  const invoiceTags = parseTags(invoice.tags);
  const invoiceDefs = defsFor(org.customFieldDefsJson, "invoice");
  const salesperson = invoice.salespersonId ? members.find((m) => m.id === invoice.salespersonId) : null;
  const hasDimensions = invoiceTags.length > 0 || !!salesperson || !!invoice.channel || invoiceDefs.length > 0;
  const qrDataUrl = invoice.mydataQrUrl ? await QRCode.toDataURL(invoice.mydataQrUrl, { margin: 0, width: 192 }) : null;
  const presentation = await documentPresentation(db, org, invoice);
  const dt = getDocumentType(invoice.invoiceType);
  const isQuote = dt.kind === "quote";
  const remaining = round2(invoice.totalGrossValue - invoice.paidAmount);
  const charges = lateCharges(org, invoice);
  const paymentPrediction =
    dt.kind === "invoice" && !dt.credit && !dt.expenseSide && remaining > 0.005 && (invoice.status === "issued" || invoice.status === "partially_paid" || invoice.status === "overdue")
      ? predictPayment(org, invoice, invoice.customerId ? (await paymentBehaviourByCustomer(db, org.id)).get(invoice.customerId) : undefined)
      : null;
  const canOffset = dt.kind === "invoice" && !dt.credit && !dt.expenseSide && (invoice.status === "issued" || invoice.status === "partially_paid") && remaining > 0.005 && !!invoice.customerId;
  const credit = canOffset && invoice.customerId ? await creditSummary(db, org.id, invoice.customerId) : null;
  const creditNoteLabel = (id: string | null) => (id ? (credit?.creditNotes.find((c) => c.id === id)?.label ?? correlatedLabels.get(id) ?? "πιστωτικό") : "πιστωτικό");
  const offsetRefIds = paymentRows.filter((p) => p.offsetSource === "credit_note" || p.offsetSource === "applied_to").map((p) => p.offsetRefId!).filter(Boolean);
  const offsetDocs = offsetRefIds.length ? await db.select({ id: invoices.id, seriesCode: invoices.seriesCode, number: invoices.number, status: invoices.status }).from(invoices).where(inArray(invoices.id, offsetRefIds)) : [];
  const correlatedLabels = new Map(offsetDocs.map((d) => [d.id, invoiceDisplayNumber(d)]));

  const showB2G = dt.kind === "invoice" && ((org.b2gEnabled && customer?.publicEntity) || invoice.b2gStatus !== "not_sent");
  const b2gCard = showB2G ? (
    <B2GCard
      invoiceId={invoice.id}
      confirmationContext={{ companyName: org.name, documentLabel: invoiceDisplayNumber(invoice), customerName: invoice.customerName, total: formatMoney(invoice.totalGrossValue, invoice.currency) }}
      environment={org.b2gEnvironment}
      customerId={invoice.customerId}
      status={invoice.b2gStatus}
      providerLabel={getProvider(invoice.b2gProvider || org.b2gProvider).label}
      providerId={invoice.b2gProviderId}
      rawStatus={invoice.b2gRawStatus}
      error={invoice.b2gError}
      sentAt={invoice.b2gSentAt}
      statusAt={invoice.b2gStatusAt}
      validationErrors={validateB2G(org, invoice, invoice.lines, customer ?? null)}
      refs={{ b2gBuyerReference: invoice.b2gBuyerReference, b2gContractAdam: invoice.b2gContractAdam, b2gProjectReference: invoice.b2gProjectReference, b2gOrderReference: invoice.b2gOrderReference, b2gCpv: invoice.b2gCpv, b2gSoftReject: invoice.b2gSoftReject }}
      canWrite={can(role, "write")}
    />
  ) : null;

  return (
    <>
      <PageHeader title={`${dt.short} ${invoiceDisplayNumber(invoice)}`} description={`${dt.name} · ${invoice.customerName || "Λιανική"} · ${formatDate(invoice.issueDate)}`}>
        <InvoiceStatusBadge status={invoice.status} className="h-7 px-3" />
        {invoice.status !== "draft" ? <MyDataStatusBadge status={invoice.mydataStatus} mark={invoice.mydataMark} className="h-7 px-3" /> : null}
        {invoice.viewedAt ? (
          <Badge variant="outline" className="h-7 gap-1 px-3 text-emerald-700" title={`Πρώτη προβολή ${new Date(invoice.viewedAt).toLocaleString("el-GR")}`}>
            <Eye className="size-3.5" /> Προβλήθηκε {invoice.viewCount > 1 ? `×${invoice.viewCount}` : ""}
          </Badge>
        ) : null}
      </PageHeader>

      <div className="mb-6">
        <InvoiceActions
          invoice={invoice}
          companyName={org.name}
          autoTransmit={org.autoTransmit}
          autoB2G={org.b2gEnabled && org.b2gAutoSend && !!customer?.publicEntity}
          mydataEnv={org.mydataEnvironment}
          canWrite={can(role, "write")}
          customerEmail={customer?.email}
          seriesList={seriesList}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, isDefault: a.isDefault }))}
        />
      </div>

      {sourceQuote ? (
        <Alert className="mb-6">
          <AlertTitle>Προέλευση από προσφορά</AlertTitle>
          <AlertDescription>
            Δημιουργήθηκε από την προσφορά{" "}
            <Link href={`/invoices/${sourceQuote.id}`} className="underline">
              {invoiceDisplayNumber(sourceQuote)}
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {credit && credit.available > 0.005 && can(role, "write") ? (
        <Alert className="mb-6 border-emerald-300">
          <Scale className="size-4" />
          <AlertTitle>Ο πελάτης έχει διαθέσιμο πιστωτικό υπόλοιπο {formatMoney(credit.available)}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {credit.creditNotes.length ? `${credit.creditNotes.length} ανοιχτά πιστωτικά τιμολόγια (${formatMoney(credit.creditNotesTotal)})` : ""}
              {credit.creditNotes.length && credit.ledgerBalance > 0 ? " · " : ""}
              {credit.ledgerBalance > 0 ? `προκαταβολές ${formatMoney(credit.ledgerBalance)}` : ""}. Μπορείτε να εξοφλήσετε έως {formatMoney(Math.min(credit.available, remaining))} με συμψηφισμό, χωρίς κίνηση χρημάτων.
            </span>
            <ApplyCreditDialog
              customerId={invoice.customerId!}
              available={credit.available}
              ledgerBalance={credit.ledgerBalance}
              creditNotes={credit.creditNotes}
              targets={[{ id: invoice.id, label: invoiceDisplayNumber(invoice), issueDate: invoice.issueDate, dueDate: invoice.dueDate, remaining, currency: invoice.currency }]}
              fixedInvoiceId={invoice.id}
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {invoice.mydataStatus === "error" ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Η διαβίβαση στο myDATA απέτυχε</AlertTitle>
          <AlertDescription>{invoice.mydataError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-xl border bg-neutral-100 p-3 md:p-8">
          <InvoiceDocumentViewer>
            <InvoiceDocument org={org} invoice={invoice} lines={invoice.lines} qrDataUrl={qrDataUrl} correlated={correlated ?? null} theme={presentation.theme} terms={presentation.terms} lang={presentation.lang} />
          </InvoiceDocumentViewer>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {isQuote ? (
            <Card>
              <CardHeader>
                <CardTitle>Προσφορά</CardTitle>
                <CardDescription>Οι προσφορές δεν αποτελούν φορολογικά παραστατικά και δεν διαβιβάζονται στο myDATA.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Ισχύει έως: {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</p>
                <p>Ο πελάτης μπορεί να την αποδεχθεί online με ηλεκτρονική υπογραφή μέσω του δημόσιου συνδέσμου (Αποστολή email).</p>
                {invoice.emailedAt ? <p>Στάλθηκε: {new Date(invoice.emailedAt).toLocaleString("el-GR")}</p> : null}
                <QuoteAcceptanceRecord invoice={invoice} showIp className="text-foreground" />
              </CardContent>
            </Card>
          ) : null}
          {dt.kind === "delivery" ? (
            <Card>
              <CardHeader>
                <CardTitle>Στοιχεία διακίνησης</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm [&>dd]:break-words">
                  <dt className="text-muted-foreground">Ημ/νία</dt>
                  <dd>{invoice.dispatchDate ? formatDate(invoice.dispatchDate) : "—"}</dd>
                  <dt className="text-muted-foreground">Σκοπός</dt>
                  <dd>{MOVE_PURPOSES.find((m) => m.code === invoice.movePurpose)?.label ?? "—"}</dd>
                  <dt className="text-muted-foreground">Όχημα</dt>
                  <dd>{invoice.vehicleNumber || "—"}</dd>
                  <dt className="text-muted-foreground">Φόρτωση</dt>
                  <dd>{invoice.loadingAddress || "—"}</dd>
                  <dt className="text-muted-foreground">Παράδοση</dt>
                  <dd>{invoice.deliveryAddress || invoice.customerAddress || "—"}</dd>
                </dl>
              </CardContent>
            </Card>
          ) : null}
          <DocumentViewsCard invoice={invoice} views={views} />
          {hasDimensions ? (
            <Card>
              <CardHeader>
                <CardTitle>Ετικέτες & διαστάσεις</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {invoiceTags.length ? <TagList tags={invoiceTags} max={20} /> : null}
                {salesperson || invoice.channel ? (
                  <dl className="grid grid-cols-[100px_1fr] gap-y-1.5">
                    {salesperson ? (
                      <>
                        <dt className="text-muted-foreground">Πωλητής</dt>
                        <dd>{salesperson.name || salesperson.email}</dd>
                      </>
                    ) : null}
                    {invoice.channel ? (
                      <>
                        <dt className="text-muted-foreground">Κανάλι</dt>
                        <dd>{invoice.channel}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {invoiceDefs.length ? <CustomFieldList defs={invoiceDefs} values={parseCustomFieldValues(invoice.customFieldsJson)} /> : null}
              </CardContent>
            </Card>
          ) : null}
          {b2gCard}
          {charges.total > 0.005 ? (
            <Card data-testid="late-charges-card">
              <CardHeader>
                <CardTitle className="text-base">Καθυστέρηση πληρωμής</CardTitle>
                <CardDescription>Ενημερωτικός υπολογισμός – δεν χρεώνεται αυτόματα στο παραστατικό.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Ημέρες καθυστέρησης</span>
                  <span className="font-medium tabular-nums">{charges.daysLate}</span>
                </div>
                {charges.interest > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Τόκοι υπερημερίας ({org.lateInterestAnnualRate}% ετησίως)</span>
                    <span className="font-medium tabular-nums">{formatMoney(charges.interest, invoice.currency)}</span>
                  </div>
                ) : null}
                {charges.flat > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Πάγια χρέωση καθυστέρησης</span>
                    <span className="font-medium tabular-nums">{formatMoney(charges.flat, invoice.currency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                  <span>Σύνολο επιβαρύνσεων</span>
                  <span className="tabular-nums text-amber-700">{formatMoney(charges.total, invoice.currency)}</span>
                </div>
                {can(role, "write") ? <LateChargesButton invoiceId={invoice.id} /> : null}
              </CardContent>
            </Card>
          ) : null}
          <Card className={isQuote ? "hidden" : ""}>
            <CardHeader>
              <CardTitle>myDATA (ΑΑΔΕ)</CardTitle>
              <CardDescription>{mydataEnvironmentLabel(org.mydataEnvironment)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {invoice.mydataMark ? (
                <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
                  <dt className="text-muted-foreground">MARK</dt>
                  <dd className="font-mono break-all">{invoice.mydataMark}</dd>
                  <dt className="text-muted-foreground">UID</dt>
                  <dd className="font-mono text-xs break-all">{invoice.mydataUid}</dd>
                  <dt className="text-muted-foreground">Auth Code</dt>
                  <dd className="font-mono text-xs break-all">{invoice.mydataAuthCode}</dd>
                  <dt className="text-muted-foreground">Διαβίβαση</dt>
                  <dd>{invoice.mydataSentAt ? new Date(invoice.mydataSentAt).toLocaleString("el-GR") : "—"}</dd>
                  {invoice.mydataCancellationMark ? (
                    <>
                      <dt className="text-muted-foreground">Ακύρωση MARK</dt>
                      <dd className="font-mono break-all">{invoice.mydataCancellationMark}</dd>
                    </>
                  ) : null}
                  {invoice.mydataQrUrl ? (
                    <>
                      <dt className="text-muted-foreground">QR URL</dt>
                      <dd className="min-w-0 truncate text-xs">
                        <a href={invoice.mydataQrUrl} target="_blank" rel="noreferrer" className="underline">
                          {invoice.mydataQrUrl}
                        </a>
                      </dd>
                    </>
                  ) : null}
                </dl>
              ) : invoice.status === "draft" ? (
                <p className="text-muted-foreground">Εκδώστε το παραστατικό για να το διαβιβάσετε.</p>
              ) : (
                <p className="text-muted-foreground">Δεν έχει διαβιβαστεί. Πατήστε «Διαβίβαση στο myDATA».</p>
              )}
              {invoice.mydataRequestXml ? (
                <Tabs defaultValue="request" className="pt-2">
                  <TabsList className="w-full">
                    <TabsTrigger value="request" className="flex-1">
                      Αίτημα XML
                    </TabsTrigger>
                    <TabsTrigger value="response" className="flex-1">
                      Απάντηση
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="request" className="min-w-0">
                    <pre className="max-h-64 max-w-full overflow-auto rounded-md bg-muted p-2 font-mono text-[10px] leading-tight break-all whitespace-pre-wrap">{invoice.mydataRequestXml}</pre>
                  </TabsContent>
                  <TabsContent value="response" className="min-w-0">
                    <pre className="max-h-64 max-w-full overflow-auto rounded-md bg-muted p-2 font-mono text-[10px] leading-tight break-all whitespace-pre-wrap">{invoice.mydataResponseXml || "—"}</pre>
                  </TabsContent>
                </Tabs>
              ) : null}
            </CardContent>
          </Card>

          <Card className={dt.kind === "invoice" ? "" : "hidden"}>
            <CardHeader>
              <CardTitle>Εισπράξεις</CardTitle>
              <CardDescription>
                Εισπραχθέν {formatMoney(invoice.paidAmount, invoice.currency)} από {formatMoney(invoice.totalGrossValue, invoice.currency)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {paymentPrediction ? <PaymentForecastNote prediction={paymentPrediction} dueDate={invoice.dueDate} /> : null}
              {paymentRows.length === 0 ? (
                <p className="text-muted-foreground">Καμία είσπραξη.</p>
              ) : (
                paymentRows.map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                    <div>
                      <div>{formatDate(p.paidAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.offsetSource ? (
                          <span className="text-emerald-700">
                            Συμψηφισμός{" "}
                            {p.offsetSource === "advance" ? (
                              "με προκαταβολή"
                            ) : (
                              <>
                                με{" "}
                                <Link href={`/invoices/${p.offsetRefId}`} className="underline">
                                  {creditNoteLabel(p.offsetRefId)}
                                </Link>
                              </>
                            )}
                          </span>
                        ) : (
                          PAYMENT_METHODS.find((m) => m.code === p.method)?.label
                        )}
                        {!p.offsetSource && p.reference ? ` · ${p.reference}` : ""}
                        {p.accountId && accounts.some((a) => a.id === p.accountId) ? (
                          <>
                            {" · "}
                            <Link href={`/banking/${p.accountId}`} className="hover:underline">
                              {accounts.find((a) => a.id === p.accountId)?.name}
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="font-medium tabular-nums">{formatMoney(p.amount, invoice.currency)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className={isQuote ? "hidden" : ""}>
            <CardHeader>
              <CardTitle>Χαρακτηρισμοί εσόδων</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {invoice.lines.map((l) => (
                <div key={l.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">
                    {l.lineNumber}. {l.classificationType} · {l.classificationCategory}
                  </span>
                  <span className="tabular-nums">{formatMoney(l.netValue, invoice.currency)}</span>
                </div>
              ))}
              {invoice.customerId ? (
                <Link href={`/customers/${invoice.customerId}`} className="mt-2 block text-sm underline">
                  Καρτέλα πελάτη
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <ActivityPanel
        className="mt-6"
        entityType="invoice"
        entityId={invoice.id}
        activity={activity}
        attachments={files}
        canWrite={can(role, "write")}
        currentUserId={user.id}
        isAdmin={role === "owner" || role === "admin"}
      />
    </>
  );
}
