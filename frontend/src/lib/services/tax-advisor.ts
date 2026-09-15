import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import type { Db } from "@/db";
import { officeTasks, taxOpportunities, taxRuleReviews, type Organization, type TaxOpportunity, type TaxRuleReview } from "@/db/schema";
import { round2 } from "@/lib/invoice/totals";
import { profitSummary } from "@/lib/services/profitability";
import { vatReport, agingReport, quarterPeriod } from "@/lib/services/reports";
import { dashboardStats } from "@/lib/services/invoices";
import { advancedDashboard } from "@/lib/services/dashboard";
import { listEmployees } from "@/lib/services/payroll";
import { accountBalances } from "@/lib/services/banking";
import { firmTeam, type FirmClient, type FirmContext } from "@/lib/services/firm";
import { computeOpportunities, parseTaxProfile, type Financials, type Opportunity, type TaxProfile } from "@/lib/tax/engine";

export type OpportunityStatus = "new" | "applied" | "dismissed";
export type DecoratedOpportunity = Opportunity & {
  status: OpportunityStatus;
  note: string;
  decidedAt: string | null;
  decidedByName: string | null;
};

export interface TaxAdvisorResult {
  profile: TaxProfile;
  financials: Financials;
  /** Όλες οι ευκαιρίες (με status απόφασης) — για τη σελίδα Συμβούλου. */
  opportunities: DecoratedOpportunity[];
  /** Ενεργές (μη-απορριφθείσες) — για dashboard/insight/office. */
  active: DecoratedOpportunity[];
  totalBenefit: number;
}

/** Χάρτης αποφάσεων (ανά ruleCode) για έναν οργανισμό. */
export async function loadDecisions(db: Db, orgId: string): Promise<Map<string, TaxOpportunity>> {
  const rows = await db.select().from(taxOpportunities).where(eq(taxOpportunities.orgId, orgId));
  return new Map(rows.map((r) => [r.ruleCode, r]));
}

/** Ορχηστρωτής Συμβούλου: προφίλ + οικονομικά τρέχοντος έτους → ευκαιρίες (με αποφάσεις). */
export async function taxAdvisor(db: Db, org: Organization): Promise<TaxAdvisorResult> {
  const profile = parseTaxProfile(org.taxProfileJson);
  const year = new Date().getFullYear();
  const period = { from: `${year}-01-01`, to: `${year}-12-31` };
  const summary = await profitSummary(db, org.id, period);
  const financials: Financials = {
    year,
    grossRevenue: summary.sales,
    expenses: round2(summary.cogs + summary.expenseNet),
    netProfit: summary.netProfit,
  };
  const raw = computeOpportunities(profile, financials);
  const decisions = await loadDecisions(db, org.id);
  const opportunities: DecoratedOpportunity[] = raw.map((o) => {
    const d = decisions.get(o.ruleCode);
    return { ...o, status: (d?.status as OpportunityStatus) ?? "new", note: d?.note ?? "", decidedAt: d?.decidedAt ?? null, decidedByName: d?.decidedByName ?? null };
  });
  const active = opportunities.filter((o) => o.status !== "dismissed");
  const totalBenefit = round2(active.reduce((s, o) => s + Math.max(0, o.estimatedBenefit), 0));
  return { profile, financials, opportunities, active, totalBenefit };
}

/** Καταχώρηση/ενημέρωση απόφασης για μια ευκαιρία (apply/dismiss/reset). */
export async function upsertDecision(
  db: Db,
  orgId: string,
  input: { ruleCode: string; title: string; estimatedBenefit: number; status: OpportunityStatus; note?: string },
  actor?: { id: string; name: string } | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.query.taxOpportunities.findFirst({ where: and(eq(taxOpportunities.orgId, orgId), eq(taxOpportunities.ruleCode, input.ruleCode)) });
  if (input.status === "new") {
    if (existing) await db.delete(taxOpportunities).where(eq(taxOpportunities.id, existing.id));
    return;
  }
  if (existing) {
    await db.update(taxOpportunities).set({ status: input.status, title: input.title, estimatedBenefit: input.estimatedBenefit, note: input.note ?? "", decidedBy: actor?.id ?? null, decidedByName: actor?.name ?? null, decidedAt: now, updatedAt: now }).where(eq(taxOpportunities.id, existing.id));
  } else {
    await db.insert(taxOpportunities).values({ id: randomUUID(), orgId, ruleCode: input.ruleCode, title: input.title, estimatedBenefit: input.estimatedBenefit, status: input.status, note: input.note ?? "", decidedBy: actor?.id ?? null, decidedByName: actor?.name ?? null, decidedAt: now, createdAt: now, updatedAt: now });
  }
}

