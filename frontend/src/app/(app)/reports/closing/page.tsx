import { CheckCircle2, Download, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { currentMonth, monthlyClose, type CloseStatus } from "@/lib/services/monthly-close";
import { PageHeader } from "@/components/page-header";
import { PeriodLockButton } from "@/components/reports/period-lock-button";
import { lockedMonths } from "@/lib/services/periods";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/invoice/totals";

export const metadata = { title: "Μηνιαίο κλείσιμο" };

const ICON: Record<CloseStatus, typeof CheckCircle2> = { ok: CheckCircle2, warn: AlertTriangle, blocker: XCircle };
const TONE: Record<CloseStatus, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  blocker: "text-destructive",
};
const BADGE: Record<CloseStatus, string> = { ok: "ΟΚ", warn: "Προσοχή", blocker: "Εμπόδιο" };

function monthOptions(count = 12) {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const v = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const value = v.toISOString().slice(0, 7);
    out.push({ value, label: v.toLocaleDateString("el-GR", { month: "long", year: "numeric", timeZone: "UTC" }) });
  }
  return out;
}

export default async function ClosingPage({ searchParams }: PageProps<"/reports/closing">) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth();
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const close = await monthlyClose(db, org, month);
  const locks = await lockedMonths(db, org.id);
  const isLocked = locks.some((l) => l.month === month);
  const months = monthOptions();

  return (
    <>
      <PageHeader title="Μηνιαίο κλείσιμο" description="Ένας έλεγχος για ΦΠΑ, χαρακτηρισμούς, διαβίβαση και ασυμφωνίες – και έκθεση για τον λογιστή.">
        <PeriodLockButton month={month} locked={isLocked} canClose={close.canClose} />
        <Button asChild data-testid="closing-pdf-btn">
          <a href={`/api/reports/closing/pdf?month=${month}`}>
            <Download data-icon="inline-start" /> Έκθεση PDF
          </a>
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2" data-testid="closing-month-picker">
        {months.map((m) => (
          <Button key={m.value} asChild variant={m.value === month ? "default" : "outline"} size="sm">
            <Link href={`/reports/closing?month=${m.value}`}>{m.label}</Link>
          </Button>
        ))}
      </div>

      <Card className={close.canClose ? "mb-6 border-emerald-300" : "mb-6 border-destructive/40"} data-testid="closing-verdict">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {close.canClose ? "Ο μήνας είναι έτοιμος να κλείσει" : `${close.blockers} εμπόδια πριν το κλείσιμο`}
            <Badge variant={close.canClose ? "secondary" : "destructive"} data-testid="closing-status-badge">
              {close.canClose ? "Καθαρό" : "Χρειάζεται διόρθωση"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {close.period.from} – {close.period.to} · {close.warnings} σημεία προσοχής
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Παραστατικά", String(close.totals.documents)],
            ["Καθαρά έσοδα", formatMoney(close.totals.net)],
            ["Θέση ΦΠΑ", `${close.totals.position >= 0 ? "χρεωστικό " : "πιστωτικό "}${formatMoney(Math.abs(close.totals.position))}`],
            ["Έξοδα (καθαρά)", formatMoney(close.totals.expenses)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="truncate font-heading text-base font-medium">{v}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3" data-testid="closing-checklist">
        {close.items.map((item) => {
          const Icon = ICON[item.status];
          return (
            <div key={item.key} className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4" data-testid={`closing-item-${item.key}`}>
              <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[item.status]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.title}</span>
                  <Badge variant={item.status === "ok" ? "secondary" : item.status === "warn" ? "outline" : "destructive"} className="text-xs">
                    {BADGE[item.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm break-words text-muted-foreground">{item.detail}</p>
              </div>
              {item.href && item.status !== "ok" ? (
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link href={item.href}>Διόρθωση</Link>
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Το κλείσιμο δεν «κλειδώνει» τα βιβλία: είναι έλεγχος πληρότητας πριν τη δήλωση. Αφού διορθώσετε τα εμπόδια, ξανακατεβάστε την έκθεση PDF και στείλτε τη στον λογιστή σας.
      </p>
    </>
  );
}
