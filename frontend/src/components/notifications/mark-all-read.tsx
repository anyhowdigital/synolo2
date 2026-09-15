"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      data-testid="mark-all-read"
      onClick={() =>
        start(async () => {
          await markNotificationReadAction("all");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Σήμανση όλων ως αναγνωσμένων
    </Button>
  );
}
