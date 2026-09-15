"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  BookText,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  CloudCog,
  CreditCard,
  FileText,
  FileSignature,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Plus,
  Receipt,
  RefreshCw,
  CalendarClock,
  CalendarCheck,
  Star,
  TrendingDown,
  ShieldAlert,
  Settings,
  ShoppingCart,
  Sparkles,
  Landmark,
  ScanLine,
  Target,
  Timer,
  Truck,
  PackageCheck,
  Waves,
  FileBadge,
  PieChart,
  UsersRound,
  Warehouse,
  UserCircle2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction, switchOrgAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const GROUPS: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Πωλήσεις",
    items: [
      { href: "/invoices", label: "Παραστατικά", icon: FileText },
      { href: "/pos", label: "Ταμείο λιανικής (POS)", icon: ScanLine },
      { href: "/invoices?kind=delivery", label: "Δελτία αποστολής", icon: PackageCheck },
      { href: "/quotes", label: "Προσφορές", icon: FileSignature },
      { href: "/recurring", label: "Συνδρομές & επαναλαμβανόμενα", icon: RefreshCw },
      { href: "/customers", label: "Πελάτες", icon: Users },
      { href: "/crm", label: "Ευκαιρίες πωλήσεων", icon: Target },
      { href: "/projects", label: "Έργα & χρονοχρέωση", icon: Timer },
    ],
  },
  {
    label: "Αγορές & αποθήκη",
    items: [
      { href: "/expenses", label: "Έξοδα & Αγορές", icon: ShoppingCart },
      { href: "/suppliers", label: "Προμηθευτές", icon: Truck },
      { href: "/products", label: "Είδη", icon: Boxes },
      { href: "/inventory", label: "Αποθήκη", icon: Warehouse },
    ],
  },
  {
    label: "Χρήματα",
    items: [
      { href: "/banking", label: "Ταμείο & Τράπεζες", icon: Landmark },
      { href: "/receivables", label: "Κίνδυνος εισπράξεων", icon: TrendingDown },
      { href: "/reports/cashflow", label: "Ρευστότητα 90 ημερών", icon: Waves },
      { href: "/reports/profitability", label: "Κερδοφορία", icon: PieChart },
    ],
  },
  {
    label: "Φορολογικά & αναφορές",
    items: [
      { href: "/reports", label: "Αναφορές & ΦΠΑ", icon: BarChart3 },
      { href: "/reports/f2", label: "Φ2 & συμφωνία", icon: FileBadge },
      { href: "/reports/withholding", label: "Παρακρατούμενοι φόροι", icon: FileText },
      { href: "/accounting", label: "Διπλογραφικά", icon: BookText },
      { href: "/reports/closing", label: "Μηνιαίο κλείσιμο", icon: CalendarCheck },
      { href: "/mydata", label: "myDATA", icon: CloudCog },
      { href: "/deadlines", label: "Προθεσμίες", icon: CalendarClock },
      { href: "/risks", label: "Κίνδυνοι", icon: ShieldAlert },
    ],
  },
  {
    label: "Διαχείριση",
    items: [
      { href: "/settings", label: "Ρυθμίσεις", icon: Settings },
      { href: "/employees", label: "Προσωπικό", icon: UsersRound },
      { href: "/billing", label: "Συνδρομή", icon: CreditCard },
    ],
  },
];

const PINNED = [
  { href: "/dashboard", label: "Επισκόπηση", icon: LayoutDashboard },
  { href: "/advisor", label: "Σύμβουλος", icon: Lightbulb },
  { href: "/copilot", label: "Βοηθός AI", icon: Sparkles },
];

const ALL_ITEMS = [...PINNED, ...GROUPS.flatMap((g) => g.items)];
const FAV_KEY = "tc.favourites";

