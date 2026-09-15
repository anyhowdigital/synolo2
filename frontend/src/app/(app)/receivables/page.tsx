
import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { receivablesRisk } from "@/lib/services/receivables-risk";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/invoice/totals";

export const metadata = { title: "Κίνδυνος εισπράξεων" };

const LEVEL: Record<string, { label: string; cls: string }> = {
  high: { label: "Υψηλός κίνδυνος", cls: "border-destructive/50 bg-destructive/5" },
  medium: { label: "Μέτριος", cls: "border-amber-300 bg-amber-50/50" },
  low: { label: "Χαμηλός", cls: "" },
};

export default async function ReceivablesPage() {
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const { items, totalAtRisk, thisMonth } = await receivablesRisk(db, org);
  const high = items.filter((i) => i.level === "high");

  return (
    <>
      <PageHeader title="Κίνδυνος εισπράξεων" description="Ποιος θα σε αργήσει και τι να κάνεις γι' αυτό – βάσει ιστορικού πληρωμών, ηλικίας οφειλής και ποσού." />

      <div className="mb-6 grid gap-3 sm:grid-cols-3" data-testid="receivables-summary">
        {[
          ["Ποσό σε κίνδυνο", formatMoney(totalAtRisk), `${items.filter((i) => i.level !== "low").length} παραστατικά`],
          ["Αναμένεται αυτόν τον μήνα", formatMoney(thisMonth), "βάσει προβλεπόμενης ημερομηνίας"],
          ["Υψηλός κίνδυνος", String(high.length), "χρειάζονται ενέργεια σήμερα"],
        ].map(([k, v, sub]) => (
          <Card key={k}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="font-heading text-xl font-medium">{v}</div>
              <div className="text-xs text-muted-foreground">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState title="Καμία ανοιχτή απαίτηση" description="Όλα τα τιμολόγια είναι εξοφλημένα – τίποτα σε κίνδυνο." />
      ) : (
        <div className="grid gap-3" data-testid="receivables-list">
          {items.map((r) => (
            <div key={r.invoiceId} className={`min-w-0 rounded-xl border p-4 ${LEVEL[r.level].cls}`} data-testid={`receivable-${r.invoiceId}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/invoices/${r.invoiceId}`} className="font-medium hover:underline">
                      {r.label} · {r.customerName}
                    </Link>
                    <Badge variant={r.level === "high" ? "destructive" : r.level === "medium" ? "outline" : "secondary"} className="text-xs">
                      {LEVEL[r.level].label} · {r.riskScore}/100
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm break-words text-muted-foreground">{r.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Λήξη {r.dueDate ? formatDate(r.dueDate) : "—"} · αναμένεται {formatDate(r.expectedDate)}
                    {r.daysLate > 0 ? ` · ${r.daysLate} ημέρες καθυστέρηση` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-heading text-lg font-medium tabular-nums">{formatMoney(r.amount)}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">Προτεινόμενη ενέργεια: {r.action.title}</div>
                  <p className="text-xs break-words text-muted-foreground">{r.action.detail}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0" data-testid={`receivable-action-${r.invoiceId}`}>
                  <Link href={r.action.href}>Εκτέλεση</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Το σκορ συνδυάζει το ιστορικό συνέπειας του πελάτη, τις ημέρες καθυστέρησης και το ύψος της οφειλής. Για μαζικές υπενθυμίσεις με AI και έγκριση, δες τον{" "}
        <Link href="/copilot" className="underline">
          Βοηθό AI
        </Link>
        .
      </p>
    </>
  );
}
