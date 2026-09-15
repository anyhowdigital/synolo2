import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { apiKeys, emailOutbox, invitations, memberships, series, users, webhooks } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can, type Role } from "@/lib/auth/session";
import { getPlan } from "@/lib/billing/plans";
import { appUrl } from "@/lib/email/mailer";
import { WEBHOOK_EVENTS, deliveryStats, listDeliveries } from "@/lib/services/webhooks";
import { WebhookDeliveriesCard } from "@/components/settings/webhook-deliveries";
import { PageHeader } from "@/components/page-header";
import { FirmLinkRequests } from "@/components/settings/firm-link-requests";
import { accountantProfiles, firmLinks, firmLinkInvites } from "@/db/schema";
import { AccountantAccessPanel } from "@/components/settings/accountant-access-panel";
import { BooksAccessCard } from "@/components/settings/books-access-card";
import { TabsContent } from "@/components/ui/tabs";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompanyForm, InvoicingPrefsForm, MyDataForm, SeriesCard } from "@/components/settings/settings-forms";
import { UsersPanel } from "@/components/settings/users-panel";
import { ApiDocsCard, ApiKeysCard, WebhooksCard } from "@/components/settings/developer-panel";
import { AuditLogTable } from "@/components/settings/audit-log-table";
import { AccountingMapForm } from "@/components/settings/accounting-form";
import { parseAccountMap } from "@/lib/accounting/accounts";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { orgHasFeature } from "@/lib/billing/limits";
import { listAuditLog } from "@/lib/services/audit";
import Link from "next/link";
import { DatabaseBackup, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomFieldsPanel } from "@/components/settings/custom-fields-panel";
import { parseCustomFieldDefs } from "@/lib/services/custom-fields";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { parsePdfTheme } from "@/lib/pdf/theme";
import { AadeCredentialsForm } from "@/components/settings/aade-credentials-form";
import { MarketplaceTemplates } from "@/components/settings/marketplace-templates";
import { VivaStatusPanel } from "@/components/settings/viva-status-panel";
import { B2GSettingsForm } from "@/components/settings/b2g-settings-form";
import { AccountingBridgeCard } from "@/components/accounting/accounting-bridge-card";
import { parseBridgeConfig, maskBridgeConfig } from "@/lib/accounting-bridge";

export const metadata = { title: "Ρυθμίσεις" };

const TABS = ["company", "accountant", "invoicing", "appearance", "mydata", "aade", "b2g", "series", "fields", "users", "email", "developer", "accounting", "bridge", "export", "audit"] as const;

