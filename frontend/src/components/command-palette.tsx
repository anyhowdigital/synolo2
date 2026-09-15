"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Boxes, CornerDownLeft, FileSignature, FileText, Loader2, Plus, Search, Settings, ShoppingCart, Users } from "lucide-react";
import { globalSearchAction, type SearchHit } from "@/app/actions/search";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon: typeof FileText;
  keywords: string;
}

const COMMANDS: Command[] = [
  { id: "new-invoice", title: "Νέο παραστατικό", subtitle: "Τιμολόγιο, απόδειξη, πιστωτικό", href: "/invoices/new", icon: Plus, keywords: "νεο τιμολογιο παραστατικο new invoice" },
  { id: "new-quote", title: "Νέα προσφορά", href: "/invoices/new?kind=quote", icon: FileSignature, keywords: "προσφορα quote" },
  { id: "new-customer", title: "Νέος πελάτης", href: "/customers/new", icon: Users, keywords: "πελατης customer crm" },
  { id: "invoices", title: "Παραστατικά", href: "/invoices", icon: FileText, keywords: "παραστατικα τιμολογια invoices" },
  { id: "customers", title: "Πελάτες", href: "/customers", icon: Users, keywords: "πελατες crm πελατολογιο" },
  { id: "products", title: "Είδη & Αποθήκη", href: "/products", icon: Boxes, keywords: "ειδη αποθηκη products stock" },
  { id: "expenses", title: "Έξοδα & Προμηθευτές", href: "/expenses", icon: ShoppingCart, keywords: "εξοδα προμηθευτες expenses" },
  { id: "reports", title: "Αναφορές & ΦΠΑ", href: "/reports", icon: BarChart3, keywords: "αναφορες φπα φ2 reports vat" },
  { id: "settings", title: "Ρυθμίσεις", href: "/settings", icon: Settings, keywords: "ρυθμισεις settings mydata" },
];

const GROUP_LABEL: Record<SearchHit["group"], string> = {
  invoices: "Παραστατικά",
  quotes: "Προσφορές",
  customers: "Πελάτες",
  products: "Είδη",
  expenses: "Έξοδα",
};

const GROUP_ICON: Record<SearchHit["group"], typeof FileText> = {
  invoices: FileText,
  quotes: FileSignature,
  customers: Users,
  products: Boxes,
  expenses: ShoppingCart,
};

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type Row = { kind: "command"; item: Command } | { kind: "hit"; item: SearchHit };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) {
            setQuery("");
            setHits([]);
            setActive(0);
            setLoading(false);
          }
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeOpen = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setQuery("");
      setHits([]);
      setActive(0);
      setLoading(false);
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setActive(0);
    const q = value.trim();
    ++seq.current;
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await globalSearchAction(q);
        if (seq.current === id) {
          setHits(res);
          setActive(0);
        }
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const commands = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => fold(c.title).includes(q) || c.keywords.includes(q));
  }, [query]);

  const rows = useMemo<Row[]>(() => [...hits.map((h) => ({ kind: "hit", item: h }) as Row), ...commands.map((c) => ({ kind: "command", item: c }) as Row)], [hits, commands]);

  const go = useCallback(
    (row: Row) => {
      changeOpen(false);
      router.push(row.item.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      go(rows[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup: string | null = null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-full max-w-xs items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
        aria-label="Αναζήτηση"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Αναζήτηση…</span>
        <kbd className="rounded border bg-background px-1.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted md:hidden" aria-label="Αναζήτηση">
        <Search className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Καθολική αναζήτηση</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <Search className="size-4 text-muted-foreground" />}
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Αριθμός παραστατικού, πελάτης, ΑΦΜ, MARK, είδος, προμηθευτής…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Αναζήτηση"
            />
            <kbd className="hidden rounded border px-1.5 font-mono text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
            {rows.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">{loading ? "Αναζήτηση…" : "Δεν βρέθηκαν αποτελέσματα."}</div>
            ) : (
              rows.map((row, idx) => {
                const group = row.kind === "hit" ? GROUP_LABEL[row.item.group] : "Ενέργειες & σελίδες";
                const showHeader = group !== lastGroup;
                lastGroup = group;
                const Icon = row.kind === "hit" ? GROUP_ICON[row.item.group] : row.item.icon;
                return (
                  <div key={`${row.kind}-${row.item.id}`}>
                    {showHeader ? <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{group}</div> : null}
                    <button
                      type="button"
                      data-index={idx}
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(row)}
                      className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm", idx === active ? "bg-accent text-accent-foreground" : "")}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{row.item.title}</span>
                        {row.item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{row.item.subtitle}</span> : null}
                      </span>
                      {row.kind === "hit" && row.item.meta ? <span className="text-xs tabular-nums text-muted-foreground">{row.item.meta}</span> : null}
                      {idx === active ? <CornerDownLeft className="size-3.5 text-muted-foreground" /> : null}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
