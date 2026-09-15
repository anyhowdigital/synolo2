import { and, eq, gte, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { invoices, memberships, type Organization } from "@/db/schema";
import { CAPABILITY_LABELS, hasCapability, minimumPlanFor, planInvoiceLimit, planUserLimit, type Capability } from "./plans";

type OrgWithOverrides = Pick<Organization, "plan"> & { overridesJson?: string | null };
type OrgOverride = { capabilities?: Partial<Record<Capability, boolean>>; invoiceLimit?: number | null; userLimit?: number | null };

function orgOverride(org: OrgWithOverrides): OrgOverride {
  try {
    return org.overridesJson ? (JSON.parse(org.overridesJson) as OrgOverride) : {};
  } catch {
    return {};
  }
}

export class PlanFeatureError extends Error {
  constructor(
    public capability: Capability,
    message: string,
  ) {
    super(message);
    this.name = "PlanFeatureError";
  }
}

export function orgHasFeature(org: OrgWithOverrides, cap: Capability) {
  const caps = orgOverride(org).capabilities;
  if (caps && cap in caps) return !!caps[cap];
  return hasCapability(org.plan, cap);
}

export function featureBlockedMessage(org: OrgWithOverrides, cap: Capability): string | null {
  if (orgHasFeature(org, cap)) return null;
  const min = minimumPlanFor(cap);
  return `Η δυνατότητα «${CAPABILITY_LABELS[cap]}» περιλαμβάνεται από το πακέτο ${min.name} (${min.monthlyPrice} €/μήνα). Αναβαθμίστε από τη σελίδα «Συνδρομή».`;
}

/** Πετάει PlanFeatureError αν το πακέτο της επιχείρησης δεν περιλαμβάνει τη δυνατότητα. */
export function assertFeature(org: OrgWithOverrides, cap: Capability) {
  const msg = featureBlockedMessage(org, cap);
  if (msg) throw new PlanFeatureError(cap, msg);
}

export const TRIAL_INVOICE_LIMIT = 50;

export function trialExpired(org: Organization) {
  return org.plan === "trial" && !!org.trialEndsAt && new Date(org.trialEndsAt) < new Date();
}

export function subscriptionBlocked(org: Organization) {
  if (trialExpired(org)) return "Η δοκιμαστική περίοδος έληξε. Επιλέξτε πακέτο από τη σελίδα «Συνδρομή» για να συνεχίσετε την έκδοση παραστατικών.";
  if (org.planStatus === "cancelled") return "Η συνδρομή έχει ακυρωθεί. Ενεργοποιήστε ξανά πακέτο από τη σελίδα «Συνδρομή».";
  if (org.planStatus === "past_due") return "Η πληρωμή της συνδρομής εκκρεμεί. Ενημερώστε τον τρόπο πληρωμής στη σελίδα «Συνδρομή».";
  return null;
}

export function monthlyInvoiceLimit(org: Organization): number | null {
  const ov = orgOverride(org);
  if (ov.invoiceLimit !== undefined) return ov.invoiceLimit;
  return planInvoiceLimit(org.plan);
}

export async function issuedThisMonth(db: Db, orgId: string) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), ne(invoices.status, "draft"), gte(invoices.issueDate, `${monthKey}-01`), ne(invoices.invoiceType, "QUOTE")));
  return Number(row?.n ?? 0);
}

/** Έλεγχος πριν την έκδοση: ενεργή συνδρομή και όριο παραστατικών του πακέτου. */
export async function assertCanIssue(db: Db, org: Organization) {
  const blocked = subscriptionBlocked(org);
  if (blocked) throw new Error(blocked);
  const limit = monthlyInvoiceLimit(org);
  if (limit === null) return;
  const used = await issuedThisMonth(db, org.id);
  if (used >= limit) {
    throw new Error(`Συμπληρώσατε το όριο των ${limit} παραστατικών/μήνα του πακέτου σας. Αναβαθμίστε από τη σελίδα «Συνδρομή».`);
  }
}

export async function assertCanAddUser(db: Db, org: Organization) {
  const ov = orgOverride(org);
  const limit = ov.userLimit !== undefined ? ov.userLimit : planUserLimit(org.plan);
  if (limit === null) return;
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(memberships).where(eq(memberships.orgId, org.id));
  if (Number(row?.n ?? 0) >= limit) {
    throw new Error(`Το πακέτο σας επιτρέπει έως ${limit} χρήστες. Αναβαθμίστε για να προσκαλέσετε περισσότερους.`);
  }
}
