"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

const GROUPS = [
  { title: "Επιχείρηση & παραστατικά", items: [["company", "Επιχείρηση"], ["invoicing", "Τιμολόγηση & πληρωμές"], ["appearance", "Εμφάνιση PDF"], ["series", "Σειρές"], ["fields", "Πεδία & κανάλια"]] },
  { title: "ΑΑΔΕ & Δημόσιο", items: [["mydata", "myDATA"], ["aade", "Αναζήτηση ΑΦΜ (ΑΑΔΕ)"], ["b2g", "Δημόσιο (B2G)"]] },
  { title: "Λογιστική & διασυνδέσεις", items: [["accounting", "Λογιστική ΕΛΠ"], ["bridge", "Γέφυρα λογιστικού"]] },
  { title: "Συνεργασία", items: [["users", "Χρήστες"], ["accountant", "Λογιστής"]] },
  { title: "Δεδομένα & διασυνδέσεις", items: [["developer", "Διασυνδέσεις & API"], ["export", "Εξαγωγή δεδομένων"], ["email", "Ηλ. αλληλογραφία"], ["audit", "Ιστορικό"]] },
];
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function SettingsTabs({ tab, children }: { tab: string; children: ReactNode }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();
  const matches = GROUPS.map((g) => ({ ...g, items: g.items.filter(([key, label]) => normalize(`${key} ${label} ${key === "invoicing" ? "Viva Stripe IRIS υπενθυμίσεις" : ""}`).includes(normalize(search))) })).filter((g) => g.items.length);
  const changeTab = (value: string) => start(() => router.push(`/settings?tab=${value}`, { scroll: false }));
  return (
    <Tabs value={tab} onValueChange={changeTab} orientation="vertical" className="grid min-w-0 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3" data-testid="settings-navigation">
        <div className="grid min-w-0 gap-2 lg:hidden">
          <label htmlFor="settings-mobile-section" className="text-sm font-medium">Ενότητα ρυθμίσεων</label>
          <select id="settings-mobile-section" value={tab} onChange={(e) => changeTab(e.target.value)} disabled={pending} className="h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="settings-mobile-select">
            {GROUPS.map((g) => <optgroup key={g.title} label={g.title}>{g.items.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>)}
          </select>
          <p className="text-xs text-muted-foreground" data-testid="settings-mobile-help">Όλες οι ενότητες είναι διαθέσιμες από αυτή τη λίστα.</p>
        </div>
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Βρείτε μια ρύθμιση…" aria-label="Αναζήτηση ρυθμίσεων" className="pl-9" data-testid="settings-search-input" />
        </div>
        <TabsList aria-label="Ενότητες ρυθμίσεων" className="hidden h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0 lg:flex" data-testid="settings-tabs-list">
          {matches.map((g) => <div key={g.title} className="w-full">
            <span className="block px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">{g.title}</span>
            {g.items.map(([key, label]) => <TabsTrigger key={key} value={key} disabled={pending} className="h-10 w-full flex-none justify-start whitespace-normal px-3 text-left text-sm" data-testid={`settings-tab-${key}`}>{label}</TabsTrigger>)}
          </div>)}
        </TabsList>
        {!matches.length && <p className="text-sm text-muted-foreground" data-testid="settings-search-empty">Δεν βρέθηκε ενότητα. Δοκιμάστε π.χ. «πληρωμές» ή «ΑΑΔΕ».</p>}
        {pending && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="settings-loading"><Loader2 className="size-3 animate-spin" /> Φόρτωση ρυθμίσεων…</p>}
      </aside>
      <section className="min-w-0" data-testid="settings-active-panel">{children}</section>
    </Tabs>
  );
}
