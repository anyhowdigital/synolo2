import { and, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { bankTransactions, docRequests, expenses, firmFeeCharges, officeTasks } from "@/db/schema";
import { orgWatch } from "@/lib/services/org-watch";
import { taxDeadlines } from "@/lib/services/compliance";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { profitSummary } from "@/lib/services/profitability";
import { clientAlerts } from "@/lib/services/client-alerts";
import { round2 } from "@/lib/invoice/totals";
import type { FirmClient, FirmContext } from "@/lib/services/firm";

export type WidgetId =
  | "risk_clients"
  | "client_errors"
  | "deadlines"
  | "bank_unmatched"
  | "tasks_sla"
  | "ai_plan"
  | "fees"
  | "doc_requests"
  | "team_load"
  | "profitability";

export interface WidgetDef {
  id: WidgetId;
  title: string;
  description: string;
  defaultSize: "sm" | "md" | "lg";
}

export const WIDGETS: WidgetDef[] = [
  { id: "client_errors", title: "Λάθη & προσοχή", description: "Παρατυπίες στα βιβλία των πελατών", defaultSize: "md" },
  { id: "risk_clients", title: "Πελάτες σε κίνδυνο", description: "Σκορ συμμόρφωσης & κρίσιμα ευρήματα", defaultSize: "md" },
  { id: "deadlines", title: "Προθεσμίες ΦΠΑ/myDATA", description: "Αντίστροφη μέτρηση ανά πελάτη", defaultSize: "md" },
  { id: "bank_unmatched", title: "Ασυμφώνητες τραπεζικές", description: "Κινήσεις προς συμφωνία ανά πελάτη", defaultSize: "sm" },
  { id: "tasks_sla", title: "Εκκρεμότητες & SLA", description: "Ανοιχτές και εκπρόθεσμες εργασίες", defaultSize: "sm" },
  { id: "ai_plan", title: "AI πλάνο ημέρας", description: "Σύντομη σύνοψη προτεραιοτήτων", defaultSize: "sm" },
  { id: "fees", title: "Αμοιβές", description: "Χρεώσεις μήνα & εξοφλήσεις", defaultSize: "sm" },
  { id: "doc_requests", title: "Αιτήματα εγγράφων", description: "Ανοιχτά αιτήματα προς πελάτες", defaultSize: "sm" },
  { id: "team_load", title: "Φόρτος ομάδας", description: "Εκκρεμότητες ανά συνεργάτη", defaultSize: "md" },
  { id: "profitability", title: "Κερδοφορία πελατών", description: "Μεικτό περιθώριο μήνα ανά πελάτη", defaultSize: "md" },
];

export const DEFAULT_WIDGETS: { id: WidgetId; size: "sm" | "md" | "lg" }[] = [
  { id: "client_errors", size: "md" },
  { id: "risk_clients", size: "md" },
  { id: "deadlines", size: "md" },
  { id: "bank_unmatched", size: "sm" },
  { id: "tasks_sla", size: "sm" },
  { id: "doc_requests", size: "sm" },
  { id: "fees", size: "sm" },
];

export interface WidgetRow {
  label: string;
  value: string;
  href?: string;
  severity?: "high" | "medium" | "low";
}

export interface WidgetData {
  id: WidgetId;
  headline: string;
  rows: WidgetRow[];
  empty: string;
}

const monthKey = () => new Date().toISOString().slice(0, 7);

/** Υπολογίζει τα δεδομένα των επιλεγμένων widgets για τους πελάτες του γραφείου. */
export async function buildWidgets(db: Db, firm: FirmContext, clients: FirmClient[], ids: WidgetId[]): Promise<Record<string, WidgetData>> {
  const out: Record<string, WidgetData> = {};
  const orgIds = clients.map((c) => c.org.id);
  const need = new Set(ids);

  if (need.has("client_errors")) {
    const rows = await Promise.all(clients.map(async (c) => ({ c, a: await clientAlerts(db, c.org) })));
    const flat = rows.flatMap(({ c, a }) => a.map((x) => ({ c, x })));
    out.client_errors = {
      id: "client_errors",
      headline: `${flat.length} ευρήματα · ${flat.filter((f) => f.x.severity === "high").length} κρίσιμα`,
      rows: flat
        .sort((a, b) => (a.x.severity === b.x.severity ? 0 : a.x.severity === "high" ? -1 : 1))
        .slice(0, 7)
        .map(({ c, x }) => ({ label: `${c.org.name}: ${x.title}`, value: x.severity === "high" ? "κρίσιμο" : x.severity === "medium" ? "προσοχή" : "—", href: `/office/alerts?org=${c.org.id}`, severity: x.severity })),
      empty: "Κανένα λάθος στα βιβλία των πελατών.",
    };
  }

  if (need.has("risk_clients")) {
    const watches = await Promise.all(clients.map(async (c) => ({ c, w: await orgWatch(db, c.org) })));
    const risky = watches.filter((x) => x.w.level !== "green").sort((a, b) => a.w.score - b.w.score);
    out.risk_clients = {
      id: "risk_clients",
      headline: `${risky.length} από ${clients.length} πελάτες χρειάζονται προσοχή`,
      rows: risky.slice(0, 6).map((x) => ({ label: x.c.org.name, value: `σκορ ${x.w.score}`, href: `/office/clients/${x.c.org.id}`, severity: x.w.level === "red" ? "high" : "medium" })),
      empty: "Όλοι οι πελάτες είναι σε καλή κατάσταση.",
    };
  }

  if (need.has("deadlines")) {
    const items = clients
      .flatMap((c) => taxDeadlines(c.org).items.filter((d) => d.days >= 0 && d.days <= 20).map((d) => ({ c, d })))
      .sort((a, b) => a.d.days - b.d.days);
    out.deadlines = {
      id: "deadlines",
      headline: `${items.length} προθεσμίες στις επόμενες 20 ημέρες`,
      rows: items.slice(0, 7).map(({ c, d }) => ({ label: `${c.org.name} · ${d.title}`, value: `σε ${d.days} ημ.`, href: `/office/clients/${c.org.id}`, severity: d.days <= 3 ? "high" : d.days <= 7 ? "medium" : "low" })),
      empty: "Καμία προθεσμία στις επόμενες 20 ημέρες.",
    };
  }

  if (need.has("bank_unmatched")) {
    const rows = orgIds.length ? await db.select().from(bankTransactions).where(and(inArray(bankTransactions.orgId, orgIds), eq(bankTransactions.status, "unmatched"))) : [];
    const byOrg = clients.map((c) => ({ c, n: rows.filter((r) => r.orgId === c.org.id).length })).filter((x) => x.n > 0);
    out.bank_unmatched = {
      id: "bank_unmatched",
      headline: `${rows.length} κινήσεις προς συμφωνία`,
      rows: byOrg.slice(0, 6).map((x) => ({ label: x.c.org.name, value: `${x.n}`, href: "/office/banking", severity: x.n > 20 ? "high" : "medium" })),
      empty: "Όλες οι τραπεζικές κινήσεις είναι συμφωνημένες.",
    };
  }

  if (need.has("tasks_sla")) {
    const tasks = orgIds.length ? await db.select().from(officeTasks).where(and(inArray(officeTasks.orgId, orgIds), eq(officeTasks.status, "open"))) : [];
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today);
    out.tasks_sla = {
      id: "tasks_sla",
      headline: `${tasks.length} ανοιχτές · ${overdue.length} εκπρόθεσμες`,
      rows: overdue.slice(0, 6).map((t) => ({ label: t.title, value: t.dueDate ?? "", href: "/office/tasks", severity: "high" as const })),
      empty: "Καμία εκπρόθεσμη εκκρεμότητα.",
    };
  }

  if (need.has("ai_plan")) {
    const [pending, drafts] = await Promise.all([
      Promise.all(clients.map(async (c) => ({ c, n: (await listPendingTransmissions(db, c.org.id)).length }))),
      orgIds.length ? db.select().from(expenses).where(and(inArray(expenses.orgId, orgIds), eq(expenses.status, "draft"))) : Promise.resolve([]),
    ]);
    const rows: WidgetRow[] = pending
      .filter((p) => p.n > 0)
      .slice(0, 4)
      .map((p) => ({ label: `${p.c.org.name}: διαβίβαση myDATA`, value: `${p.n}`, href: `/office/clients/${p.c.org.id}`, severity: "high" as const }));
    if (drafts.length) rows.push({ label: "Αχαρακτήριστα έξοδα", value: `${drafts.length}`, href: "/office/vat", severity: "medium" });
    out.ai_plan = {
      id: "ai_plan",
      headline: rows.length ? "Προτεραιότητες σήμερα" : "Δεν εντοπίστηκαν επείγοντα",
      rows,
      empty: "Ανοίξτε τον AI Βοηθό για πλήρες πλάνο ημέρας.",
    };
  }

  if (need.has("fees")) {
    const charges = await db.select().from(firmFeeCharges).where(and(eq(firmFeeCharges.firmUserId, firm.firmUserId), eq(firmFeeCharges.month, monthKey())));
    const unpaid = charges.filter((c) => c.status !== "paid");
    out.fees = {
      id: "fees",
      headline: `${round2(charges.reduce((s, c) => s + c.amount, 0))} € χρεώσεις μήνα · ${unpaid.length} ανεξόφλητες`,
      rows: unpaid.slice(0, 6).map((c) => ({ label: clients.find((x) => x.org.id === c.orgId)?.org.name ?? "—", value: `${round2(c.amount)} €`, href: "/office/fees", severity: "medium" as const })),
      empty: "Όλες οι αμοιβές του μήνα είναι εξοφλημένες.",
    };
  }

  if (need.has("doc_requests")) {
    const reqs = orgIds.length ? await db.select().from(docRequests).where(and(inArray(docRequests.orgId, orgIds), eq(docRequests.status, "open"))) : [];
    out.doc_requests = {
      id: "doc_requests",
      headline: `${reqs.length} ανοιχτά αιτήματα εγγράφων`,
      rows: reqs.slice(0, 6).map((r) => ({ label: `${clients.find((x) => x.org.id === r.orgId)?.org.name ?? "—"} · ${r.title || "Αίτημα"}`, value: `λήγει ${r.expiresAt.slice(0, 10)}`, href: "/office/documents", severity: "low" as const })),
      empty: "Δεν υπάρχουν ανοιχτά αιτήματα.",
    };
  }

  if (need.has("team_load")) {
    const tasks = orgIds.length ? await db.select().from(officeTasks).where(and(inArray(officeTasks.orgId, orgIds), eq(officeTasks.status, "open"))) : [];
    const counts = new Map<string, number>();
    for (const t of tasks) counts.set(t.assigneeUserId ?? "unassigned", (counts.get(t.assigneeUserId ?? "unassigned") ?? 0) + 1);
    out.team_load = {
      id: "team_load",
      headline: `${tasks.length} εκκρεμότητες σε ${counts.size} συνεργάτες`,
      rows: [...counts.entries()].map(([k, n]) => ({ label: k === "unassigned" ? "Χωρίς ανάθεση" : k === firm.firmUserId ? "Εγώ" : "Συνεργάτης", value: `${n}`, href: "/office/productivity", severity: k === "unassigned" && n > 0 ? "medium" : "low" })),
      empty: "Καμία ανοιχτή εκκρεμότητα.",
    };
  }

  if (need.has("profitability")) {
    const month = monthKey();
    const period = { from: `${month}-01`, to: new Date(new Date(`${month}-01T00:00:00Z`).getUTCFullYear(), new Date(`${month}-01T00:00:00Z`).getUTCMonth() + 1, 0).toISOString().slice(0, 10) };
    const rows = await Promise.all(clients.map(async (c) => ({ c, p: await profitSummary(db, c.org.id, period) })));
    out.profitability = {
      id: "profitability",
      headline: `${round2(rows.reduce((s, r) => s + r.p.grossProfit, 0))} € συνολικό μεικτό κέρδος πελατών`,
      rows: rows
        .sort((a, b) => b.p.grossProfit - a.p.grossProfit)
        .slice(0, 6)
        .map((r) => ({ label: r.c.org.name, value: `${r.p.grossMarginPercent}% · ${round2(r.p.grossProfit)} €`, href: `/office/clients/${r.c.org.id}`, severity: r.p.grossMarginPercent < 10 ? "medium" : "low" })),
      empty: "Δεν υπάρχουν πωλήσεις στον τρέχοντα μήνα.",
    };
  }

  return out;
}

/** Βοηθητικό: επόμενες ημερομηνίες λήξης χρεώσεων (χρησιμοποιείται από ειδοποιήσεις). */
export async function overdueChargeCount(db: Db, firmUserId: string) {
  const rows = await db
    .select()
    .from(firmFeeCharges)
    .where(and(eq(firmFeeCharges.firmUserId, firmUserId), eq(firmFeeCharges.status, "unpaid"), lte(firmFeeCharges.month, monthKey())));
  return rows.length;
}
