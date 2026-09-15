"use client";

import { useState, useTransition } from "react";
import { Lock, LockOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lockMonthAction, unlockMonthAction } from "@/app/actions/periods";

export function PeriodLockButton({ month, locked, canClose }: { month: string; locked: boolean; canClose: boolean }) {
  const [isLocked, setLocked] = useState(locked);
  const [pending, start] = useTransition();

  return (
    <Button
      variant={isLocked ? "outline" : "default"}
      disabled={pending || (!isLocked && !canClose)}
      data-testid="period-lock-btn"
      title={!isLocked && !canClose ? "Λύστε πρώτα τα εμπόδια του μήνα" : undefined}
      onClick={() =>
        start(async () => {
          const res = isLocked ? await unlockMonthAction(month) : await lockMonthAction(month);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          setLocked(res.locked);
          toast.success(res.locked ? `Ο μήνας ${month} κλείδωσε – δεν επιτρέπονται αναδρομικές αλλαγές.` : `Ο μήνας ${month} ξεκλείδωσε.`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : isLocked ? <LockOpen data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
      {isLocked ? "Ξεκλείδωμα μήνα" : "Κλείδωμα μήνα"}
    </Button>
  );
}
