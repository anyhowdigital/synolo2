"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewRuleAction } from "@/app/actions/tax-advisor";

export function KbReviewActions({ ruleCode, status }: { ruleCode: string; status: "approved" | "needs_change" | "none" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const decide = (s: "approved" | "needs_change") =>
    start(async () => {
      const res = await reviewRuleAction({ ruleCode, status: s, note: s === "needs_change" ? note : "" });
      if (res.ok) {
        toast.success(s === "approved" ? "Εγκρίθηκε (sign-off)" : "Σημειώθηκε για αλλαγή");
        setOpen(false);
        setNote("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Σφάλμα");
      }
    });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant={status === "approved" ? "secondary" : "outline"} disabled={pending} onClick={() => decide("approved")} data-testid={`kb-approve-${ruleCode}`}>
        Έγκριση (sign-off)
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen((o) => !o)} data-testid={`kb-flag-${ruleCode}`}>
        Χρειάζεται αλλαγή
      </Button>
      {open ? (
        <div className="flex w-full items-center gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Σημείωση αλλαγής (π.χ. νέος συντελεστής/όριο)" data-testid={`kb-note-${ruleCode}`} />
          <Button size="sm" disabled={pending || !note.trim()} onClick={() => decide("needs_change")} data-testid={`kb-flag-save-${ruleCode}`}>
            Καταχώρηση
          </Button>
        </div>
      ) : null}
    </div>
  );
}
