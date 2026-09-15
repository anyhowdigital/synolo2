import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Building2, CreditCard, Download, FileText, Landmark, Receipt } from "lucide-react";
import { getDb } from "@/db";
import { getPortalCustomer, loadPortalData, touchPortalSeen, type PortalDocument } from "@/lib/services/portal";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { PAYMENT_METHODS } from "@/lib/greek/document-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalSaveCard } from "@/components/portal/portal-save-card";
import { PortalBulkPay } from "@/components/portal/portal-bulk-pay";
import { settleBulkSessionById } from "@/lib/payments/bulk";
import { onlinePaymentAvailable } from "@/lib/payments/online";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceStatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const found = await getPortalCustomer(db, token);
  return { title: found ? `Σελίδα πελάτη – ${found.org.name}` : "Δεν βρέθηκε", robots: { index: false, follow: false } };
}

function DocumentsTable({ docs, emptyText }: { docs: PortalDocument[]; emptyText: string }) {
  if (docs.length === 0) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="w-full overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Παραστατικό</TableHead>
          <TableHead className="hidden sm:table-cell">Ημερομηνία</TableHead>
          <TableHead className="hidden md:table-cell">Προθεσμία</TableHead>
          <TableHead className="text-right">Σύνολο</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Υπόλοιπο</TableHead>
          <TableHead>Κατάσταση</TableHead>
          <TableHead className="text-right">Ενέργειες</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {docs.map((d) => {
          const inv = d.invoice;
          return (
            <TableRow key={inv.id}>
              <TableCell>
                <Link href={`/p/${d.publicToken}?src=portal`} className="font-medium hover:underline">
                  {invoiceDisplayNumber(inv)}
                </Link>
                <div className="text-xs text-muted-foreground">{d.typeName}</div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{formatDate(inv.issueDate)}</TableCell>
              <TableCell className={`hidden md:table-cell ${d.overdue ? "font-medium text-red-600" : ""}`}>{inv.dueDate ? formatDate(inv.dueDate) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {d.credit ? "-" : ""}
                {formatMoney(inv.totalGrossValue, inv.currency)}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{d.kind === "invoice" && !d.credit ? formatMoney(d.remaining, inv.currency) : "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <InvoiceStatusBadge status={inv.status} />
                  {d.overdue ? <Badge variant="destructive">Ληξιπρόθεσμο</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="ghost" title="Προβολή">
                    <Link href={`/p/${d.publicToken}?src=portal`}>
                      <ArrowUpRight />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" title="Λήψη PDF">
                    <a href={`/p/${d.publicToken}/pdf`}>
                      <Download />
                    </a>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}

export default async function PortalPage({ params, searchParams }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const found = await getPortalCustomer(db, token);
  if (!found) notFound();
  const { customer, org } = found;
  const sessionId = typeof sp?.session_id === "string" ? sp.session_id : "";
  if (sessionId) await settleBulkSessionById(db, sessionId).catch(() => 0);
  const [data] = await Promise.all([loadPortalData(db, customer), touchPortalSeen(db, customer.id)]);
  const { documents, payments, totals } = data;

  const open = documents.filter((d) => d.kind === "invoice" && d.remaining > 0);
  const invoicesAll = documents.filter((d) => d.kind === "invoice");
  const quotes = documents.filter((d) => d.kind === "quote");
  const deliveries = documents.filter((d) => d.kind === "delivery");

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-white">
              <Building2 className="size-5" />
            </span>
            <div>
              <div className="text-xs font-medium tracking-wide text-muted-foreground">Σελίδα πελάτη</div>
              <div className="font-semibold">{org.name}</div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{customer.name}</div>
            <div className="text-muted-foreground">{customer.afm ? `ΑΦΜ ${customer.afm}` : customer.email}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <PortalBulkPay
          token={token}
          rows={open
            .filter((d) => onlinePaymentAvailable(org, d.invoice))
            .map((d) => ({ id: d.invoice.id, label: `${invoiceDisplayNumber(d.invoice)} · ${d.invoice.dueDate ? `λήξη ${formatDate(d.invoice.dueDate)}` : d.typeName}`, remaining: d.remaining, overdue: d.overdue, currency: d.invoice.currency }))}
          hasCard={!!customer.stripePaymentMethodId}
          cardLabel={customer.stripePaymentMethodId ? `${customer.cardBrand} •••• ${customer.cardLast4}` : ""}
        />
        <PortalSaveCard token={token} brand={customer.cardBrand} last4={customer.cardLast4} hasCard={!!customer.stripePaymentMethodId} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Υπόλοιπο προς πληρωμή</CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${totals.outstanding > 0 ? "text-amber-700" : "text-emerald-700"}`}>{formatMoney(totals.outstanding)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {open.length ? `${open.length} ανεξόφλητα παραστατικά` : "Όλα τα παραστατικά είναι εξοφλημένα"}
              {totals.credit > 0.005 ? <span className="block text-emerald-700">Διαθέσιμο πιστωτικό υπόλοιπο {formatMoney(totals.credit)}</span> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Ληξιπρόθεσμα</CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${totals.overdue > 0 ? "text-red-600" : ""}`}>{formatMoney(totals.overdue)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{totals.overdue > 0 ? "Παρακαλούμε εξοφλήστε το συντομότερο" : "Καμία ληξιπρόθεσμη οφειλή"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Πληρωμές</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{formatMoney(totals.paid)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{payments.length} καταχωρημένες εισπράξεις</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Σύνολο τιμολογήσεων</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{formatMoney(totals.billed)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{invoicesAll.length} παραστατικά{totals.openQuotes ? ` · ${totals.openQuotes} προσφορές σε αναμονή` : ""}</CardContent>
          </Card>
        </div>

        {totals.overdue > 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              Υπάρχουν ληξιπρόθεσμες οφειλές ύψους <strong>{formatMoney(totals.overdue)}</strong>. Ανοίξτε το παραστατικό για να δείτε τα στοιχεία πληρωμής
              {org.iban ? " ή εξοφλήστε με κατάθεση" : ""}.
            </div>
          </div>
        ) : null}

        {org.iban ? (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Landmark className="size-4 text-muted-foreground" /> Τραπεζική κατάθεση
              </div>
              <div className="text-muted-foreground">
                {org.bankName ? `${org.bankName} · ` : ""}IBAN <span className="font-mono text-foreground">{org.iban}</span> · Δικαιούχος {org.name}
              </div>
              <div className="text-xs text-muted-foreground">Αναγράφετε στην αιτιολογία τον αριθμό ή τον κωδικό RF του παραστατικού.</div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" /> Παραστατικά
            </CardTitle>
            <CardDescription>Όλα τα παραστατικά που έχουν εκδοθεί στο όνομά σας. Επιλέξτε ένα για προβολή, εκτύπωση ή ηλεκτρονική πληρωμή.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue={open.length ? "open" : "all"}>
              <TabsList className="mx-4 mb-2">
                <TabsTrigger value="open">Ανεξόφλητα ({open.length})</TabsTrigger>
                <TabsTrigger value="all">Όλα ({invoicesAll.length})</TabsTrigger>
                {quotes.length ? <TabsTrigger value="quotes">Προσφορές ({quotes.length})</TabsTrigger> : null}
                {deliveries.length ? <TabsTrigger value="deliveries">Δελτία ({deliveries.length})</TabsTrigger> : null}
              </TabsList>
              <TabsContent value="open">
                <DocumentsTable docs={open} emptyText="Δεν υπάρχουν ανεξόφλητα παραστατικά." />
              </TabsContent>
              <TabsContent value="all">
                <DocumentsTable docs={invoicesAll} emptyText="Δεν έχουν εκδοθεί παραστατικά ακόμη." />
              </TabsContent>
              <TabsContent value="quotes">
                <DocumentsTable docs={quotes} emptyText="Δεν υπάρχουν προσφορές." />
              </TabsContent>
              <TabsContent value="deliveries">
                <DocumentsTable docs={deliveries} emptyText="Δεν υπάρχουν δελτία αποστολής." />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" /> Πληρωμές
            </CardTitle>
            <CardDescription>Εισπράξεις που έχει καταχωρήσει η {org.name} για τα παραστατικά σας.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Δεν έχουν καταχωρηθεί πληρωμές.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ημερομηνία</TableHead>
                    <TableHead>Παραστατικό</TableHead>
                    <TableHead className="hidden sm:table-cell">Τρόπος</TableHead>
                    <TableHead className="hidden md:table-cell">Αναφορά</TableHead>
                    <TableHead className="text-right">Ποσό</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.slice(0, 50).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paidAt.slice(0, 10))}</TableCell>
                      <TableCell>{p.invoiceNumber}</TableCell>
                      <TableCell className="hidden sm:table-cell">{PAYMENT_METHODS.find((m) => m.code === p.method)?.label ?? "—"}</TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">{p.reference || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <Receipt className="size-3" /> Ο σύνδεσμος είναι προσωπικός – μην τον κοινοποιείτε. Εκδίδεται με Σύνολο ERP.
        </p>
      </main>
    </div>
  );
}
