import Link from "next/link";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { listNotifications, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { formatDate } from "@/lib/invoice/totals";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read";

export const metadata = { title: "Ειδοποιήσεις" };

function typeLabel(type: string) {
  const entry = (NOTIFICATION_TYPES as Record<string, { label: string }>)[type];
  return entry?.label ?? type;
}

export default async function NotificationsPage() {
  const db = await getDb();
  const { org, user, membership } = await requireContext(db);
  const items = await listNotifications(db, org.id, user.id, membership.notificationPrefsJson, 100);
  const unread = items.filter((i) => !i.readAt).length;

  return (
    <>
      <PageHeader title="Ειδοποιήσεις" description="Όλες οι ειδοποιήσεις της επιχείρησης: διαβιβάσεις myDATA, εισπράξεις, ληξιπρόθεσμα, τιμολόγηση Δημοσίου και αυτοματισμοί.">
        <Button asChild variant="outline">
          <Link href="/account#notifications">
            <Settings2 data-icon="inline-start" /> Ρυθμίσεις ειδοποιήσεων
          </Link>
        </Button>
        {unread > 0 ? <MarkAllReadButton /> : null}
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState title="Δεν υπάρχουν ειδοποιήσεις" description="Μόλις εκδοθεί, διαβιβαστεί ή εξοφληθεί κάποιο παραστατικό, θα το δείτε εδώ." />
      ) : (
        <Card>
          <CardContent className="divide-y p-0" data-testid="notifications-list">
            {items.map((n) => {
              const row = (
                <div className={`flex flex-wrap items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-primary/5"}`}>
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {n.readAt ? <CheckCheck className="size-4 text-muted-foreground" /> : <Bell className="size-4 text-primary" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{n.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {typeLabel(n.type)}
                      </Badge>
                      {n.readAt ? null : <Badge className="text-[10px]">Νέα</Badge>}
                    </div>
                    {n.body ? <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p> : null}
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(n.createdAt.slice(0, 10))}</span>
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} className="block hover:bg-muted/50" data-testid={`notification-${n.id}`}>
                  {row}
                </Link>
              ) : (
                <div key={n.id} data-testid={`notification-${n.id}`}>
                  {row}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
