import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/invoice/totals";
import type { PayablesAging } from "@/lib/services/suppliers";
import { cn } from "@/lib/utils";

const COLORS = ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-500", "bg-red-800"];

/** Ενηλικίωση πληρωτέων: ράβδος κατανομής και πίνακας ανά διάστημα καθυστέρησης. */
export function PayablesAgingCard({ aging, title = "Ενηλικίωση πληρωτέων (aging)", compact = false }: { aging: PayablesAging; title?: string; compact?: boolean }) {
  const total = aging.open || 1;
  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {aging.count === 0 ? "Δεν υπάρχουν ανοιχτά τιμολόγια αγορών." : `${aging.count} ανοιχτά τιμολόγια · ${formatMoney(aging.open)} συνολικά · ${formatMoney(aging.overdue)} ληξιπρόθεσμα (${aging.overdueCount})`}
        </CardDescription>
      </CardHeader>
      {aging.count > 0 ? (
        <CardContent className="grid gap-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Κατανομή ανοιχτών υπολοίπων ανά ηλικία">
            {aging.buckets.map((b, i) =>
              b.amount > 0 ? <div key={b.key} className={cn(COLORS[i])} style={{ width: `${Math.max(1.5, (b.amount / total) * 100)}%` }} title={`${b.label}: ${formatMoney(b.amount)}`} /> : null,
            )}
          </div>
          <div className="grid gap-1 text-sm sm:grid-cols-5">
            {aging.buckets.map((b, i) => (
              <div key={b.key} className="flex items-center gap-2 sm:block">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("inline-block size-2 rounded-full", COLORS[i])} /> {b.label}
                </span>
                <span className="tabular-nums font-medium">{formatMoney(b.amount)}</span>
                {b.count ? <span className="text-xs text-muted-foreground"> · {b.count}</span> : null}
              </div>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
