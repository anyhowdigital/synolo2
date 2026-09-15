import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { getInvoiceByPublicToken, invoiceDisplayNumber } from "@/lib/services/invoices";
import { getDocumentType } from "@/lib/greek/document-types";
import { formatMoney } from "@/lib/invoice/totals";
import { stripeEnabled } from "@/lib/billing/stripe";
import { onlinePaymentAvailable, remainingAmount } from "@/lib/payments/online";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DemoPayForm } from "@/components/public/demo-pay-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Πληρωμή παραστατικού", robots: { index: false, follow: false } };

export default async function DemoPayPage({ params }: PageProps<"/p/[token]/pay">) {
  const { token } = await params;
  const db = await getDb();
  const invoice = await getInvoiceByPublicToken(db, token);
  if (!invoice || invoice.status === "draft") notFound();
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, invoice.orgId) });
  if (!org) notFound();
  if (stripeEnabled() || !onlinePaymentAvailable(org, invoice)) redirect(`/p/${token}`);

  const amount = remainingAmount(invoice);
  const label = formatMoney(amount, invoice.currency);

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Alert className="mb-6 bg-white">
          <ShieldCheck />
          <AlertTitle>Λειτουργία επίδειξης πληρωμής</AlertTitle>
          <AlertDescription>
            Η πλατφόρμα δεν έχει ρυθμισμένο Stripe (STRIPE_SECRET_KEY). Η φόρμα προσομοιώνει την πληρωμή με κάρτα: με την υποβολή καταχωρείται είσπραξη POS / e-POS και το παραστατικό εξοφλείται. Σε παραγωγή, ο πελάτης
            μεταφέρεται στο ασφαλές Stripe Checkout.
          </AlertDescription>
        </Alert>
        <div className="grid gap-6 md:grid-cols-5">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>{org.name}</CardTitle>
              <CardDescription>
                {getDocumentType(invoice.invoiceType).name} {invoiceDisplayNumber(invoice)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span>Σύνολο παραστατικού</span>
                <span className="tabular-nums">{formatMoney(invoice.totalGrossValue, invoice.currency)}</span>
              </div>
              {invoice.paidAmount > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Ήδη εισπραχθέντα</span>
                  <span className="tabular-nums">−{formatMoney(invoice.paidAmount, invoice.currency)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                <span>Πληρωτέο</span>
                <span className="tabular-nums">{label}</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Πληρωτής: {invoice.customerName}</p>
            </CardContent>
          </Card>
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Στοιχεία κάρτας</CardTitle>
              <CardDescription>Ασφαλής πληρωμή (προσομοίωση).</CardDescription>
            </CardHeader>
            <CardContent>
              <DemoPayForm token={token} amountLabel={label} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
