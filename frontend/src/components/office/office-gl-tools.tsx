"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { officeEnableBooksAction, officeGenerateEntriesAction } from "@/app/actions/office-gl";

export function OfficeGlTools({ orgId, from, to, enabled, plan }: { orgId: string; from: string; to: string; enabled: boolean; plan: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<"elp" | "egls">((plan as "elp" | "egls") || "elp");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-2">
      {!enabled ? (
        <>
          <Select value={selected} onValueChange={(v) => setSelected(v as "elp" | "egls")}>
            <SelectTrigger className="w-56" data-testid="office-gl-plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elp">ΕΛΠ (Ν.4308/2014)</SelectItem>
              <SelectItem value="egls">ΕΓΛΣ (Π.Δ.1123/1980)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await officeEnableBooksAction(orgId, selected);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`Ενεργοποιήθηκαν τα διπλογραφικά · ${res.created} λογαριασμοί`);
                router.refresh();
              })
            }
            data-testid="office-gl-enable"
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Ενεργοποίηση διπλογραφικών
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await officeGenerateEntriesAction(orgId, from, to);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(res.created ? `${res.created} άρθρα δημιουργήθηκαν` : "Δεν βρέθηκαν νέα παραστατικά για άρθρα");
              router.refresh();
            })
          }
          data-testid="office-gl-generate"
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />} Δημιουργία άρθρων από παραστατικά
        </Button>
      )}
    </div>
  );
}
