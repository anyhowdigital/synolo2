export type RecurringInterval = "weekly" | "monthly" | "quarterly" | "yearly";

export const INTERVAL_LABELS: Record<RecurringInterval, string> = {
  weekly: "Κάθε εβδομάδα",
  monthly: "Κάθε μήνα",
  quarterly: "Κάθε τρίμηνο",
  yearly: "Κάθε έτος",
};
