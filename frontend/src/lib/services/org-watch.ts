import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db";
import type { Organization } from "@/db/schema";
import { riskSnapshots } from "@/db/schema";
import { riskReport } from "@/lib/services/risks";
import { detectAnomalies, type Anomaly } from "@/lib/services/anomalies";
import { taxDeadlines } from "@/lib/services/compliance";

export interface OrgWatch {
  orgId: string;
  orgName: string;
  score: number;
  level: "red" | "amber" | "green";
  trend: number;
  criticalCount: number;
  topFindings: { title: string; severity: string; href?: string }[];
  anomalies: Anomaly[];
  nextDeadline: { label: string; date: string; daysLeft: number } | null;
  priority: number;
}

/** Early-warning ανά επιχείρηση για το cockpit του λογιστή: σκορ, τάση, ανωμαλίες, επόμενη προθεσμία. */
export async function orgWatch(db: Db, org: Organization): Promise<OrgWatch> {
  const [report, anomalies, prev] = await Promise.all([
    riskReport(db, org),
    detectAnomalies(db, org),
    db
      .select()
      .from(riskSnapshots)
      .where(and(eq(riskSnapshots.orgId, org.id), gte(riskSnapshots.day, new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))))
      .orderBy(desc(riskSnapshots.day))
      .limit(30),
  ]);

  const oldest = prev.length ? prev[prev.length - 1] : null;
  const trend = oldest ? report.score - oldest.score : 0;
  const deadlines = taxDeadlines(org);
  const next = deadlines.items.filter((d) => d.days >= 0).sort((a, b) => a.days - b.days)[0] ?? null;

  const criticalCount = report.findings.filter((f) => f.severity === "critical").length;
  const highAnomalies = anomalies.filter((a) => a.severity === "high").length;
  // Προτεραιότητα φόρτου: χαμηλό σκορ + κρίσιμα + ανωμαλίες + κοντινή προθεσμία
  const priority = Math.round((100 - report.score) + criticalCount * 12 + highAnomalies * 10 + (next && next.days <= 10 ? 15 : 0) + (trend < -5 ? 10 : 0));

  return {
    orgId: org.id,
    orgName: org.name,
    score: report.score,
    level: report.level,
    trend,
    criticalCount,
    topFindings: report.findings.slice(0, 3).map((f) => ({ title: f.title, severity: f.severity, href: f.href })),
    anomalies,
    nextDeadline: next ? { label: next.title, date: next.date, daysLeft: next.days } : null,
    priority,
  };
}
