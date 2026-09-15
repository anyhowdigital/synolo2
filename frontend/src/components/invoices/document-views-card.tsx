import { Eye, EyeOff, Mail, Link2, UserRound } from "lucide-react";
import type { DocumentView, Invoice } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeUserAgent, VIEW_SOURCE_LABELS, type ViewSource } from "@/lib/services/document-views";

const ICONS: Record<ViewSource, typeof Eye> = { email: Mail, link: Link2, portal: UserRound };

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "μόλις τώρα";
  if (m < 60) return `πριν ${m} λεπτά`;
  const h = Math.floor(m / 60);
  if (h < 24) return `πριν ${h} ώρες`;
  const d = Math.floor(h / 24);
  if (d < 30) return `πριν ${d} ημέρες`;
  return formatWhen(iso).slice(0, 10);
}

/** Κάρτα «Προβολή από τον πελάτη» στη σελίδα παραστατικού. */
export function DocumentViewsCard({ invoice, views }: { invoice: Invoice; views: DocumentView[] }) {
  if (invoice.status === "draft") return null;
  const sent = invoice.emailedAt;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {invoice.viewedAt ? <Eye className="size-4 text-emerald-600" /> : <EyeOff className="size-4 text-muted-foreground" />}
          Προβολή από τον πελάτη
        </CardTitle>
        <CardDescription>
          {invoice.viewedAt
            ? `Πρώτη προβολή ${formatWhen(invoice.viewedAt)} · ${invoice.viewCount} ${invoice.viewCount === 1 ? "προβολή" : "προβολές"}`
            : sent
              ? `Στάλθηκε ${formatWhen(sent)} – δεν έχει ανοιχτεί ακόμη.`
              : "Δεν έχει σταλεί ούτε έχει ανοιχτεί μέσω δημόσιου συνδέσμου."}
        </CardDescription>
      </CardHeader>
      {views.length ? (
        <CardContent>
          <ul className="space-y-2 text-sm">
            {views.slice(0, 8).map((v) => {
              const source = (v.source as ViewSource) in ICONS ? (v.source as ViewSource) : "link";
              const Icon = ICONS[source];
              return (
                <li key={v.id} className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span>{VIEW_SOURCE_LABELS[source]}</span>
                      <span className="text-xs text-muted-foreground" title={formatWhen(v.createdAt)}>
                        {relativeTime(v.createdAt)}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {describeUserAgent(v.userAgent)}
                      {v.ipAddress ? ` · ${v.ipAddress}` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {views.length > 8 ? <p className="mt-2 text-xs text-muted-foreground">+{views.length - 8} ακόμη προβολές</p> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
