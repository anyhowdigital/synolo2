import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangeFields } from "@/components/list/date-range-fields";
import { cn } from "@/lib/utils";

export interface FilterChip {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

/**
 * Ενιαία μπάρα φίλτρων για όλες τις λίστες (επιχείρηση & γραφείο).
 * GET form: q, from, to + hidden params. Chips = γρήγορα φίλτρα κατάστασης.
 */
export function FilterBar({
  action,
  q = "",
  from = "",
  to = "",
  searchPlaceholder = "Αναζήτηση…",
  hidden = {},
  showDates = true,
  chips,
  clearHref,
  children,
  filtersActive = false,
}: {
  action: string;
  q?: string;
  from?: string;
  to?: string;
  searchPlaceholder?: string;
  hidden?: Record<string, string | undefined>;
  showDates?: boolean;
  chips?: FilterChip[];
  clearHref?: string;
  children?: React.ReactNode;
  filtersActive?: boolean;
}) {
  const hasActive = !!(q || from || to || filtersActive);
  return (
    <div className="mb-4 space-y-3" data-testid="filter-bar">
      <form key={JSON.stringify([q, from, to, hidden])} method="get" className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5" action={action}>
        {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <div className="relative min-w-0 basis-[200px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} aria-label={searchPlaceholder} placeholder={searchPlaceholder} className="h-8 pl-8" data-testid="filter-q" />
        </div>
        {showDates ? <DateRangeFields from={from} to={to} /> : null}
        {children}
        <Button type="submit" variant="secondary" size="sm" className="h-8" data-testid="filter-submit">Εφαρμογή</Button>
        {hasActive && clearHref ? (
          <Button asChild variant="ghost" size="sm" className="h-8" data-testid="filter-clear">
            <Link href={clearHref}><X data-icon="inline-start" /> Καθαρισμός</Link>
          </Button>
        ) : null}
      </form>
      {chips?.length ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="filter-chips">
          {chips.map((c) => (
            <Link key={c.key} href={c.href} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", c.active ? "bg-foreground text-background" : "hover:bg-muted")} data-testid={`chip-${c.key || "all"}`}>
              {c.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
