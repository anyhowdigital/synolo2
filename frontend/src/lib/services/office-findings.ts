import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { docRequests, officeTasks } from "@/db/schema";
import type { FirmClient } from "@/lib/services/firm";
import { clientAlerts, type ClientAlert } from "@/lib/services/client-alerts";
import { orgWatch, type OrgWatch } from "@/lib/services/org-watch";

export type FindingSource = "books" | "mydata" | "deadline" | "risk" | "anomaly" | "task" | "doc";
export type FindingSeverity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  source: FindingSource;
  code: string;
  title: string;
  detail: string;
  severity: FindingSeverity;
  orgId: string;
  orgName: string;
  /** Σελίδα γραφείου όπου διορθώνεται/εξετάζεται. */
  href: string;
  /** Deep link στην επιχείρηση (ανοίγει με ενεργό οργανισμό μέσω /office/open). */
  openHref?: string;
  /** Μαζική ενέργεια με προεπιλεγμένο πελάτη. */
  fixHref?: string;
  canFix: boolean;
}

export const SOURCE_LABEL: Record<FindingSource, string> = {
  books: "Βιβλία",
  mydata: "myDATA",
  deadline: "Προθεσμία",
  risk: "Κίνδυνος ΑΑΔΕ",
  anomaly: "Ανωμαλία",
  task: "Εκκρεμότητα",
  doc: "Έγγραφα",
};

export const SEVERITY_LABEL: Record<FindingSeverity, string> = { high: "Κρίσιμο", medium: "Προσοχή", low: "Παρατήρηση" };

const open = (orgId: string, to: string) => `/office/open?org=${orgId}&to=${encodeURIComponent(to)}`;

function entityHref(orgId: string, a: ClientAlert): string | undefined {
  if (!a.entity) return undefined;
  if (a.entity.type === "invoice") return open(orgId, `/invoices/${a.entity.id}`);
  if (a.entity.type === "expense") return open(orgId, "/expenses");
  if (a.entity.type === "payment") return open(orgId, "/banking");
  if (a.entity.type === "bank") return open(orgId, "/banking?tab=reconcile");
  return undefined;
}

function fromAlert(c: FirmClient, a: ClientAlert, canWrite: boolean): Finding {
  const isMydata = a.code.startsWith("mydata_");
  return {
    id: `${a.code}-${c.org.id}-${a.entity?.id ?? a.title}`,
    source: isMydata ? "mydata" : "books",
    code: a.code,
    title: a.title,
    detail: a.detail,
    severity: a.severity,
    orgId: c.org.id,
    orgName: c.org.name,
    href: `/office/alerts?org=${c.org.id}`,
    openHref: entityHref(c.org.id, a),
    fixHref: a.fixable ? `/office/bulk?org=${c.org.id}&action=${a.fixable}` : undefined,
    canFix: !!a.fixable && canWrite,
  };
}

function fromWatch(c: FirmClient, w: OrgWatch): Finding[] {
  const out: Finding[] = [];
  if (w.nextDeadline && w.nextDeadline.daysLeft <= 10) {
    out.push({
      id: `deadline-${c.org.id}-${w.nextDeadline.date}`,
      source: "deadline",
      code: "deadline_soon",
      title: w.nextDeadline.label,
      detail: `Λήγει σε ${w.nextDeadline.daysLeft} ημέρες (${w.nextDeadline.date})`,
      severity: w.nextDeadline.daysLeft <= 3 ? "high" : "medium",
      orgId: c.org.id,
      orgName: c.org.name,
      href: "/office/calendar",
      canFix: false,
    });
  }
  for (const f of w.topFindings.filter((f) => f.severity === "critical" || f.severity === "high")) {
    out.push({
      id: `risk-${c.org.id}-${f.title}`,
      source: "risk",
      code: "risk_finding",
      title: f.title,
      detail: `Σκορ κινδύνου ${w.score}/100${w.trend ? ` · τάση ${w.trend > 0 ? "+" : ""}${w.trend}` : ""}`,
      severity: f.severity === "critical" ? "high" : "medium",
      orgId: c.org.id,
      orgName: c.org.name,
      href: `/office/clients/${c.org.id}`,
      openHref: open(c.org.id, f.href ?? "/risks"),
      canFix: false,
    });
  }
  for (const a of w.anomalies.filter((a) => a.severity !== "low")) {
    out.push({
      id: `anomaly-${c.org.id}-${a.code}`,
      source: "anomaly",
      code: a.code,
      title: a.title,
      detail: `${a.detail} — ${a.action}`,
      severity: a.severity,
      orgId: c.org.id,
      orgName: c.org.name,
      href: `/office/clients/${c.org.id}`,
      openHref: open(c.org.id, a.href),
      canFix: false,
    });
  }
  return out;
}

export interface FindingsResult {
  findings: Finding[];
  watches: Map<string, OrgWatch>;
  alertsByOrg: Map<string, ClientAlert[]>;
}

/** Μία πηγή ευρημάτων για Ειδοποιήσεις, Λάθη & προσοχή, Cockpit και widgets. */
export async function collectFindings(db: Db, clients: FirmClient[], canWrite: (c: FirmClient) => boolean): Promise<FindingsResult> {
  const findings: Finding[] = [];
  const watches = new Map<string, OrgWatch>();
  const alertsByOrg = new Map<string, ClientAlert[]>();
  const orgIds = clients.map((c) => c.org.id);

  const per = await Promise.all(
    clients.map(async (c) => {
      const [alerts, watch, docs] = await Promise.all([
        clientAlerts(db, c.org),
        orgWatch(db, c.org),
        db.select().from(docRequests).where(and(eq(docRequests.orgId, c.org.id), eq(docRequests.status, "open"))),
      ]);
      return { c, alerts, watch, docs };
    }),
  );
  for (const { c, alerts, watch, docs } of per) {
    watches.set(c.org.id, watch);
    alertsByOrg.set(c.org.id, alerts);
    const w = canWrite(c);
    for (const a of alerts) findings.push(fromAlert(c, a, w));
    findings.push(...fromWatch(c, watch));
    if (docs.length) {
      findings.push({
        id: `doc-${c.org.id}`,
        source: "doc",
        code: "doc_requests_open",
        title: `${docs.length} ανοιχτά αιτήματα εγγράφων`,
        detail: "Ο πελάτης δεν έχει ανεβάσει όλα τα δικαιολογητικά",
        severity: "low",
        orgId: c.org.id,
        orgName: c.org.name,
        href: "/office/documents",
        canFix: false,
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const tasks = orgIds.length ? await db.select().from(officeTasks).where(and(inArray(officeTasks.orgId, orgIds), eq(officeTasks.status, "open"))) : [];
  for (const t of tasks.filter((t) => t.dueDate && t.dueDate < today)) {
    const c = clients.find((x) => x.org.id === t.orgId);
    findings.push({
      id: `task-${t.id}`,
      source: "task",
      code: "task_overdue",
      title: t.title,
      detail: `Εκπρόθεσμη από ${t.dueDate}`,
      severity: "high",
      orgId: t.orgId,
      orgName: c?.org.name ?? "—",
      href: `/office/tasks?org=${t.orgId}`,
      canFix: false,
    });
  }

  const order: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.orgName.localeCompare(b.orgName, "el"));
  return { findings, watches, alertsByOrg };
}

export function countBySeverity(findings: Finding[]) {
  return { high: findings.filter((f) => f.severity === "high").length, medium: findings.filter((f) => f.severity === "medium").length, low: findings.filter((f) => f.severity === "low").length };
}
