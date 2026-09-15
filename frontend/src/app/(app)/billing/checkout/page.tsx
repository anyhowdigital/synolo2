import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { getPlan } from "@/lib/billing/plans";
import { stripeEnabled } from "@/lib/billing/stripe";
import { formatMoney } from "@/lib/invoice/totals";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MockCheckoutForm } from "@/components/billing/mock-checkout-form";

export const metadata = { title: "Ολοκλήρωση συνδρομής" };

export default async function CheckoutPage({ searchParams }: PageProps<"/billing/checkout">) {
  const sp = await searchParams;
  const plan = getPlan(typeof sp.plan === "string" ? sp.plan : "");
  const interval = sp.interval === "yearly" ? "yearly" : "monthly";
  if (!plan || stripeEnabled()) redirect("/billing");
  const db = await getDb();
  const ctx = await requireContext(db);
  if (!can(ctx.role, "manageBilling")) redirect("/billing");

  const price = interval === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
  const vat = price * 0.24;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ολοκλήρωση συνδρομής" description={`Πακέτο ${plan.name} · ${interval === "yearly" ? "ετήσια" : "μηνιαία"} χρέωση`} />
      <Alert className="mb-6">
        <ShieldCheck />
        <AlertTitle>Λειτουργία επίδειξης πληρωμής</AlertTitle>
        <AlertDescription>
          Δεν έχει ρυθμιστεί Stripe (STRIPE_SECRET_KEY). Η φόρμα προσομοιώνει την πληρωμή ώστε να δοκιμάσετε τη ροή ενεργοποίησης, ορίων και ακύρωσης. Σε παραγωγή, ο χρήστης μεταφέρεται στο ασφαλές Stripe Checkout και η ενεργοποίηση γίνεται μέσω webhook.
        </AlertDescription>
      </Alert>
      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Σύνοψη</CardTitle>
            <CardDescription>{plan.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span>{plan.name} ({interval === "yearly" ? "έτος" : "μήνας"})</span>
              <span className="tabular-nums">{formatMoney(price)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>ΦΠΑ 24%</span>
              <span className="tabular-nums">{formatMoney(vat)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
              <span>Σύνολο</span>
              <span className="tabular-nums">{formatMoney(price + vat)}</span>
            </div>
            <ul className="mt-4 grid gap-1 text-xs text-muted-foreground">
              {plan.features.slice(0, 4).map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Στοιχεία κάρτας</CardTitle>
            <CardDescription>Χρέωση στην επιχείρηση {ctx.org.name} · {ctx.org.billingEmail || ctx.user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <MockCheckoutForm plan={plan.id} interval={interval} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
