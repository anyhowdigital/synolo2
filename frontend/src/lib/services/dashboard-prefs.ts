export const DASHBOARD_WIDGETS: readonly { key: string; label: string; side?: boolean; full?: boolean }[] = [
  { key: "actions", label: "Κέντρο ενεργειών", side: true },
  { key: "quick", label: "Γρήγορες ενέργειες", side: true },
  { key: "risks", label: "Radar κινδύνων ΑΑΔΕ", side: true },
  { key: "chart12m", label: "Έσοδα, έξοδα & εισπράξεις 12μήνου", full: true },
  { key: "forecast", label: "Πρόβλεψη ρευστότητας 90 ημερών", full: true },
  { key: "vat", label: "Θέση ΦΠΑ τριμήνου" },
  { key: "aging", label: "Ενηλικίωση απαιτήσεων" },
  { key: "top", label: "Κορυφαίοι πελάτες" },
  { key: "subs", label: "Συνδρομές πελατών" },
  { key: "recent", label: "Πρόσφατα παραστατικά", full: true },
  { key: "tasks", label: "Εκκρεμείς εργασίες & αποθέματα" },
] as const;

export type DashboardWidgetKey = string;

export interface DashboardPrefs {
  hidden: DashboardWidgetKey[];
  order: DashboardWidgetKey[];
}

const ALL = DASHBOARD_WIDGETS.map((w) => w.key) as DashboardWidgetKey[];

export function parseDashboardPrefs(json: string | null | undefined): DashboardPrefs {
  let hidden: DashboardWidgetKey[] = [];
  let order: DashboardWidgetKey[] = [];
  try {
    const raw = JSON.parse(json || "{}") as Partial<DashboardPrefs>;
    hidden = (raw.hidden ?? []).filter((k): k is DashboardWidgetKey => ALL.includes(k as DashboardWidgetKey));
    order = (raw.order ?? []).filter((k): k is DashboardWidgetKey => ALL.includes(k as DashboardWidgetKey));
  } catch {
    /* προεπιλογές */
  }
  const merged = [...order, ...ALL.filter((k) => !order.includes(k))];
  return { hidden, order: merged };
}

/** Σειρά εμφάνισης μόνο για τα ορατά πλαίσια της κύριας κολόνας ή της πλαϊνής. */
export function visibleWidgets(prefs: DashboardPrefs, side: boolean) {
  return prefs.order
    .map((key) => DASHBOARD_WIDGETS.find((w) => w.key === key)!)
    .filter((w) => !!w && !prefs.hidden.includes(w.key) && !!w.side === side);
}
