import { CalendarCheck, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/invoice/totals";
import { CONFIDENCE_LABELS, type PaymentPrediction } from "@/lib/services/payment-prediction";

/** Αναμενόμενη ημερομηνία είσπραξης ενός παραστατικού, βάσει ιστορικού συνέπειας του πελάτη. */
export function PaymentForecastNote({ prediction, dueDate }: { prediction: PaymentPrediction; dueDate: string | null }) {
  const late = prediction.daysAfterDue > 0 || prediction.overdueShift;
  const Icon = late ? CalendarClock : CalendarCheck;
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${late ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"}`}
      data-testid="payment-forecast-note"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="size-4" /> Αναμενόμενη πληρωμή {formatDate(prediction.expectedDate)}
        </span>
        <Badge variant={prediction.confidence === "high" ? "default" : "secondary"} data-testid="payment-forecast-confidence">
          {CONFIDENCE_LABELS[prediction.confidence]}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {prediction.samples === 0
          ? `Χωρίς ιστορικό πληρωμών – χρησιμοποιείται η προθεσμία ${dueDate ? formatDate(dueDate) : "του παραστατικού"}.`
          : prediction.overdueShift
            ? `Η αναμενόμενη ημερομηνία έχει περάσει. Ο πελάτης πληρώνει κατά μέσο όρο ${prediction.daysAfterDue} ημέρες μετά τη λήξη (${prediction.samples} παραστατικά, ${prediction.onTimeRatio}% εντός προθεσμίας).`
            : prediction.daysAfterDue > 0
              ? `Ο πελάτης πληρώνει συνήθως ${prediction.daysAfterDue} ημέρες μετά την προθεσμία (${prediction.samples} παραστατικά, ${prediction.onTimeRatio}% εντός προθεσμίας).`
              : `Ο πελάτης πληρώνει εντός προθεσμίας (${prediction.samples} παραστατικά, ${prediction.onTimeRatio}% συνέπεια).`}
      </p>
    </div>
  );
}
