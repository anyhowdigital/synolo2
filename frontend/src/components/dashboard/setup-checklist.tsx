import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { DismissibleAlert } from "@/components/dismissible-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SetupStep {
  key: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

/** Λίστα πρώτων βημάτων για νέο συνδρομητή. Κρύβεται όταν ολοκληρωθούν όλα. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);
  return (
    <DismissibleAlert storageKey={`setup-checklist-${done}`} className="mb-6">
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Rocket className="size-4 text-primary" /> Ξεκινήστε με το Σύνολο ERP
          </CardTitle>
          <CardDescription>
            {done} από {steps.length} βήματα ολοκληρώθηκαν. Όσο πιο πλήρη τα στοιχεία, τόσο πιο σωστά τα παραστατικά και η διαβίβαση στο myDATA.
          </CardDescription>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    "group flex items-start gap-2.5 rounded-lg border bg-background p-3 text-sm transition-colors hover:border-primary/40",
                    s.done ? "opacity-70" : "",
                  )}
                  aria-disabled={s.done}
                >
                  {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium", s.done ? "line-through" : "")}>{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                  </span>
                  {!s.done ? <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </DismissibleAlert>
  );
}
