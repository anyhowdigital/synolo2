import Link from "next/link";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskReport } from "@/lib/services/risks";
import { cn } from "@/lib/utils";

export function RiskRadarCard({ report }: { report: RiskReport }) {
  const tone = report.level === "green" ? "text-emerald-600" : report.level === "amber" ? "text-amber-600" : "text-rose-600";
  const top = report.findings.slice(0, 3);

  return (
    <Card className={cn(report.level === "red" && "border-rose-300 dark:border-rose-900")} data-testid="risk-radar-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {report.level === "green" ? <ShieldCheck className="size-4 text-emerald-600" /> : <ShieldAlert className="size-4 text-rose-600" />}
            Radar κινδύνων ΑΑΔΕ
          </span>
          <span className={cn("text-xl font-bold tabular-nums", tone)} data-testid="risk-radar-score">
            {report.score}
          </span>
        </CardTitle>
        <CardDescription>
          {report.findings.length === 0 ? `Καθαρό – πέρασαν όλοι οι ${report.checksRun} έλεγχοι.` : `${report.findings.length} ευρήματα · ${report.counts.critical} κρίσιμα`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {top.map((f) => (
          <div key={f.code} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-2">
            <span className="min-w-0 break-words">{f.title}</span>
            <Badge variant="outline" className="shrink-0 tabular-nums">
              {f.count}
            </Badge>
          </div>
        ))}
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/risks">
            Άνοιγμα radar <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
