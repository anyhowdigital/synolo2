import { Building2 } from "lucide-react";

export function ActiveCompany({ name, afm, label = "Ενεργή επιχείρηση" }: { name: string; afm?: string | null; label?: string }) {
  return <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2" data-testid="active-company-context"><Building2 className="size-4 shrink-0 text-primary" aria-hidden /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground" data-testid="active-company-label">{label}</p><p className="break-words text-sm font-semibold [overflow-wrap:anywhere]" data-testid="active-company-name">{name}</p></div>{afm && <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="active-company-afm">ΑΦΜ {afm}</span>}</div>;
}
