import { cn } from "@/lib/utils";

export function SynoloMark({ className }: { className?: string }) {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={cn("size-9 shrink-0", className)}><rect width="40" height="40" rx="12" fill="currentColor" /><path d="M28 11H12l9 9-9 9h16" stroke="#F7F6F0" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" /><circle cx="29" cy="20" r="2.5" fill="#D9AB68" /></svg>;
}

export function SynoloBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn("inline-flex items-center gap-2.5 whitespace-nowrap", className)}><SynoloMark /><span className={cn("font-semibold tracking-tight", compact ? "text-lg" : "text-xl")}><span>Σύνολο</span><span className="ml-1.5 text-[10px] font-semibold tracking-[0.12em] opacity-70">ERP</span></span></span>;
}
