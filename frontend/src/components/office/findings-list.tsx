import Link from "next/link";
import { ArrowUpRight, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEVERITY_LABEL, SOURCE_LABEL, type Finding } from "@/lib/services/office-findings";

const SEV_VARIANT = { high: "destructive", medium: "secondary", low: "outline" } as const;

export function FindingRow({ f, showClient = true }: { f: Finding; showClient?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3" data-testid={`finding-${f.source}-${f.code}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={SEV_VARIANT[f.severity]}>{SEVERITY_LABEL[f.severity]}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{SOURCE_LABEL[f.source]}</Badge>
          <span className="text-sm font-medium">{f.title}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {showClient ? <Link href={`/office/clients/${f.orgId}`} className="font-medium hover:underline">{f.orgName}</Link> : null}
          {showClient ? " · " : ""}
          {f.detail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {f.canFix && f.fixHref ? (
          <Button asChild size="sm" variant="secondary" data-testid={`finding-fix-${f.orgId}-${f.code}`}>
            <Link href={f.fixHref}><Wrench data-icon="inline-start" /> Διόρθωσέ το</Link>
          </Button>
        ) : null}
        {f.openHref ? (
          <Button asChild size="sm" variant="ghost" data-testid={`finding-open-${f.orgId}-${f.code}`}>
            <Link href={f.openHref}>Άνοιγμα εγγραφής <ArrowUpRight data-icon="inline-end" /></Link>
          </Button>
        ) : f.href ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={f.href}>Προβολή <ArrowUpRight data-icon="inline-end" /></Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function FindingsList({ findings, showClient = true, emptyText = "Κανένα ανοιχτό θέμα." }: { findings: Finding[]; showClient?: boolean; emptyText?: string }) {
  if (!findings.length) return <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>;
  return <div className="space-y-2">{findings.map((f) => <FindingRow key={f.id} f={f} showClient={showClient} />)}</div>;
}
