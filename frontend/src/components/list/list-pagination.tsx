import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/lib/list-params";
import { cn } from "@/lib/utils";

/** Ενιαία σελιδοποίηση: «X–Y από Z», επιλογή 25/50/100/200, προηγούμενη/επόμενη. Server component (links). */
export function ListPagination({ total, page, pageSize, hrefFor, noun = "εγγραφές" }: { total: number; page: number; pageSize: number; hrefFor: (patch: { page?: number; pageSize?: number }) => string; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="list-pagination">
      <div className="text-muted-foreground" data-testid="pagination-range">
        {total === 0 ? `0 ${noun}` : `${start}–${end} από ${total} ${noun}`}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Ανά σελίδα:</span>
          {PAGE_SIZES.map((s) => (
            <Link key={s} href={hrefFor({ pageSize: s, page: 1 })} className={cn("rounded-md border px-2 py-0.5", s === pageSize ? "bg-foreground text-background" : "hover:bg-muted")} data-testid={`page-size-${s}`}>
              {s}
            </Link>
          ))}
        </div>
        {pages > 1 ? (
          <div className="flex items-center gap-1">
            {page <= 1 ? (
              <Button variant="outline" size="sm" className="h-8" disabled data-testid="page-prev"><ChevronLeft data-icon="inline-start" /> Προηγούμενη</Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link href={hrefFor({ page: page - 1 })} data-testid="page-prev"><ChevronLeft data-icon="inline-start" /> Προηγούμενη</Link>
              </Button>
            )}
            <span className="px-1 text-xs text-muted-foreground" data-testid="pagination-page">Σελίδα {page}/{pages}</span>
            {page >= pages ? (
              <Button variant="outline" size="sm" className="h-8" disabled data-testid="page-next">Επόμενη <ChevronRight data-icon="inline-end" /></Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link href={hrefFor({ page: page + 1 })} data-testid="page-next">Επόμενη <ChevronRight data-icon="inline-end" /></Link>
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Τυποποιημένο περίβλημα πίνακα: οριζόντιο scroll χωρίς overflow σελίδας. */
export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 w-full overflow-x-auto rounded-xl border bg-card", className)} data-testid="table-shell">{children}</div>;
}
