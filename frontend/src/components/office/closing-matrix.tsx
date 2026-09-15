"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toggleClosingStepAction } from "@/app/actions/office-tools";

interface Row {
  orgId: string;
  name: string;
  steps: Record<string, boolean>;
  checks: { mydataPending: number; draftExpenses: number; unmatchedBank: number; locked: boolean };
  readOnly: boolean;
}

export function ClosingMatrix({ month, rows, steps }: { month: string; rows: Row[]; steps: { code: string; label: string }[] }) {
  const router = useRouter();
  const [m, setM] = useState(month);
  const [pending, start] = useTransition();

  const toggle = (orgId: string, step: string, done: boolean) => {
    start(async () => {
      const res = await toggleClosingStepAction(orgId, month, step, done);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  const progress = (r: Row) => steps.filter((s) => r.steps[s.code]).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Μηνιαίο κλείσιμο πελατών</h1>
          <p className="text-sm text-muted-foreground">Checklist ανά πελάτη με αυτόματους ελέγχους — τι έχει μείνει για να κλείσει ο μήνας.</p>
        </div>
        <form className="flex items-end gap-2" action="/office/closing">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="month">
              Μήνας
            </label>
            <Input id="month" name="month" type="month" value={m} onChange={(e) => setM(e.target.value)} className="w-40" data-testid="closing-month" />
          </div>
          <Button type="submit" variant="secondary" data-testid="closing-apply">
            Εμφάνιση
          </Button>
        </form>
      </div>

      <div className="grid gap-4" data-testid="closing-matrix">
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Δεν υπάρχουν συνδεδεμένοι πελάτες.</CardContent>
          </Card>
        ) : (
          rows.map((r) => (
            <Card key={r.orgId} data-testid={`closing-row-${r.orgId}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link href={`/office/clients/${r.orgId}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={progress(r) === steps.length ? "default" : "secondary"}>
                      {progress(r)}/{steps.length} βήματα
                    </Badge>
                    {r.checks.mydataPending ? <Badge variant="destructive">{r.checks.mydataPending} myDATA εκκρεμούν</Badge> : null}
                    {r.checks.draftExpenses ? <Badge variant="outline">{r.checks.draftExpenses} αχαρακτήριστα</Badge> : null}
                    {r.checks.unmatchedBank ? <Badge variant="outline">{r.checks.unmatchedBank} τραπεζικές</Badge> : null}
                    {r.checks.locked ? <Badge variant="secondary">κλειδωμένη περίοδος</Badge> : null}
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/api/office/closing/pdf?org=${r.orgId}&month=${month}`} target="_blank" rel="noreferrer" data-testid={`closing-pdf-${r.orgId}`}>
                        <FileDown data-icon="inline-start" /> PDF μήνα
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                {steps.map((s) => {
                  const done = !!r.steps[s.code];
                  return (
                    <Button
                      key={s.code}
                      variant={done ? "default" : "outline"}
                      size="sm"
                      disabled={pending || r.readOnly}
                      onClick={() => toggle(r.orgId, s.code, !done)}
                      data-testid={`closing-step-${r.orgId}-${s.code}`}
                    >
                      {done ? <CheckCircle2 data-icon="inline-start" /> : <Circle data-icon="inline-start" />}
                      {s.label}
                    </Button>
                  );
                })}
                {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
