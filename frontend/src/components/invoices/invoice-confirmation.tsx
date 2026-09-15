"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface InvoiceConfirmationContext { companyName: string; documentLabel: string; customerName: string | null; total: string }

export function InvoiceConfirmation({ open, onOpenChange, context, title, description, confirmLabel, onConfirm, destructive = false, pending = false, testId }: { open: boolean; onOpenChange: (open: boolean) => void; context: InvoiceConfirmationContext; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void; destructive?: boolean; pending?: boolean; testId: string }) {
  const backRef = useRef<HTMLButtonElement>(null);
  return <Dialog open={open} onOpenChange={(value) => { if (!pending) onOpenChange(value); }}><DialogContent className="max-h-[85dvh] overflow-y-auto" data-testid={`${testId}-dialog`} onOpenAutoFocus={(event) => { event.preventDefault(); backRef.current?.focus(); }}><DialogHeader><DialogTitle data-testid={`${testId}-title`}>{title}</DialogTitle><DialogDescription className="whitespace-pre-line text-sm leading-relaxed" data-testid={`${testId}-consequences`}>{description}</DialogDescription></DialogHeader><dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm" data-testid={`${testId}-context`}>{[["Επιχείρηση", context.companyName], ["Παραστατικό", context.documentLabel], ["Πελάτης", context.customerName || "Λιανική — χωρίς πελάτη"], ["Πληρωτέο", context.total]].map(([label, value], i) => <div key={label} className="grid gap-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium [overflow-wrap:anywhere]" data-testid={`${testId}-context-${i}`}>{value}</dd></div>)}</dl><DialogFooter><Button ref={backRef} type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending} data-testid={`${testId}-back`}>Πίσω — καμία αλλαγή</Button><Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm} data-testid={`${testId}-confirm`}>{confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}

export function issuanceNotice({ quote, autoTransmit, environment, autoB2G }: { quote: boolean; autoTransmit: boolean; environment: string; autoB2G?: boolean }) {
  if (quote) return "Θα αποδοθεί αριθμός και η προσφορά θα εκδοθεί. Δεν θα διαβιβαστεί σε myDATA ή B2G και δεν θα κινηθεί απόθεμα.";
  const target = environment === "prod" ? "παραγωγή" : environment === "dev" ? "δοκιμαστικό περιβάλλον" : "προσομοίωση — χωρίς πραγματική υποβολή";
  return `Θα αποδοθεί ο επόμενος αριθμός της σειράς και θα ενημερωθεί το απόθεμα όπου εφαρμόζεται. Μετά την έκδοση δεν μπορείτε να επεξεργαστείτε το παραστατικό ως πρόχειρο.\n${autoTransmit ? `Θα επιχειρηθεί αυτόματη διαβίβαση myDATA (${target}).` : "Δεν θα γίνει αυτόματη διαβίβαση myDATA. Θα την επιλέξετε χωριστά."}${autoB2G ? "\nΕίναι ενεργή και η αυτόματη αποστολή B2G. Θα επιχειρηθεί σύμφωνα με τις ρυθμίσεις παρόχου και τους ελέγχους του παραστατικού." : ""}`;
}
