"use client";

import { useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adjustStock, deleteProduct } from "@/app/actions/products";
import { Button } from "@/components/ui/button";

export function StockButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const adjust = (delta: number) =>
    start(async () => {
      const res = await adjustStock(id, delta);
      if (!res.ok) toast.error(res.error);
    });
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="outline" size="icon-xs" disabled={pending} onClick={() => adjust(-1)} aria-label="Μείωση">
        <Minus />
      </Button>
      <Button variant="outline" size="icon-xs" disabled={pending} onClick={() => adjust(1)} aria-label="Αύξηση">
        <Plus />
      </Button>
    </span>
  );
}

export function DeleteProductButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive"
      disabled={pending}
      aria-label="Διαγραφή"
      onClick={() =>
        start(async () => {
          const res = await deleteProduct(id);
          if (res.ok) toast.success("Το είδος διαγράφηκε.");
          else toast.warning(res.error);
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
