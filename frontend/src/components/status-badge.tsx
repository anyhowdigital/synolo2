import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Πρόχειρο", className: "bg-muted text-muted-foreground" },
  issued: { label: "Εκδοθέν", className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  partially_paid: { label: "Μερική είσπραξη", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Εξοφλημένο", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Ακυρωμένο", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  accepted: { label: "Αποδεκτή", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Απορρίφθηκε", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  converted: { label: "Τιμολογήθηκε", className: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
};

/** Καταστάσεις παραστατικών με σύντομη επεξήγηση (για λεζάντα στη λίστα). */
export const INVOICE_STATUS_LABELS: Record<string, { label: string; className: string; help: string }> = {
  draft: { ...INVOICE_STATUS.draft, help: "Δεν έχει αριθμό ούτε φορολογική ισχύ· μπορεί να αλλάξει ή να διαγραφεί." },
  issued: { ...INVOICE_STATUS.issued, help: "Εκδόθηκε με αριθμό· αναμένει είσπραξη." },
  partially_paid: { ...INVOICE_STATUS.partially_paid, help: "Έχει εισπραχθεί μέρος του ποσού." },
  paid: { ...INVOICE_STATUS.paid, help: "Εξοφλήθηκε πλήρως." },
  cancelled: { ...INVOICE_STATUS.cancelled, help: "Ακυρώθηκε (και στο myDATA αν είχε διαβιβαστεί)." },
  accepted: { ...INVOICE_STATUS.accepted, help: "Προσφορά που αποδέχθηκε ο πελάτης." },
  rejected: { ...INVOICE_STATUS.rejected, help: "Προσφορά που απορρίφθηκε." },
  converted: { ...INVOICE_STATUS.converted, help: "Προσφορά που μετατράπηκε σε παραστατικό." },
};

const EXPENSE_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Προς χαρακτηρισμό", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  classified: { label: "Χαρακτηρισμένο", className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  paid: { label: "Εξοφλημένο", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "Απορρίφθηκε", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export function ExpenseStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = EXPENSE_STATUS[status] ?? { label: status, className: "" };
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", s.className, className)}>
      {s.label}
    </Badge>
  );
}

const MYDATA_STATUS: Record<string, { label: string; className: string }> = {
  not_sent: { label: "Μη διαβιβασμένο", className: "bg-muted text-muted-foreground" },
  sent: { label: "Διαβιβάστηκε", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  error: { label: "Σφάλμα myDATA", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelled: { label: "Ακυρώθηκε στο myDATA", className: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
};

const STAGE: Record<string, { label: string; className: string }> = {
  lead: { label: "Lead", className: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  prospect: { label: "Υποψήφιος", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  customer: { label: "Πελάτης", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  inactive: { label: "Ανενεργός", className: "bg-muted text-muted-foreground" },
};

export function InvoiceStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = INVOICE_STATUS[status] ?? { label: status, className: "" };
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", s.className, className)}>
      {s.label}
    </Badge>
  );
}

export function MyDataStatusBadge({ status, mark, className }: { status: string; mark?: string | null; className?: string }) {
  const s = MYDATA_STATUS[status] ?? { label: status, className: "" };
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", s.className, className)} title={mark ? `MARK ${mark}` : undefined}>
      {s.label}
    </Badge>
  );
}

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  const s = STAGE[stage] ?? { label: stage, className: "" };
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", s.className, className)}>
      {s.label}
    </Badge>
  );
}

export const STAGE_OPTIONS = Object.entries(STAGE).map(([value, v]) => ({ value, label: v.label }));
