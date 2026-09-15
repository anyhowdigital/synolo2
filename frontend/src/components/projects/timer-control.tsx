"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { startTimer, stopTimer } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Task = { id: string; name: string };

export function TimerControl({
  projectId,
  tasks,
  runningEntry,
}: {
  projectId: string;
  tasks: Task[];
  runningEntry: { id: string; startedAt: string; description: string; taskId: string | null } | null;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState<string>("none");
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!runningEntry) {
      setElapsed(0);
      return;
    }
    const start = new Date(runningEntry.startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runningEntry]);

  const format = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  if (runningEntry) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:bg-emerald-950/40">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-600" />
          <div>
            <div className="font-mono text-2xl tabular-nums font-semibold text-emerald-700 dark:text-emerald-300" data-testid="timer-elapsed">
              {format(elapsed)}
            </div>
            <div className="text-xs text-muted-foreground">{runningEntry.description || "Καταμέτρηση χρόνου σε εξέλιξη…"}</div>
          </div>
        </div>
        <div className="ml-auto">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            data-testid="stop-timer-btn"
            onClick={() => {
              startTransition(async () => {
                const res = await stopTimer(runningEntry.id);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success("Ο χρόνος καταχωρήθηκε.");
                  router.refresh();
                }
              });
            }}
          >
            <Square className="size-4" /> Στοπ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:items-center">
      <Input
        placeholder="Τι δουλεύεις τώρα;"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="md:flex-1"
        data-testid="timer-description-input"
      />
      <Select value={taskId} onValueChange={setTaskId}>
        <SelectTrigger className="md:w-56" data-testid="timer-task-select">
          <SelectValue placeholder="Εργασία (προαιρετικό)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— χωρίς εργασία —</SelectItem>
          {tasks.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        disabled={pending}
        data-testid="start-timer-btn"
        onClick={() => {
          startTransition(async () => {
            const res = await startTimer(projectId, taskId, description);
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("Ο timer ξεκίνησε.");
              setDescription("");
              router.refresh();
            }
          });
        }}
      >
        <Play className="size-4" /> Έναρξη
      </Button>
    </div>
  );
}
