"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, BellRing, CheckCircle2, Info, Loader2, RefreshCw, Scale, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { riskAdviceAction, recheckRisksAction, type RiskAdvice } from "@/app/actions/risks";
import type { RiskFinding, RiskReport } from "@/lib/services/risks";
import { RISK_GROUP_LABELS } from "@/lib/services/risks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/invoice/totals";
import { cn } from "@/lib/utils";

const SEVERITY: Record<RiskFinding["severity"], { label: string; icon: typeof AlertOctagon; box: string; badge: string }> = {
  critical: { label: "Κρίσιμο", icon: AlertOctagon, box: "border-rose-300 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30", badge: "bg-rose-600 text-white" },
  high: { label: "Υψηλό", icon: AlertTriangle, box: "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30", badge: "bg-amber-600 text-white" },
  medium: { label: "Μέτριο", icon: BellRing, box: "border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20", badge: "bg-yellow-500 text-black" },
  low: { label: "Χαμηλό", icon: Info, box: "bg-muted/40", badge: "bg-muted text-foreground" },
};

export function RiskScore({ report, history }: { report: RiskReport; history: { day: string; score: number }[] }) {
  const tone = report.level === "green" ? "text-emerald-600" : report.level === "amber" ? "text-amber-600" : "text-rose-600";
  const ring = report.level === "green" ? "#059669" : report.level === "amber" ? "#d97706" : "#e11d48";
  const prev = history.length > 1 ? history[history.length - 2]!.score : null;
  const delta = prev !== null ? report.score - prev : null;
  const max = 100;

  return (
    <Card data-testid="risk-score-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Σκορ συμμόρφωσης</CardTitle>
        <CardDescription>Πόσο «ήσυχα» είστε απέναντι στην ΑΑΔΕ σήμερα. 100 = καθαρό.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="relative flex size-24 shrink-0 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(${ring} ${report.score * 3.6}deg, var(--muted) 0deg)` }}
          >
            <div className="flex size-[76px] flex-col items-center justify-center rounded-full bg-card">
              <span className={cn("text-2xl font-bold tabular-nums", tone)} data-testid="risk-score-value">
                {report.score}
              </span>
              <span className="text-[10px] text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="min-w-0 space-y-1 text-sm">
            <div className="font-medium">
              {report.level === "green" ? "Χαμηλός κίνδυνος" : report.level === "amber" ? "Χρειάζεται προσοχή" : "Υψηλός κίνδυνος ελέγχου"}
            </div>
            <p className="text-muted-foreground">
              {report.findings.length === 0 ? `Κανένα εύρημα σε ${report.checksRun} ελέγχους.` : `${report.findings.length} ευρήματα σε ${report.checksRun} ελέγχους.`}
            </p>
            {delta !== null ? (
              <p className={cn("text-xs", delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-muted-foreground")}>
                {delta > 0 ? `+${delta}` : delta} από τον προηγούμενο έλεγχο
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {(Object.keys(SEVERITY) as RiskFinding["severity"][]).map((s) => (
            <div key={s} className="rounded-lg border p-2" data-testid={`risk-count-${s}`}>
              <div className="text-lg font-semibold tabular-nums">{report.counts[s]}</div>
              <div className="text-muted-foreground">{SEVERITY[s].label}</div>
            </div>
          ))}
        </div>

        {history.length > 1 ? (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Ιστορικό βελτίωσης</div>
            <div className="flex h-16 items-end gap-1" data-testid="risk-history">
              {history.slice(-30).map((h) => (
                <div
                  key={h.day}
                  title={`${h.day}: ${h.score}`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (h.score / max) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RiskList({ report }: { report: RiskReport }) {
  const router = useRouter();
  const [open, setOpen] = useState<RiskFinding | null>(null);
  const [advice, setAdvice] = useState<RiskAdvice | null>(null);
  const [cache] = useState(() => new Map<string, RiskAdvice>());
  const [elapsed, setElapsed] = useState(0);
  const [loading, startLoad] = useTransition();
  const [rechecking, startRecheck] = useTransition();

  const askAi = (f: RiskFinding) => {
    setOpen(f);
    const hit = cache.get(f.code);
    setAdvice(hit ?? null);
    if (hit) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    startLoad(async () => {
      const res = await riskAdviceAction(f.code);
      clearInterval(timer);
      if (res.ok) cache.set(f.code, res);
      setAdvice(res);
      if (!res.ok) toast.error(res.error);
    });
  };

  const recheck = () =>
    startRecheck(async () => {
      const res = await recheckRisksAction();
      if (res.ok) {
        toast.success(`Επανέλεγχος ολοκληρώθηκε – σκορ ${res.score}/100`);
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Τελευταίος έλεγχος: {new Date(report.checkedAt).toLocaleString("el-GR")}
        </p>
        <Button variant="outline" size="sm" onClick={recheck} disabled={rechecking} data-testid="risk-recheck-btn">
          {rechecking ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
          Επανέλεγχος
        </Button>
      </div>

      {report.findings.length === 0 ? (
        <Card className="border-emerald-300" data-testid="risk-empty">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CheckCircle2 className="size-8 text-emerald-600" />
            <p className="font-medium">Καμία καμπάνα. Όλοι οι έλεγχοι συμμόρφωσης πέρασαν.</p>
            <p className="text-sm text-muted-foreground">Θα ειδοποιηθείτε αυτόματα μόλις εμφανιστεί νέος κίνδυνος.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="risk-list">
          {report.findings.map((f) => {
            const sv = SEVERITY[f.severity];
            const Icon = sv.icon;
            return (
              <Card key={f.code} className={cn("overflow-hidden", sv.box)} data-testid={`risk-item-${f.code}`}>
                <CardHeader className="pb-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <CardTitle className="flex min-w-0 items-start gap-2 text-base">
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 break-words">{f.title}</span>
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className={sv.badge}>{sv.label}</Badge>
                      <Badge variant="outline" className="tabular-nums">
                        {f.count}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    {RISK_GROUP_LABELS[f.group]}
                    {f.amount ? ` · έκθεση ${formatMoney(f.amount)}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{f.why}</p>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Scale className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{f.legal}</span>
                  </p>
                  {f.samples.length ? (
                    <ul className="space-y-1 rounded-lg bg-background/70 p-2 text-xs">
                      {f.samples.map((s, i) => (
                        <li key={i} className="break-words font-mono">
                          {s}
                        </li>
                      ))}
                      {f.count > f.samples.length ? <li className="text-muted-foreground">…και άλλα {f.count - f.samples.length}</li> : null}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => askAi(f)} data-testid={`risk-ai-btn-${f.code}`}>
                      <Sparkles data-icon="inline-start" /> Λύσε το με AI
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={f.href}>{f.hrefLabel}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="risk-ai-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4" /> Λύση με AI
            </DialogTitle>
            <DialogDescription className="break-words">{open?.title}</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="space-y-3 py-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Ο βοηθός αναλύει το εύρημα και τη νομοθεσία… ({elapsed}s)
              </div>
              <p className="text-xs">Συνήθως χρειάζονται 10-20 δευτερόλεπτα. Η απάντηση αποθηκεύεται, ώστε το επόμενο άνοιγμα να είναι άμεσο.</p>
            </div>
          ) : advice && advice.ok ? (
            <div className="space-y-4 text-sm">
              <p>{advice.advice.summary}</p>
              <ol className="list-decimal space-y-2 pl-5">
                {advice.advice.steps.map((s, i) => (
                  <li key={i} className="break-words">
                    {s}
                  </li>
                ))}
              </ol>
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">Πρόληψη στο μέλλον</div>
                <p>{advice.advice.prevention}</p>
              </div>
              <p className="text-xs text-muted-foreground">Νομική βάση: {advice.advice.law}</p>
              <p className="text-xs text-muted-foreground">Οι οδηγίες είναι ενημερωτικές – για οριστική αντιμετώπιση συμβουλευτείτε τον λογιστή σας.</p>
            </div>
          ) : advice ? (
            <p className="py-6 text-sm text-destructive">{advice.error}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