function firstLink(html: string) {
  return /href="(https?:\/\/[^"]+)"/.exec(html)?.[1] ?? null;
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && (TABS as readonly string[]).includes(sp.tab) ? sp.tab : "company";
  const db = await getDb();
  const ctx = await requireContext(db);
  if (!can(ctx.role, "manageSettings")) redirect("/dashboard");
  const { org, user, role } = ctx;

  const firmRequests = (
    await db
      .select({ id: firmLinks.id, note: firmLinks.note, createdAt: firmLinks.createdAt, email: users.email, firmName: accountantProfiles.firmName, afm: accountantProfiles.afm })
      .from(firmLinks)
      .innerJoin(users, eq(users.id, firmLinks.accountantUserId))
      .leftJoin(accountantProfiles, eq(accountantProfiles.userId, firmLinks.accountantUserId))
      .where(and(eq(firmLinks.orgId, org.id), eq(firmLinks.status, "pending")))
  ).map((r) => ({ id: r.id, note: r.note, createdAt: r.createdAt, email: r.email, firmName: r.firmName ?? r.email, afm: r.afm ?? "" }));

  const accountantLinks = (
    await db
      .select({ id: firmLinks.id, accessLevel: firmLinks.accessLevel, source: firmLinks.source, createdAt: firmLinks.createdAt, email: users.email, firmName: accountantProfiles.firmName })
      .from(firmLinks)
      .innerJoin(users, eq(users.id, firmLinks.accountantUserId))
      .leftJoin(accountantProfiles, eq(accountantProfiles.userId, firmLinks.accountantUserId))
      .where(and(eq(firmLinks.orgId, org.id), eq(firmLinks.status, "active")))
  ).map((r) => ({ id: r.id, firmName: r.firmName || r.email, email: r.email, accessLevel: (r.accessLevel as "full" | "read" | "mydata") ?? "full", source: r.source, since: r.createdAt }));

  const accountantInvites = (
    await db.select().from(firmLinkInvites).where(and(eq(firmLinkInvites.orgId, org.id), eq(firmLinkInvites.status, "pending")))
  ).map((i) => ({ id: i.id, email: i.email, accessLevel: i.accessLevel, createdAt: i.createdAt }));

  const [seriesList, memberRows, inviteRows, keys, hooks, mails] = await Promise.all([
    db.select().from(series).where(eq(series.orgId, org.id)).orderBy(asc(series.code)),
    db
      .select({ membership: memberships, user: users })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, org.id))
      .orderBy(asc(memberships.createdAt)),
    db.select().from(invitations).where(and(eq(invitations.orgId, org.id), isNull(invitations.acceptedAt))).orderBy(desc(invitations.createdAt)),
    db.select().from(apiKeys).where(eq(apiKeys.orgId, org.id)).orderBy(desc(apiKeys.createdAt)),
    db.select().from(webhooks).where(eq(webhooks.orgId, org.id)).orderBy(desc(webhooks.createdAt)),
    db.select().from(emailOutbox).where(eq(emailOutbox.orgId, org.id)).orderBy(desc(emailOutbox.createdAt)).limit(50),
  ]);

  const auditEntity = typeof sp.entity === "string" ? sp.entity : undefined;
  const auditPage = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const auditData = tab === "audit" ? await listAuditLog(db, org.id, { entity: auditEntity, page: auditPage, pageSize: 50 }) : null;
  const [deliveries, whStats] = tab === "developer" ? await Promise.all([listDeliveries(db, org.id, { limit: 50 }), deliveryStats(db, org.id)]) : [[], { pending: 0, failed: 0 }];

  const plan = getPlan(org.plan);
  const userLimit = org.plan === "trial" ? 3 : plan?.userLimit ?? null;
  const smtpConfigured = !!process.env.SMTP_HOST;

  return (
    <>
      <PageHeader title="Ρυθμίσεις" description="Στοιχεία εκδότη, αυτοματισμοί, σειρές, χρήστες, διασύνδεση myDATA και προγραμματιστικά εργαλεία." />
      <FirmLinkRequests requests={firmRequests} />
      <SettingsTabs tab={tab}>
        <TabsContent value="company" className="grid gap-6">
          <CompanyForm org={org} />
        </TabsContent>
        <TabsContent value="accountant" className="grid gap-6">
          <BooksAccessCard enabled={org.booksSelfManage} />
          <AccountantAccessPanel code={org.accountantLinkCode} codeExpires={org.accountantLinkCodeExpires} links={accountantLinks} invites={accountantInvites} />
        </TabsContent>
        <TabsContent value="export" className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DatabaseBackup className="size-4" /> Εξαγωγή δεδομένων
              </CardTitle>
              <CardDescription>
                Πλήρης εξαγωγή όλων των εγγραφών του οργανισμού (πελάτες, είδη, παραστατικά, γραμμές, εισπράξεις, έξοδα, σειρές, ιστορικό) σε ZIP με JSON και CSV. Τα δεδομένα είναι δικά σας και είναι
                διαθέσιμα ανά πάσα στιγμή.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {can(role, "manageSettings") ? (
                <Button asChild variant="outline">
                  <a href="/api/export/all" download>
                    <Download data-icon="inline-start" /> Λήψη πλήρους εξαγωγής (ZIP)
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Η εξαγωγή είναι διαθέσιμη σε διαχειριστές.</p>
              )}
              <p className="text-xs text-muted-foreground">Δεν περιλαμβάνονται κωδικοί, κλειδιά myDATA/API ή στοιχεία Stripe. Η εξαγωγή καταγράφεται στο ιστορικό ενεργειών.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="invoicing" className="grid gap-6">
          <InvoicingPrefsForm org={org} />
          <VivaStatusPanel />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearancePanel initial={parsePdfTheme(org.pdfThemeJson)} />
        </TabsContent>
        <TabsContent value="mydata">
          <MyDataForm org={org} />
        </TabsContent>
        <TabsContent value="aade">
          <AadeCredentialsForm username={org.aadeRgUsername ?? ""} hasPassword={!!org.aadeRgPassword} />
        </TabsContent>
        <TabsContent value="b2g">
          <B2GSettingsForm org={org} />
        </TabsContent>
        <TabsContent value="series" className="grid gap-6">
          <MarketplaceTemplates />
          {!orgHasFeature(org, "branches") ? <UpgradeNotice capability="branches" compact /> : null}
          <SeriesCard seriesList={seriesList} />
        </TabsContent>
        <TabsContent value="fields">
          <CustomFieldsPanel defs={parseCustomFieldDefs(org.customFieldDefsJson)} salesChannels={org.salesChannels} />
        </TabsContent>
        <TabsContent value="users">
          <UsersPanel
            members={memberRows.map((r) => ({
              membershipId: r.membership.id,
              userId: r.user.id,
              name: r.user.name,
              email: r.user.email,
              role: r.membership.role as Role,
              joinedAt: r.membership.createdAt,
            }))}
            invitations={inviteRows.map((i) => ({ id: i.id, email: i.email, role: i.role as Role, expiresAt: i.expiresAt, expired: new Date(i.expiresAt) < new Date() }))}
            currentUserId={user.id}
            currentRole={role}
            userLimit={userLimit}
          />
        </TabsContent>
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Email outbox</CardTitle>
              <CardDescription>
                {smtpConfigured
                  ? "Τα email αποστέλλονται μέσω του ρυθμισμένου SMTP διακομιστή. Εδώ βλέπετε το ιστορικό."
                  : "Δεν έχει ρυθμιστεί SMTP (μεταβλητές SMTP_HOST/SMTP_USER/SMTP_PASS). Τα email καταγράφονται εδώ αντί να αποστέλλονται, ώστε να δοκιμάζετε τις ροές – ανοίξτε ένα για να δείτε τον σύνδεσμο."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mails.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Δεν έχουν σταλεί email ακόμη. Στείλτε ένα παραστατικό ή μια πρόσκληση χρήστη.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ημ/νία</TableHead>
                      <TableHead>Προς</TableHead>
                      <TableHead>Θέμα</TableHead>
                      <TableHead>Κατάσταση</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mails.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{new Date(m.createdAt).toLocaleString("el-GR")}</TableCell>
                        <TableCell className="text-sm">{m.to}</TableCell>
                        <TableCell className="text-sm">
                          <details>
                            <summary className="cursor-pointer">{m.subject}</summary>
                            {firstLink(m.html) ? (
                              <p className="mt-2 text-xs">
                                Σύνδεσμος:{" "}
                                <a href={firstLink(m.html)!} className="break-all text-primary underline" target="_blank" rel="noreferrer">
                                  {firstLink(m.html)}
                                </a>
                              </p>
                            ) : null}
                            <iframe title={m.subject} srcDoc={m.html} className="mt-2 h-72 w-full rounded border bg-white" sandbox="" />
                          </details>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.status === "sent" ? "default" : m.status === "failed" ? "destructive" : "secondary"} title={m.error ?? undefined}>
                            {m.status === "sent" ? "Στάλθηκε" : m.status === "failed" ? "Αποτυχία" : m.status === "logged" ? "Καταγράφηκε (χωρίς SMTP)" : "Σε ουρά"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="developer" className="grid gap-6">
          {!orgHasFeature(org, "api") ? <UpgradeNotice capability="api" description="Δημιουργία API κλειδιών και webhooks για e-shop, ERP και αυτοματισμούς. Τα υπάρχοντα κλειδιά απορρίπτονται με 403 μέχρι την αναβάθμιση." /> : null}
          <ApiKeysCard keys={keys} appUrl={appUrl()} />
          <WebhooksCard hooks={hooks} events={WEBHOOK_EVENTS.map((e) => ({ code: e.code, label: e.label }))} />
          {tab === "developer" ? <WebhookDeliveriesCard deliveries={deliveries} hookUrls={Object.fromEntries(hooks.map((h) => [h.id, h.url]))} stats={whStats} /> : null}
          <ApiDocsCard appUrl={appUrl()} />
        </TabsContent>
        <TabsContent value="accounting" className="grid gap-6">
          {!orgHasFeature(org, "accountingBridge") ? <UpgradeNotice capability="accountingBridge" description="Ημερολόγιο άρθρων ΕΛΠ (χρέωση/πίστωση) από παραστατικά, εισπράξεις και έξοδα, με δικούς σας κωδικούς λογαριασμών, σε Excel/CSV για το λογιστικό πρόγραμμα." /> : null}
          <AccountingMapForm map={parseAccountMap(org.accountingMapJson)} />
        </TabsContent>
        <TabsContent value="bridge" className="grid gap-6">
          <AccountingBridgeCard exportBase="/api/accounting-bridge" config={maskBridgeConfig(parseBridgeConfig(org.accountingBridgeJson))} />
        </TabsContent>
        <TabsContent value="audit">
          {auditData ? (
            <AuditLogTable rows={auditData.rows} total={auditData.total} page={auditData.page} pageSize={auditData.pageSize} entity={auditEntity} />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                <Link href="/settings?tab=audit" className="underline">
                  Φόρτωση ιστορικού ενεργειών
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </SettingsTabs>
    </>
  );
}
