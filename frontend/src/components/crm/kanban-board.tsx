"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, GripVertical, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { moveOpportunity, deleteOpportunity, type ActionResult } from "@/app/actions/crm";
import { OPP_STAGES, type OppStageId } from "@/lib/crm/stages";
import { formatMoney } from "@/lib/invoice/totals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Opp = {
  id: string;
  title: string;
  stage: string;
  amount: number;
  probability: number;
  customerName: string;
  expectedCloseDate: string | null;
  ownerName: string;
};

export function KanbanBoard({ opportunities, canWrite }: { opportunities: Opp[]; canWrite: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(opportunities);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDragStart(id: string) {
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault();
    setOverStage(stage);
  }
  function onDrop(stage: OppStageId) {
    if (!dragId) return;
    const opp = items.find((o) => o.id === dragId);
    if (!opp || opp.stage === stage) { setDragId(null); setOverStage(null); return; }
    // Optimistic update
    setItems((prev) => prev.map((o) => (o.id === dragId ? { ...o, stage } : o)));
    startTransition(async () => {
      const res = await moveOpportunity(dragId, stage);
      if (!res.ok) {
        toast.error(res.error);
        setItems(opportunities);
      } else {
        toast.success("Η ευκαιρία μετακινήθηκε.");
        router.refresh();
      }
    });
    setDragId(null);
    setOverStage(null);
  }

  const byStage = new Map<string, Opp[]>();
  for (const s of OPP_STAGES) byStage.set(s.id, []);
  for (const o of items) {
    const arr = byStage.get(o.stage);
    if (arr) arr.push(o);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-6" data-testid="crm-kanban">
      {OPP_STAGES.map((s) => {
        const arr = byStage.get(s.id) ?? [];
        const total = arr.reduce((sum, o) => sum + o.amount, 0);
        const weighted = arr.reduce((sum, o) => sum + o.amount * (o.probability / 100), 0);
        return (
          <div
            key={s.id}
            className={`flex min-h-[300px] flex-col gap-2 rounded-xl border-2 border-dashed ${overStage === s.id ? "border-primary bg-primary/5" : "border-transparent"} p-2 transition-colors ${s.color}`}
            onDragOver={(e) => onDragOver(e, s.id)}
            onDrop={() => onDrop(s.id as OppStageId)}
            data-testid={`kanban-col-${s.id}`}
          >
            <div className="px-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider uppercase">{s.label}</span>
                <Badge variant="outline" className="tabular-nums">{arr.length}</Badge>
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {formatMoney(total)}{s.id !== "won" && s.id !== "lost" ? ` · Σταθμ. ${formatMoney(weighted)}` : ""}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {arr.map((o) => (
                <div
                  key={o.id}
                  draggable={canWrite}
                  onDragStart={() => onDragStart(o.id)}
                  className={`group cursor-grab rounded-lg border bg-card p-3 shadow-sm transition hover:shadow-md ${pending && dragId === o.id ? "opacity-60" : ""}`}
                  data-testid={`opp-card-${o.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/crm/${o.id}`} className="min-w-0 flex-1 text-sm font-medium hover:underline">
                      {o.title}
                    </Link>
                    {canWrite ? <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" /> : null}
                  </div>
                  {o.customerName ? <div className="mt-1 text-xs text-muted-foreground truncate">{o.customerName}</div> : null}
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold tabular-nums text-primary">{formatMoney(o.amount)}</span>
                    <span className="text-muted-foreground">{o.probability}%</span>
                  </div>
                  {(o.expectedCloseDate || o.ownerName) ? (
                    <div className="mt-2 flex items-center gap-2 border-t pt-1.5 text-[11px] text-muted-foreground">
                      {o.expectedCloseDate ? <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(o.expectedCloseDate).toLocaleDateString("el-GR")}</span> : null}
                      {o.ownerName ? <span className="ml-auto flex items-center gap-1"><User className="size-3" />{o.ownerName}</span> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {arr.length === 0 ? <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Καμία</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
