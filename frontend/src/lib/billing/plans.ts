export type PlanId = "trial" | "starter" | "pro" | "business";

/** Δυνατότητες που ελέγχονται πραγματικά από τον κώδικα (feature gating). */
export type Capability =
  | "inventory" // παρακολούθηση αποθέματος
  | "crm" // pipeline, εργασίες, ιστορικό επαφών
  | "recurring" // επαναλαμβανόμενα παραστατικά
  | "excelExport" // Excel βιβλίων για λογιστή (το CSV είναι για όλους)
  | "branches" // σειρές ανά υποκατάστημα (branch > 0)
  | "api" // API κλειδιά & webhooks
  | "accountingBridge" // ημερολόγιο ΕΛΠ
  | "mydataSync" // συμφωνία RequestTransmittedDocs / MyIncome
  | "onlinePayments" // πληρωμή από τη δημόσια σελίδα
  | "projects" // έργα & χρονοχρέωση
  | "pos" // ταμείο λιανικής
  | "banking"; // ταμείο & τράπεζες

export const CAPABILITY_LABELS: Record<Capability, string> = {
  inventory: "Αποθήκη & παρακολούθηση stock",
  crm: "CRM pipeline, εργασίες & ιστορικό επαφών",
  recurring: "Επαναλαμβανόμενα παραστατικά",
  excelExport: "Excel βιβλίων για λογιστή",
  branches: "Σειρές ανά υποκατάστημα",
  api: "API πρόσβαση & webhooks",
  accountingBridge: "Λογιστική γέφυρα ΕΛΠ",
  mydataSync: "Συμφωνία με ηλεκτρονικά βιβλία ΑΑΔΕ",
  onlinePayments: "Online πληρωμή παραστατικών",
  projects: "Έργα & χρονοχρέωση",
  pos: "Ταμείο λιανικής (POS)",
  banking: "Ταμείο & τράπεζες",
};

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  tagline: string;
  /** Μέγιστος αριθμός παραστατικών ανά μήνα (null = απεριόριστα). */
  invoiceLimit: number | null;
  userLimit: number | null;
  capabilities: Capability[];
  features: string[];
  highlighted?: boolean;
}

export const ALL_CAPABILITIES: Capability[] = ["inventory", "crm", "recurring", "excelExport", "branches", "api", "accountingBridge", "mydataSync", "onlinePayments", "projects", "pos", "banking"];

/** Overrides δυνατοτήτων/ορίων ανά πλάνο (super-admin), κρατούνται σε cache επιπέδου διεργασίας. */
export type PlanOverride = { capabilities?: Capability[]; invoiceLimit?: number | null; userLimit?: number | null };
export type PlatformPlanOverrides = Partial<Record<PlanId, PlanOverride>>;

export const TRIAL_DEFAULTS = { invoiceLimit: 50 as number | null, userLimit: 3 as number | null };

