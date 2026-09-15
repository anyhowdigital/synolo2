"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CloudUpload, CreditCard, Landmark, Layers, Landmark as Bank, PackageMinus, Send, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/invoice/totals";

export interface QueueData {
  mydata: number;
  b2gPending: number;
  b2gRejected: number;
  overdueCount: number;
  overdueAmount: number;
  unmatched: number;
  lowStock: number;
  failedCharges: number;
  drafts: number;
}

type Item = { key: string; label: string; detail: string; count: number; href: string; cta: string; icon: typeof Send; tone: "critical" | "warning" | "info" };

export function ActionCenter({ queue }: { queue: QueueData }) {
  const items: Item[] = [
    { key: "mydata", label: "Μη διαβιβασμένα στο myDATA", detail: "Απαιτείται διαβίβαση εντός των προθεσμιών της Α.1138/2020.", count: queue.mydata, href: "/invoices?mydata=pending", cta: "Διαβίβαση", icon: CloudUpload, tone: "critical" },
    { key: "b2gRejected", label: "Απορρίψεις τιμολόγησης Δημοσίου", detail: "Ο φορέας ή ο πάροχος απέρριψε τα παραστατικά.", count: queue.b2gRejected, href: "/invoices?b2g=rejected", cta: "Έλεγχος", icon: AlertTriangle, tone: "critical" },
    { key: "failedCharges", label: "Αποτυχημένες χρεώσεις συνδρομών", detail: "Η κάρτα του πελάτη απορρίφθηκε ή έχει λήξει.", count: queue.failedCharges, href: "/recurring", cta: "Επανάληψη", icon: CreditCard, tone: "critical" },
    { key: "overdue", label: "Ληξιπρόθεσμες οφειλές", detail: `Συνολικό ποσό ${formatMoney(queue.overdueAmount)} προς είσπραξη.`, count: queue.overdueCount, href: "/invoices?status=overdue", cta: "Υπενθύμιση", icon: Wallet, tone: "warning" },
    { key: "b2gPending", label: "Παραστατικά Δημοσίου σε αναμονή", detail: "Εκκρεμεί επιβεβαίωση από τον πάροχο PEPPOL.", count: queue.b2gPending, href: "/invoices?b2g=pending", cta: "Προβολή", icon: Send, tone: "info" },
    { key: "unmatched", label: "Κινήσεις τράπεζας προς συμφωνία", detail: "Αντιστοιχίστε τις κινήσεις με εισπράξεις και πληρωμές.", count: queue.unmatched, href: "/banking", cta: "Συμφωνία", icon: Bank, tone: "warning" },
    { key: "lowStock", label: "Είδη κάτω από το όριο αποθέματος", detail: "Προγραμματίστε παραγγελία στους προμηθευτές.", count: queue.lowStock, href: "/inventory", cta: "Αποθήκη", icon: PackageMinus, tone: "info" },
    { key: "drafts", label: "Πρόχειρα παραστατικά", detail: "Ολοκληρώστε ή διαγράψτε τα πρόχειρα.", count: queue.drafts, href: "/invoices?status=draft", cta: "Προβολή", icon: Layers, tone: "info" },
  ].filter((i) => i.count > 0) as Item[];

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <Card className={cn(items.length > 0 && "border-amber-300 dark:border-amber-900")} data-testid="action-center">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          Κέντρο ενεργειών
          {total > 0 ? <Badge variant="destructive" data-testid="action-center-count">{total}</Badge> : <Badge className="bg-emerald-600">Καθαρό</Badge>}
        </CardTitle>
        <CardDescription>{items.length > 0 ? "Εκκρεμότητες που απαιτούν ενέργεια, κατά προτεραιότητα." : "Δεν υπάρχουν εκκρεμότητες. Όλα τα παραστατικά και οι κινήσεις είναι τακτοποιημένα."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((i) => (
          <div
            key={i.key}
            data-testid={`action-item-${i.key}`}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors",
              i.tone === "critical" && "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30",
              i.tone === "warning" && "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
              i.tone === "info" && "bg-muted/40 hover:bg-muted",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background">
              <i.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                <span className="tabular-nums">{i.count}</span>
                <span className="min-w-0 truncate">{i.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{i.detail}</p>
            </div>
            <Button asChild size="sm" variant={i.tone === "info" ? "ghost" : "default"}>
              <Link href={i.href}>
                {i.cta} <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function VatPositionCard({ outputs, inputs, position, deadlineDate, deadlineDays, periodLabel }: { outputs: number; inputs: number; position: number; deadlineDate: string; deadlineDays: number; periodLabel: string }) {
  const payable = position >= 0;
  return (
    <Card data-testid="vat-position-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Θέση ΦΠΑ τρέχοντος τριμήνου</CardTitle>
        <CardDescription>{periodLabel} · έντυπο Φ2 (ενδεικτικά ποσά)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn("rounded-lg border p-3", payable ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30")}>
          <div className="text-xs text-muted-foreground">{payable ? "Εκτιμώμενο ΦΠΑ για απόδοση" : "Εκτιμώμενο πιστωτικό υπόλοιπο ΦΠΑ"}</div>
          <div className="text-2xl font-semibold tabular-nums" data-testid="vat-position-amount">
            {formatMoney(Math.abs(position))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted p-2">
            <dt className="text-xs text-muted-foreground">ΦΠΑ εκροών</dt>
            <dd className="font-medium tabular-nums">{formatMoney(outputs)}</dd>
          </div>
          <div className="rounded-md bg-muted p-2">
            <dt className="text-xs text-muted-foreground">ΦΠΑ εισροών</dt>
            <dd className="font-medium tabular-nums">{formatMoney(inputs)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Προθεσμία υποβολής: <strong>{deadlineDate.split("-").reverse().join("/")}</strong> — {deadlineDays >= 0 ? `απομένουν ${deadlineDays} ημέρες` : `έχει παρέλθει κατά ${Math.abs(deadlineDays)} ημέρες`}
        </p>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href="/reports">
            Αναλυτική αναφορά ΦΠΑ <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AgingCard({ buckets, total }: { buckets: { label: string; amount: number; count: number }[]; total: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.amount));
  return (
    <Card data-testid="aging-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ενηλικίωση απαιτήσεων</CardTitle>
        <CardDescription>Ανεξόφλητα υπόλοιπα ανά ημέρες καθυστέρησης · σύνολο {formatMoney(total)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {buckets.map((b, i) => (
          <div key={b.label} data-testid={`aging-bucket-${i}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="tabular-nums">
                {formatMoney(b.amount)} <span className="text-xs text-muted-foreground">({b.count})</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", i >= 3 ? "bg-rose-600" : i >= 1 ? "bg-amber-500" : "bg-emerald-600")} style={{ width: `${Math.max(2, (b.amount / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TopCustomersCard({ rows }: { rows: { id: string; name: string; billed: number; outstanding: number }[] }) {
  return (
    <Card data-testid="top-customers-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Κορυφαίοι πελάτες</CardTitle>
        <CardDescription>Τζίρος και τρέχον υπόλοιπο</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Δεν υπάρχουν ακόμη πελάτες με τιμολογήσεις.</p>
        ) : (
          rows.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted" data-testid={`top-customer-${c.id}`}>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="tabular-nums">{formatMoney(c.billed)}</span>
              <span className={cn("w-24 text-right tabular-nums", c.outstanding > 0.005 ? "text-amber-700" : "text-muted-foreground")}>{formatMoney(c.outstanding)}</span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function SubscriptionsCard({ active, autoCharge, mrr, nextRun }: { active: number; autoCharge: number; mrr: number; nextRun: string | null }) {
  return (
    <Card data-testid="subscriptions-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4 text-muted-foreground" /> Συνδρομές πελατών
        </CardTitle>
        <CardDescription>Επαναλαμβανόμενα έσοδα ανά μήνα (καθαρή αξία)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="text-2xl font-semibold tabular-nums" data-testid="subscriptions-mrr">
          {formatMoney(mrr)}
        </div>
        <p className="text-muted-foreground">
          {active} ενεργά πρότυπα · {autoCharge} με αυτόματη χρέωση κάρτας
        </p>
        <p className="text-xs text-muted-foreground">{nextRun ? `Επόμενη έκδοση: ${nextRun.split("-").reverse().join("/")}` : "Δεν έχει προγραμματιστεί επόμενη έκδοση."}</p>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href="/recurring">
            Διαχείριση συνδρομών <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
