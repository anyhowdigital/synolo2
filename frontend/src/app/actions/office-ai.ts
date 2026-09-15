"use server";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses, invoices, officeTasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveFirm, firmClients } from "@/lib/services/firm";
import { orgWatch } from "@/lib/services/org-watch";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { round2 } from "@/lib/invoice/totals";

export interface OfficeBrief {
  summary: string;
  todayActions: { title: string; clientName: string; why: string; priority: "high" | "medium" | "low" }[];
  perClient: { clientName: string; headline: string; actions: string[] }[];
}

export type BriefResult = { ok: true; brief: OfficeBrief } | { ok: false; error: string };

/** Σύνοψη ημέρας για όλο το γραφείο μέσω Claude (μόνο με τα πραγματικά δεδομένα των πελατών). */
export async function officeBriefAction(instruction = ""): Promise<BriefResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { ok: false, error: "Ο λογαριασμός δεν ανήκει σε λογιστικό γραφείο." };

  const clients = await firmClients(db, firm);
  if (!clients.length) return { ok: false, error: "Δεν έχετε ακόμη συνεργαζόμενες επιχειρήσεις." };

  const orgIds = clients.map((c) => c.org.id);
  const tasks = await db.select().from(officeTasks).where(and(inArray(officeTasks.orgId, orgIds), eq(officeTasks.status, "open")));

  const payload = [];
  for (const c of clients) {
    const [watch, pending, drafts, open] = await Promise.all([
      orgWatch(db, c.org),
      listPendingTransmissions(db, c.org.id),
      db.select().from(expenses).where(and(eq(expenses.orgId, c.org.id), eq(expenses.status, "draft"))),
      db.select().from(invoices).where(and(eq(invoices.orgId, c.org.id), inArray(invoices.status, ["issued", "partially_paid"]))),
    ]);
    payload.push({
      client_name: c.org.name,
      afm: c.org.afm,
      risk_score: watch.score,
      risk_trend: watch.trend,
      critical_findings: watch.topFindings.map((f) => f.title),
      anomalies: watch.anomalies.map((a) => a.title),
      next_deadline: watch.nextDeadline ? { label: watch.nextDeadline.label, days_left: watch.nextDeadline.daysLeft } : null,
      pending_mydata: pending.length,
      unclassified_expenses: drafts.length,
      receivables: round2(open.reduce((s, i) => s + Math.max(0, i.totalGrossValue - i.paidAmount), 0)),
      open_tasks: tasks.filter((t) => t.orgId === c.org.id).map((t) => ({ title: t.title, severity: t.severity, due_date: t.dueDate })),
    });
  }

  try {
    const resp = await fetch("http://127.0.0.1:8001/api/copilot/office-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firm_name: firm.firmName, current_date: new Date().toISOString().slice(0, 10), instruction, clients: payload }),
    });
    if (!resp.ok) return { ok: false, error: `Το AI δεν απάντησε (${resp.status}).` };
    const data = await resp.json();
    const b = data.brief ?? {};
    return {
      ok: true,
      brief: {
        summary: String(b.summary ?? ""),
        todayActions: Array.isArray(b.today_actions)
          ? b.today_actions.slice(0, 12).map((a: Record<string, unknown>) => ({
              title: String(a.title ?? ""),
              clientName: String(a.client_name ?? ""),
              why: String(a.why ?? ""),
              priority: (a.priority as "high" | "medium" | "low") ?? "medium",
            }))
          : [],
        perClient: Array.isArray(b.per_client)
          ? b.per_client.slice(0, 30).map((c: Record<string, unknown>) => ({
              clientName: String(c.client_name ?? ""),
              headline: String(c.headline ?? ""),
              actions: Array.isArray(c.actions) ? (c.actions as unknown[]).map(String).slice(0, 5) : [],
            }))
          : [],
      },
    };
  } catch (err) {
    return { ok: false, error: `Αποτυχία επικοινωνίας με το AI: ${(err as Error).message}` };
  }
}
