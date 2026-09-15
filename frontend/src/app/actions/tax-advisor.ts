"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireContext, updateOrg } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/services/audit";
import { upsertDecision, decideRuleReview, listRuleReviews, type OpportunityStatus, type RuleReviewStatus } from "@/lib/services/tax-advisor";
import { normalizeTaxProfile, type TaxProfile } from "@/lib/tax/engine";
import { TAX_RULES } from "@/lib/tax/knowledge-base";

export async function saveTaxProfileAction(input: Partial<TaxProfile>): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const ctx = await requireContext(db);
  if (!can(ctx.role, "write")) return { ok: false, error: "Δεν έχετε δικαίωμα τροποποίησης." };
  await updateOrg(db, ctx.org.id, { taxProfileJson: JSON.stringify(normalizeTaxProfile(input)) });
  revalidatePath("/advisor");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function decideOpportunityAction(input: {
  ruleCode: string;
  title: string;
  estimatedBenefit: number;
  status: OpportunityStatus;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const ctx = await requireContext(db);
  if (!can(ctx.role, "write")) return { ok: false, error: "Δεν έχετε δικαίωμα για αυτή την ενέργεια." };
  const actor = { id: ctx.user.id, name: (ctx.user as { name?: string; email?: string }).name ?? (ctx.user as { email?: string }).email ?? "Χρήστης" };
  await upsertDecision(db, ctx.org.id, input, actor);
  await audit(db, ctx.org.id, "tax_opportunity", input.ruleCode, `advisor_${input.status}`, input.title + (input.note ? ` — ${input.note}` : ""), actor);
  revalidatePath("/advisor");
  revalidatePath("/dashboard");
  revalidatePath("/office/advisor");
  return { ok: true };
}

export async function reviewRuleAction(input: { ruleCode: string; status: RuleReviewStatus; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const taxYear = new Date().getFullYear();
  const actor = { id: user.id, name: (user as { name?: string; email?: string }).name ?? (user as { email?: string }).email ?? "Χρήστης" };
  await decideRuleReview(db, { ruleCode: input.ruleCode, status: input.status, note: input.note, taxYear }, actor);
  revalidatePath("/office/kb-review");
  return { ok: true };
}

/** Χειροκίνητος επανέλεγχος βάσης γνώσης: σημειώνει για αλλαγή τους κανόνες παλαιότερου έτους. */
export async function refreshKbReviewAction(): Promise<{ ok: boolean; flagged?: number; error?: string }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const year = new Date().getFullYear();
  const reviews = await listRuleReviews(db, year);
  let flagged = 0;
  for (const r of TAX_RULES) {
    if (!reviews.has(r.code) && r.taxYear < year) {
      await decideRuleReview(
        db,
        { ruleCode: r.code, status: "needs_change", note: `Χειροκίνητος επανέλεγχος: ο κανόνας αφορά έτος ${r.taxYear} — επιβεβαιώστε ισχύ για ${year}.`, taxYear: year },
        { id: "system", name: "Χειροκίνητος επανέλεγχος" },
      );
      flagged++;
    }
  }
  revalidatePath("/office/kb-review");
  return { ok: true, flagged };
}