let _platformOverrides: PlatformPlanOverrides = {};
export function setPlatformPlanOverrides(ov: PlatformPlanOverrides) {
  _platformOverrides = ov ?? {};
}
export function getPlatformPlanOverrides(): PlatformPlanOverrides {
  return _platformOverrides;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 9,
    yearlyPrice: 90,
    tagline: "Για ελεύθερους επαγγελματίες και ατομικές επιχειρήσεις.",
    invoiceLimit: 50,
    userLimit: 1,
    capabilities: ["onlinePayments", "pos", "banking"],
    features: [
      "Έως 50 παραστατικά / μήνα, 1 χρήστης",
      "Όλοι οι τύποι παραστατικών myDATA & διαβίβαση στην ΑΑΔΕ",
      "Παρακρατήσεις, χαρτόσημο, ενδοκοινοτικά, δίγλωσσο PDF",
      "Πελατολόγιο & είδη (χωρίς stock και pipeline)",
      "Έξοδα από myDATA & χαρακτηρισμός, ΦΠΑ/Φ2 προσυμπλήρωση",
      "Δημόσια σελίδα πληρωμής, RF κωδικός, υπενθυμίσεις",
      "Εξαγωγή CSV, email υποστήριξη",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 24,
    yearlyPrice: 240,
    tagline: "Για μικρές επιχειρήσεις με απαιτήσεις CRM & αποθήκης.",
    invoiceLimit: 500,
    userLimit: 5,
    capabilities: ["onlinePayments", "inventory", "crm", "recurring", "excelExport", "mydataSync", "projects", "pos", "banking"],
    features: [
      "Έως 500 παραστατικά / μήνα, έως 5 χρήστες & ρόλοι",
      "Όλα του Starter",
      "Αποθήκη & παρακολούθηση stock",
      "CRM pipeline, εργασίες & ιστορικό επαφών",
      "Επαναλαμβανόμενα παραστατικά (συνδρομές πελατών)",
      "Excel βιβλίων για λογιστή (παραστατικά, ΦΠΑ, Φ2, Ε3, έξοδα)",
      "Συμφωνία με ηλεκτρονικά βιβλία ΑΑΔΕ (MyIncome / TransmittedDocs)",
    ],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 59,
    yearlyPrice: 590,
    tagline: "Για εταιρείες με υποκαταστήματα, λογιστήριο και διασυνδέσεις.",
    invoiceLimit: null,
    userLimit: null,
    capabilities: ALL_CAPABILITIES,
    features: [
      "Απεριόριστα παραστατικά & χρήστες",
      "Όλα του Pro",
      "Σειρές ανά υποκατάστημα (branch ID στο myDATA)",
      "API πρόσβαση & webhooks",
      "Λογιστική γέφυρα ΕΛΠ με παραμετροποιήσιμο σχέδιο λογαριασμών",
      "Προτεραιότητα στην υποστήριξη",
    ],
  },
];

export function getPlan(id: string): Plan | undefined {
  const base = PLANS.find((p) => p.id === id);
  if (!base) return undefined;
  const ov = _platformOverrides[base.id];
  if (!ov) return base;
  return {
    ...base,
    capabilities: ov.capabilities ?? base.capabilities,
    invoiceLimit: ov.invoiceLimit !== undefined ? ov.invoiceLimit : base.invoiceLimit,
    userLimit: ov.userLimit !== undefined ? ov.userLimit : base.userLimit,
  };
}

export function planLabel(id: string) {
  if (id === "trial") return "Δοκιμαστική περίοδος";
  return getPlan(id)?.name ?? id;
}

/** Στη δοκιμαστική περίοδο είναι διαθέσιμες όλες οι δυνατότητες (Business). */
export function planCapabilities(planId: string): Capability[] {
  if (planId === "trial") return _platformOverrides.trial?.capabilities ?? ALL_CAPABILITIES;
  return getPlan(planId)?.capabilities ?? [];
}

/** Όριο παραστατικών/μήνα του πλάνου (null = απεριόριστα), λαμβάνοντας υπόψη τα platform overrides. */
export function planInvoiceLimit(planId: string): number | null {
  if (planId === "trial") {
    const t = _platformOverrides.trial;
    return t && t.invoiceLimit !== undefined ? t.invoiceLimit : TRIAL_DEFAULTS.invoiceLimit;
  }
  return getPlan(planId)?.invoiceLimit ?? null;
}

/** Όριο χρηστών του πλάνου (null = απεριόριστα), λαμβάνοντας υπόψη τα platform overrides. */
export function planUserLimit(planId: string): number | null {
  if (planId === "trial") {
    const t = _platformOverrides.trial;
    return t && t.userLimit !== undefined ? t.userLimit : TRIAL_DEFAULTS.userLimit;
  }
  return getPlan(planId)?.userLimit ?? null;
}

export function hasCapability(planId: string, cap: Capability) {
  return planCapabilities(planId).includes(cap);
}

/** Το φθηνότερο πακέτο που περιλαμβάνει τη δυνατότητα – για μηνύματα αναβάθμισης. */
export function minimumPlanFor(cap: Capability): Plan {
  return PLANS.find((p) => p.capabilities.includes(cap)) ?? PLANS[PLANS.length - 1];
}
