"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  addActivity,
  toggleActivityDone,
  type ActionResult,
} from "@/app/actions/customers";
import type { CustomerActivity } from "@/db/schema";
import { formatDate } from "@/lib/invoice/totals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const KIND_META: Record<string, { label: string; icon: typeof Phone }> = {
  call: { label: "Τηλεφώνημα", icon: Phone },
  email: { label: "Email", icon: Mail },
  meeting: { label: "Συνάντηση", icon: Users },
  note: { label: "Σημείωση", icon: StickyNote },
  task: { label: "Εργασία", icon: CalendarClock },
};

export function ActivityPanel({
  customerId,
  activities,
  readOnly = false,
}: {
  customerId: string;
  activities: CustomerActivity[];
  readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(addActivity, null);
  const [kind, setKind] = useState("note");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("Η ενέργεια καταχωρήθηκε.");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {readOnly ? null : (
        <form
          ref={formRef}
          action={action}
          className="rounded-lg border bg-muted/30 p-3"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="kind" value={kind} />
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              name="content"
              rows={2}
              required
              placeholder="Τι συζητήθηκε / τι πρέπει να γίνει…"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            {kind === "task" ? (
              <div className="grid gap-1">
                <Label htmlFor="dueAt" className="text-xs">
                  Προθεσμία
                </Label>
                <Input
                  id="dueAt"
                  name="dueAt"
                  type="date"
                  className="h-8 w-44"
                />
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <MessageSquare data-icon="inline-start" />
              )}
              Καταχώρηση
            </Button>
          </div>
        </form>
      )}

      {activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Δεν υπάρχει ιστορικό επικοινωνίας ακόμη.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l pl-5">
          {activities.map((a) => {
            const meta = KIND_META[a.kind] ?? KIND_META.note;
            const Icon = meta.icon;
            const overdue =
              a.kind === "task" &&
              !a.done &&
              a.dueAt &&
              new Date(a.dueAt) < new Date();
            return (
              <li key={a.id} className="relative">
                <span className="absolute -left-[29px] flex size-6 items-center justify-center rounded-full border bg-background">
                  <Icon className="size-3 text-muted-foreground" />
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {meta.label} · {formatDate(a.createdAt)}
                      {a.dueAt ? (
                        <span
                          className={cn(
                            "ml-2",
                            overdue ? "font-medium text-red-600" : "",
                          )}
                        >
                          Προθεσμία {formatDate(a.dueAt)}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 text-sm",
                        a.kind === "task" && a.done
                          ? "text-muted-foreground line-through"
                          : "",
                      )}
                    >
                      {a.content}
                    </p>
                  </div>
                  {a.kind === "task" && !readOnly ? (
                    <Button
                      variant={a.done ? "secondary" : "outline"}
                      size="xs"
                      onClick={() => toggleActivityDone(a.id, customerId)}
                      title={a.done ? "Σήμανση ως ανοιχτή" : "Ολοκλήρωση"}
                    >
                      <Check data-icon="inline-start" />
                      {a.done ? "Έγινε" : "Ολοκλήρωση"}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