export interface SidebarProps {
  orgName: string;
  orgId: string;
  planLabel: string;
  mydataEnv: string;
  userName: string;
  userEmail: string;
  role: string;
  roleLabel: string;
  orgs: { id: string; name: string; role: string }[];
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = searchParams.get("kind") ? `${pathname}?kind=${searchParams.get("kind")}` : pathname;
  const [favs, setFavs] = useState<string[]>([]);
  const [manualOpen, setManualOpen] = useState<string[]>([]);
  const activeGroup = GROUPS.find((g) => g.items.some((i) => pathname.startsWith(i.href.split("?")[0])))?.label;
  const open = activeGroup && !manualOpen.includes(`!${activeGroup}`) ? [...manualOpen, activeGroup] : manualOpen;
  const setOpen = (fn: (o: string[]) => string[]) => {
    const next = fn(open);
    if (activeGroup && !next.includes(activeGroup)) setManualOpen([...next.filter((x) => x !== `!${activeGroup}`), `!${activeGroup}`]);
    else setManualOpen(next.filter((x) => x !== `!${activeGroup}`));
  };

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setFavs(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"));
      } catch {
        setFavs([]);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggleFav = (href: string) => {
    setFavs((f) => {
      const next = f.includes(href) ? f.filter((x) => x !== href) : [...f, href];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  const activeHref = ALL_ITEMS.filter((i) => currentUrl === i.href || (!i.href.includes("?") && currentUrl === pathname && pathname.startsWith(`${i.href}/`))).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? ALL_ITEMS.filter((i) => !i.href.includes("?") && (pathname === i.href || pathname.startsWith(`${i.href}/`))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const Item = ({ item, favourite = false }: { item: { href: string; label: string; icon: typeof LayoutDashboard }; favourite?: boolean }) => {
    const active = activeHref === item.href;
    return (
      <div className="group/nav flex items-center">
        <Link
          href={item.href}
          onClick={onNavigate}
          data-testid={`${favourite ? "fav-nav" : "nav"}-${item.href.replace(/\//g, "-").slice(1)}`}
          className={cn(
            "flex flex-1 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          <item.icon className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
        <button
          type="button"
          aria-label={favs.includes(item.href) ? "Αφαίρεση από αγαπημένα" : "Προσθήκη στα αγαπημένα"}
          onClick={() => toggleFav(item.href)}
          className={cn("mr-1 rounded p-1 text-sidebar-foreground/30 opacity-0 transition-opacity hover:text-amber-500 group-hover/nav:opacity-100", favs.includes(item.href) && "text-amber-500 opacity-100")}
        >
          <Star className="size-3.5" fill={favs.includes(item.href) ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  const favItems = ALL_ITEMS.filter((i) => favs.includes(i.href));

  return (
    <nav className="flex flex-col gap-0.5">
      {PINNED.map((item) => (
        <Item key={item.href} item={item} />
      ))}

      {favItems.length ? (
        <>
          <div className="mt-4 mb-1 px-3 text-[10px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">Αγαπημένα</div>
          {favItems.map((item) => (
            <Item key={`fav-${item.href}`} item={item} favourite />
          ))}
        </>
      ) : null}

      {GROUPS.map((g) => {
        const isOpen = open.includes(g.label);
        return (
          <div key={g.label} className="mt-3">
            <button
              type="button"
              onClick={() => setOpen((o) => (o.includes(g.label) ? o.filter((x) => x !== g.label) : [...o, g.label]))}
              data-testid={`nav-group-${g.label}`}
              className="flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase transition-colors hover:text-sidebar-foreground/70"
            >
              {g.label}
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
            </button>
            {isOpen ? (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <Item key={item.href} item={item} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-white">
        <Receipt className="size-4" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-sidebar-foreground">Σύνολο ERP</div>
        <div className="text-[11px] text-sidebar-foreground/60">e-Invoicing · CRM · myDATA</div>
      </div>
    </Link>
  );
}

function OrgSwitcher(props: SidebarProps & { onNavigate?: () => void }) {
  const envLabel = props.mydataEnv === "prod" ? "myDATA: Παραγωγή" : props.mydataEnv === "dev" ? "myDATA: Δοκιμαστικό" : "myDATA: Προσομοίωση";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-left hover:bg-sidebar-accent/70" data-testid="org-switcher-trigger" aria-label={`Αλλαγή επιχείρησης — ${props.orgName}`}>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 shrink-0 text-sidebar-foreground/60" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-sidebar-foreground" title={props.orgName}>
                {props.orgName}
              </div>
              <div className="truncate text-[11px] text-sidebar-foreground/60">
                {props.userName} · {props.roleLabel}
              </div>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/60" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="bg-sidebar-primary/20 text-sidebar-foreground">
              {props.planLabel}
            </Badge>
            <Badge variant="outline" className="border-sidebar-border text-sidebar-foreground/80">
              {envLabel}
            </Badge>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">
          {props.userEmail}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Επιχειρήσεις</DropdownMenuLabel>
        {props.orgs.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => { props.onNavigate?.(); switchOrgAction(o.id); }} className="justify-between" data-testid={`switch-org-${o.id}`}>
            <span className="truncate">{o.name}</span>
            {o.id === props.orgId ? <Check className="size-4" /> : <span className="text-[10px] text-muted-foreground">{o.role}</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <Plus /> Νέα επιχείρηση
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserCircle2 /> Ο λογαριασμός μου & ασφάλεια
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=users">
            <Users /> Χρήστες & προσκλήσεις
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => logoutAction()} variant="destructive">
          <LogOut /> Αποσύνδεση
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar(props: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex print:hidden">
      <Brand />
      <div className="-mt-2 flex-1 overflow-y-auto">
        <NavLinks />
      </div>
      <OrgSwitcher {...props} />
    </aside>
  );
}

export function MobileNav(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Μενού" data-testid="business-mobile-menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4 text-sidebar-foreground">
        <SheetTitle className="sr-only">Μενού πλοήγησης</SheetTitle>
        <div className="flex h-full flex-col gap-6">
          <Brand />
          <div className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <OrgSwitcher {...props} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
