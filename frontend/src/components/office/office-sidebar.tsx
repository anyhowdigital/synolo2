"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  FileCheck,
  FileText,
  Landmark,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ClipboardCheck,
  LogOut,
  Menu,
  Receipt,
  Sparkles,
  Users,
  UserCog,
  ListTodo,
  Gauge,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const GROUPS: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Γραφείο",
    items: [
      { href: "/office", label: "Επισκόπηση", icon: LayoutDashboard },
      { href: "/office/inbox", label: "Ειδοποιήσεις", icon: Bell },
      { href: "/office/alerts", label: "Λάθη & προσοχή", icon: AlertTriangle },
      { href: "/office/assistant", label: "AI Βοηθός", icon: Sparkles },
    ],
  },
  {
    label: "Πελάτες",
    items: [
      { href: "/office/clients", label: "Πελάτες & συνδέσεις", icon: Users },
      { href: "/office/cockpit", label: "Cockpit", icon: Building2 },
      { href: "/office/advisor", label: "Σύμβουλος", icon: Lightbulb },
      { href: "/office/kb-review", label: "Έλεγχος κανόνων", icon: ClipboardCheck },
      { href: "/office/documents", label: "Αιτήματα εγγράφων", icon: FileText },
      { href: "/office/documents-registry", label: "Έγγραφα & υπογραφή", icon: FileCheck },
    ],
  },
  {
    label: "Εργασία",
    items: [
      { href: "/office/vat", label: "ΦΠΑ & myDATA", icon: BarChart3 },
      { href: "/office/banking", label: "Τράπεζα", icon: Landmark },
      { href: "/office/closing", label: "Μηνιαίο κλείσιμο", icon: CheckSquare },
      { href: "/office/bulk", label: "Μαζικές ενέργειες", icon: Layers },
      { href: "/office/tasks", label: "Εκκρεμότητες", icon: ListTodo },
      { href: "/office/calendar", label: "Ημερολόγιο", icon: CalendarDays },
      { href: "/office/productivity", label: "Παραγωγικότητα", icon: Gauge },
    ],
  },
  {
    label: "Διαχείριση",
    items: [
      { href: "/office/team", label: "Ομάδα", icon: UserCog },
      { href: "/office/fees", label: "Αμοιβές", icon: Wallet },
    ],
  },
];

export interface OfficeShellProps {
  firmName: string;
  userName: string;
  roleLabel: string;
  clientCount: number;
  alerts: number;
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-3">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <div className="mb-1 px-3 text-[10px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">{g.label}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/office" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  data-testid={`office-nav-${item.href.split("/").pop()}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Identity(props: OfficeShellProps) {
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
      <div className="flex items-center gap-2">
        <Receipt className="size-4 shrink-0 text-sidebar-foreground/60" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-sidebar-foreground" title={props.firmName}>
            {props.firmName}
          </div>
          <div className="truncate text-[11px] text-sidebar-foreground/60">
            {props.userName} · {props.roleLabel}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="secondary">{props.clientCount} πελάτες</Badge>
        {props.alerts ? <Badge variant="destructive">{props.alerts} ειδοποιήσεις</Badge> : null}
      </div>
      <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-sidebar-foreground/70" onClick={() => logoutAction()} data-testid="office-logout">
        <LogOut data-icon="inline-start" /> Έξοδος
      </Button>
    </div>
  );
}

export function OfficeSidebar(props: OfficeShellProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar p-4 lg:flex print:hidden">
      <Link href="/office" className="flex items-center gap-2.5 px-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-white">
          <Receipt className="size-4" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">Σύνολο ERP</div>
          <div className="text-[11px] text-sidebar-foreground/60">Πύλη λογιστικού γραφείου</div>
        </div>
      </Link>
      <div className="flex-1 overflow-y-auto">
        <Nav />
      </div>
      <Identity {...props} />
    </aside>
  );
}

export function OfficeMobileNav(props: OfficeShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Μενού">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4 text-sidebar-foreground">
        <SheetTitle className="sr-only">Μενού γραφείου</SheetTitle>
        <div className="flex h-full flex-col gap-5">
          <div className="px-2 text-sm font-semibold">{props.firmName}</div>
          <div className="flex-1 overflow-y-auto">
            <Nav onNavigate={() => setOpen(false)} />
          </div>
          <Identity {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