/**
 * Πλήρες «business snapshot» για grounding του AI Συμβούλου: αντλεί ό,τι υπάρχει για την
 * επιχείρηση από τις υπάρχουσες υπηρεσίες (όπως το dashboard), με ασφαλές fallback ανά τμήμα.
 */
export async function businessSnapshot(db: Db, org: Organization): Promise<Record<string, unknown>> {
  const year = new Date().getFullYear();
  const period = { from: `${year}-01-01`, to: `${year}-12-31` };
  const prevPeriod = { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const [profitNow, profitPrev, vat, aging, stats, advanced, employees, balances] = await Promise.all([
    safe(() => profitSummary(db, org.id, period)),
    safe(() => profitSummary(db, org.id, prevPeriod)),
    safe(() => vatReport(db, org.id, quarterPeriod())),
    safe(() => agingReport(db, org.id)),
    safe(() => dashboardStats(db, org.id)),
    safe(() => advancedDashboard(db, org)),
    safe(() => listEmployees(db, org.id)),
    safe(() => accountBalances(db, org.id)),
  ]);

  const emp = employees ?? [];
  const monthlyPayroll = round2(emp.reduce((s, e) => s + Number((e as Record<string, unknown>).grossSalary ?? (e as Record<string, unknown>).salary ?? 0), 0));
  let cashTotal = 0;
  if (balances) {
    try {
      for (const b of (balances as Map<string, { balance?: number }>).values()) cashTotal += Number(b.balance ?? 0);
    } catch {
      /* ignore */
    }
  }

  const company = {
    name: org.name,
    legalName: org.legalName,
    afm: org.afm,
    doy: org.doy,
    activity: org.activity,
    booksCategory: org.booksCategory,
    accountingPlan: org.accountingPlan,
    mydataEnvironment: org.mydataEnvironment,
    plan: org.plan,
    iban: org.iban ? "set" : "",
  };

  const snapshot: Record<string, unknown> = {
    company,
    profitCurrentYear: profitNow,
    profitPreviousYear: profitPrev,
    vatQuarter: vat,
    aging,
    dashboardStats: stats,
    advanced,
    payroll: { employees: emp.length, estimatedMonthlyGross: monthlyPayroll },
    cashBalancesTotal: round2(cashTotal),
  };

  // Φράγμα μεγέθους: αν το JSON είναι πολύ μεγάλο, αφαιρούμε τα βαρύτερα λεπτομερή τμήματα.
  if (JSON.stringify(snapshot).length > 14000) {
    delete snapshot.aging;
    delete snapshot.advanced;
  }
  return snapshot;
}

export interface FirmClientScan {
  orgId: string;
  name: string;
  afm: string;
  totalBenefit: number;
  count: number;
  top?: { title: string; estimatedBenefit: number; legalBasis: string };
}

/** Σάρωση όλων των πελατών του γραφείου για νόμιμες ευκαιρίες εξοικονόμησης (multi-client). */
export async function firmTaxScan(db: Db, clients: FirmClient[]): Promise<{ clients: FirmClientScan[]; firmTotal: number }> {
  const results = await Promise.all(
    clients.map(async (c): Promise<FirmClientScan> => {
      try {
        const { active, totalBenefit } = await taxAdvisor(db, c.org);
        const top = active.find((o) => o.estimatedBenefit > 0) ?? active[0];
        return {
          orgId: c.org.id,
          name: c.org.name,
          afm: c.org.afm,
          totalBenefit,
          count: active.length,
          top: top ? { title: top.title, estimatedBenefit: top.estimatedBenefit, legalBasis: top.legalBasis } : undefined,
        };
      } catch {
        return { orgId: c.org.id, name: c.org.name, afm: c.org.afm, totalBenefit: 0, count: 0 };
      }
    }),
  );
  results.sort((a, b) => b.totalBenefit - a.totalBenefit);
  const firmTotal = round2(results.reduce((s, r) => s + r.totalBenefit, 0));
  return { clients: results, firmTotal };
}

// ---------------- Benchmarking χαρτοφυλακίου γραφείου ----------------
export interface FirmBenchmark {
  peerCount: number;
  legalFormLabel: string;
  target: { effTaxRatePct: number; benefitRatioPct: number; netProfit: number };
  peerMedian: { effTaxRatePct: number; benefitRatioPct: number };
  benefitRank: number; // 1 = υψηλότερος λόγος οφέλους
  benefitTotal: number; // πλήθος πελατών στην κατάταξη
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : round2((a[mid - 1] + a[mid]) / 2);
}

/**
 * Συγκρίνει έναν πελάτη με τους υπόλοιπους πελάτες του γραφείου ίδιας νομικής μορφής:
 * αποτελεσματικός φορολογικός συντελεστής (φόρος/κέρδος) και λόγος δυνητικού οφέλους/κέρδος.
 * Πλήρως data-grounded στο χαρτοφυλάκιο του γραφείου (όχι επινοημένα εξωτερικά στοιχεία).
 */
export async function firmBenchmark(db: Db, clients: FirmClient[], targetOrgId: string): Promise<FirmBenchmark | null> {
  const { taxForecast } = await import("@/lib/tax/engine");
  const { LEGAL_FORM_LABELS } = await import("@/lib/tax/engine");
  const rows = await Promise.all(
    clients.map(async (c) => {
      try {
        const { profile, financials, totalBenefit } = await taxAdvisor(db, c.org);
        if (financials.netProfit <= 0) return null;
        const fc = taxForecast(profile, financials);
        return {
          orgId: c.org.id,
          legalForm: profile.legalForm,
          netProfit: financials.netProfit,
          effTaxRate: fc.projectedTax / financials.netProfit,
          benefitRatio: totalBenefit / financials.netProfit,
        };
      } catch {
        return null;
      }
    }),
  );
  const valid = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  const target = valid.find((r) => r.orgId === targetOrgId);
  if (!target) return null;

  let peers = valid.filter((r) => r.legalForm === target.legalForm);
  if (peers.length < 3) peers = valid; // πολύ λίγοι ομοειδείς → όλο το χαρτοφυλάκιο
  const byBenefit = [...valid].sort((a, b) => b.benefitRatio - a.benefitRatio);
  const benefitRank = byBenefit.findIndex((r) => r.orgId === targetOrgId) + 1;

  return {
    peerCount: peers.length,
    legalFormLabel: target.legalForm ? LEGAL_FORM_LABELS[target.legalForm as Exclude<typeof target.legalForm, "">] ?? "όλες οι μορφές" : "όλες οι μορφές",
    target: { effTaxRatePct: Math.round(target.effTaxRate * 1000) / 10, benefitRatioPct: Math.round(target.benefitRatio * 1000) / 10, netProfit: target.netProfit },
    peerMedian: {
      effTaxRatePct: Math.round(median(peers.map((p) => p.effTaxRate)) * 1000) / 10,
      benefitRatioPct: Math.round(median(peers.map((p) => p.benefitRatio)) * 1000) / 10,
    },
    benefitRank,
    benefitTotal: valid.length,
  };
}

// ---------------- Παραγωγικότητα Συμβούλου (ανάθεση/ολοκλήρωση ανά συνεργάτη) ----------------
export interface AdvisorProductivityRow {
  userId: string;
  name: string;
  role: string;
  assigned: number;
  open: number;
  done: number;
  lockedBenefit: number;
}
export interface AdvisorProductivity {
  perMember: AdvisorProductivityRow[];
  totals: { assigned: number; open: number; done: number; lockedBenefit: number };
}

const UNASSIGNED = "__none__";

/** Συγκεντρωτικά ανά συνεργάτη: ανατεθειμένες/ανοιχτές/ολοκληρωμένες ευκαιρίες + κλειδωμένο όφελος. */
export async function advisorProductivity(db: Db, firm: FirmContext, clients: FirmClient[]): Promise<AdvisorProductivity> {
  const team = await firmTeam(db, firm);
  const clientIds = clients.map((c) => c.org.id);

  const benefitByOrg = new Map<string, Map<string, number>>();
  await Promise.all(
    clients.map(async (c) => {
      try {
        const { opportunities } = await taxAdvisor(db, c.org);
        benefitByOrg.set(c.org.id, new Map(opportunities.map((o) => [o.ruleCode, o.estimatedBenefit])));
      } catch {
        benefitByOrg.set(c.org.id, new Map());
      }
    }),
  );

  const tasks = clientIds.length
    ? await db
        .select()
        .from(officeTasks)
        .where(and(inArray(officeTasks.orgId, clientIds), like(officeTasks.code, "advisor:%")))
    : [];

  const map = new Map<string, AdvisorProductivityRow>();
  for (const m of team) map.set(m.userId, { userId: m.userId, name: m.name, role: m.role, assigned: 0, open: 0, done: 0, lockedBenefit: 0 });

  for (const t of tasks) {
    const key = t.assigneeUserId && map.has(t.assigneeUserId) ? t.assigneeUserId : t.assigneeUserId || UNASSIGNED;
    if (!map.has(key)) map.set(key, { userId: key, name: key === UNASSIGNED ? "Χωρίς ανάθεση" : "Άγνωστος", role: "staff", assigned: 0, open: 0, done: 0, lockedBenefit: 0 });
    const agg = map.get(key)!;
    agg.assigned++;
    const rule = t.code.slice("advisor:".length);
    const benefit = benefitByOrg.get(t.orgId)?.get(rule) ?? 0;
    if (t.status === "done") {
      agg.done++;
      agg.lockedBenefit = round2(agg.lockedBenefit + Math.max(0, benefit));
    } else {
      agg.open++;
    }
  }

  const perMember = Array.from(map.values()).filter((a) => a.assigned > 0 || team.some((m) => m.userId === a.userId));
  const totals = perMember.reduce(
    (s, a) => ({ assigned: s.assigned + a.assigned, open: s.open + a.open, done: s.done + a.done, lockedBenefit: round2(s.lockedBenefit + a.lockedBenefit) }),
    { assigned: 0, open: 0, done: 0, lockedBenefit: 0 },
  );
  return { perMember, totals };
}

export type RuleReviewStatus = "approved" | "needs_change";

export async function listRuleReviews(db: Db, taxYear: number): Promise<Map<string, TaxRuleReview>> {
  const rows = await db.select().from(taxRuleReviews).where(eq(taxRuleReviews.taxYear, taxYear));
  return new Map(rows.map((r) => [r.ruleCode, r]));
}

export async function decideRuleReview(
  db: Db,
  input: { ruleCode: string; status: RuleReviewStatus; note?: string; taxYear: number },
  actor?: { id: string; name: string } | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.query.taxRuleReviews.findFirst({ where: and(eq(taxRuleReviews.ruleCode, input.ruleCode), eq(taxRuleReviews.taxYear, input.taxYear)) });
  if (existing) {
    await db.update(taxRuleReviews).set({ status: input.status, note: input.note ?? "", reviewedBy: actor?.id ?? null, reviewedByName: actor?.name ?? null, reviewedAt: now }).where(eq(taxRuleReviews.id, existing.id));
  } else {
    await db.insert(taxRuleReviews).values({ id: randomUUID(), ruleCode: input.ruleCode, taxYear: input.taxYear, status: input.status, note: input.note ?? "", reviewedBy: actor?.id ?? null, reviewedByName: actor?.name ?? null, reviewedAt: now, createdAt: now });
  }
}
