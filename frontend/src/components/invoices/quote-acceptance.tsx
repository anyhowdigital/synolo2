import { CheckCircle2, XCircle } from "lucide-react";
import type { Invoice } from "@/db/schema";
import { cn } from "@/lib/utils";

/** Αποτύπωση της ηλεκτρονικής αποδοχής/απόρριψης προσφοράς (όνομα, χρόνος, IP, υπογραφή). */
export function QuoteAcceptanceRecord({ invoice, className, showIp = false }: { invoice: Invoice; className?: string; showIp?: boolean }) {
  if (!invoice.acceptedAt && !invoice.decisionNote) return null;
  const accepted = invoice.status === "accepted" || invoice.status === "converted";
  const rejected = invoice.status === "rejected";
  const Icon = accepted ? CheckCircle2 : XCircle;
  return (
    <div className={cn("rounded-lg border p-3 text-sm", accepted ? "border-emerald-200 bg-emerald-50/60" : rejected ? "border-red-200 bg-red-50/60" : "bg-muted/40", className)}>
      {invoice.acceptedAt ? (
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 size-4 shrink-0", accepted ? "text-emerald-600" : "text-red-600")} />
          <div>
            <div className="font-medium">
              {accepted ? "Αποδοχή" : "Απόρριψη"} από {invoice.acceptedByName || "τον πελάτη"}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(invoice.acceptedAt).toLocaleString("el-GR")}
              {showIp && invoice.acceptedIp ? ` · IP ${invoice.acceptedIp}` : ""}
              {" · ηλεκτρονικά, μέσω δημόσιου συνδέσμου"}
            </div>
          </div>
        </div>
      ) : null}
      {invoice.decisionNote ? <p className="mt-2 whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground">{invoice.decisionNote}</p> : null}
      {invoice.acceptedSignature && accepted ? (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted-foreground">Υπογραφή</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={invoice.acceptedSignature} alt={`Υπογραφή ${invoice.acceptedByName ?? ""}`} className="h-20 max-w-full rounded border bg-white object-contain" />
        </div>
      ) : null}
    </div>
  );
}
