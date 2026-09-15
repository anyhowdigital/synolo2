"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoiceLateChargesAction } from "@/app/actions/late-charges";

export function LateChargesButton({ invoiceId }: { invoiceId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-2 w-full"
      disabled={pending}
      data-testid="invoice-late-charges-btn"
      onClick={() =>
        start(async () => {
          const res = await invoiceLateChargesAction(invoiceId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(res.message);
          router.push(`/invoices/${res.id}`);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Έκδοση παραστατικού επιβαρύνσεων
    </Button>
  );
}
