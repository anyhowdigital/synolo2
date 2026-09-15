"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Eye, FileSignature, MessageSquare, CreditCard, AlertTriangle, CalendarClock, Repeat, Inbox } from "lucide-react";
import { fetchNotificationsAction, markNotificationReadAction, type NotificationItem } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Bell> = {
  document_viewed: Eye,
  quote_accepted: FileSignature,
  quote_rejected: FileSignature,
  payment_received: CreditCard,
  mydata_error: AlertTriangle,
  invoice_overdue: CalendarClock,
  comment_added: MessageSquare,
  recurring_issued: Repeat,
};

const POLL_MS = 60_000;

function relative(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "μόλις τώρα";
  if (m < 60) return `${m} λ.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ώ.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ημ.`;
  return new Date(iso).toLocaleDateString("el-GR");
}

export function NotificationBell({ initialUnread, initialItems }: { initialUnread: number; initialItems: NotificationItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const r = await fetchNotificationsAction();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      // Αγνοούμε προσωρινά σφάλματα δικτύου.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);


  const openItem = (n: NotificationItem) => {
    start(async () => {
      if (!n.readAt) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
        setUnread((u) => Math.max(0, u - 1));
        await markNotificationReadAction(n.id);
      }
      setOpen(false);
      if (n.link) router.push(n.link);
    });
  };

  const markAll = () =>
    start(async () => {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? now })));
      setUnread(0);
      await markNotificationReadAction("all");
    });

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void refresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Ειδοποιήσεις (${unread} νέες)` : "Ειδοποιήσεις"}>
          <Bell />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Ειδοποιήσεις</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll} disabled={pending || unread === 0}>
            <CheckCheck data-icon="inline-start" /> Όλα ως αναγνωσμένα
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <Inbox className="size-6" />
              Καμία ειδοποίηση ακόμη. Θα ενημερώνεστε εδώ όταν ο πελάτης ανοίγει παραστατικά, αποδέχεται προσφορές ή πληρώνει online.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60", !n.readAt && "bg-primary/5")}
                    >
                      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", n.type === "mydata_error" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate", !n.readAt && "font-medium")}>{n.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{relative(n.createdAt)}</span>
                        </span>
                        {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span> : null}
                      </span>
                      {!n.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
            <a href="/notifications">Όλες οι ειδοποιήσεις</a>
          </Button>
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
            <a href="/account#notifications">Ρυθμίσεις ειδοποιήσεων</a>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
