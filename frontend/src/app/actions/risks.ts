"use server";

import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { riskReport, saveRiskSnapshot } from "@/lib/services/risks";

export type RiskAdvice = { ok: true; advice: { summary: string; steps: string[]; prevention: string; law: string } } | { ok: false; error: string };

/** Ζητά από το AI (Claude Sonnet) οδηγίες επίλυσης για ένα εύρημα συμμόρφωσης. */
export async function riskAdviceAction(code: string): Promise<RiskAdvice> {
  const db = await getDb();
  const { org } = await requireContext(db);
  const report = await riskReport(db, org);
  const finding = report.findings.find((f) => f.code === code);
  if (!finding) return { ok: false, error: "Το εύρημα δεν υπάρχει πλέον – ανανεώστε τη σελίδα." };

  const payload = {
    org_name: org.name,
    org_activity: org.activity ?? "",
    mydata_environment: org.mydataEnvironment,
    finding: {
      code: finding.code,
      title: finding.title,
      severity: finding.severity,
      count: finding.count,
      amount: finding.amount ?? null,
      why: finding.why,
      legal: finding.legal,
      samples: finding.samples,
    },
    score: report.score,
  };

  try {
    const resp = await fetch("http://127.0.0.1:8001/api/copilot/risk-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return { ok: false, error: `Το AI δεν απάντησε (${resp.status}): ${(await resp.text()).slice(0, 200)}` };
    const data = await resp.json();
    return { ok: true, advice: data.advice };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Ξαναϋπολογίζει και αποθηκεύει στιγμιότυπο σκορ (χρησιμοποιείται από το κουμπί «Επανέλεγχος»). */
export async function recheckRisksAction(): Promise<{ ok: true; score: number } | { ok: false; error: string }> {
  const db = await getDb();
  const { org } = await requireContext(db);
  const report = await riskReport(db, org);
  await saveRiskSnapshot(db, org.id, report);
  return { ok: true, score: report.score };
}
