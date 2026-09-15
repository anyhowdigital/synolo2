import { and, asc, eq, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { customers, invoices, organizations, recurringTemplates, type Organization, type RecurringTemplate } from "@/db/schema";
import { hasCapability } from "@/lib/billing/plans";
import { getDocumentType } from "@/lib/greek/document-types";
import { emailInvoice } from "./invoice-email";
import { getInvoiceWithLines, issueInvoice, linesToDraft, saveDraft, transmitToMyData, type InvoiceLineDraft } from "./invoices";

import { type RecurringInterval } from "./recurring-labels";
import { notify } from "./notifications";

export { INTERVAL_LABELS, type RecurringInterval } from "./recurring-labels";

export function advance(dateIso: string, interval: RecurringInterval): string {
  const d = new Date(dateIso);
  switch (interval) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

export interface TemplateInput {
  name: string;
  customerId: string;
  seriesId: string;
  paymentMethod: number;
  notes: string;
  interval: RecurringInterval;
  nextRunAt: string;
  autoIssue: boolean;
  autoTransmit: boolean;
  autoEmail: boolean;
  autoCharge?: boolean;
  lines: InvoiceLineDraft[];
}
export async function listTemplates(db: Db, orgId: string) {
  return db
    .select({ template: recurringTemplates, customerName: customers.name })
    .from(recurringTemplates)
    .leftJoin(customers, eq(customers.id, recurringTemplates.customerId))
    .where(eq(recurringTemplates.orgId, orgId))
    .orderBy(asc(recurringTemplates.nextRunAt));
}

export async function saveTemplate(db: Db, orgId: string, input: TemplateInput, id?: string) {
  if (input.lines.length === 0) throw new Error("Το πρότυπο χρειάζεται τουλάχιστον μία γραμμή.");
  const record = {
    orgId,
    name: input.name,
    customerId: input.customerId,
    seriesId: input.seriesId,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    linesJson: JSON.stringify(input.lines),
    interval: input.interval,
    nextRunAt: input.nextRunAt,
    autoIssue: input.autoIssue,
    autoTransmit: input.autoTransmit,
    autoEmail: input.autoEmail,
    autoCharge: input.autoCharge ?? false,
  };
  if (id) {
    await db.update(recurringTemplates).set(record).where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)));
    return id;
  }
  const newId = randomUUID();
  await db.insert(recurringTemplates).values({ id: newId, ...record, active: true, runCount: 0, createdAt: new Date().toISOString() });
  return newId;
}

/** Δημιουργία προτύπου από υπάρχον παραστατικό. */
export async function templateFromInvoice(db: Db, org: Organization, invoiceId: string, interval: RecurringInterval, nextRunAt: string, name?: string) {
  const inv = await getInvoiceWithLines(db, org.id, invoiceId);
  if (!inv) throw new Error("Το παραστατικό δεν βρέθηκε.");
  if (!inv.customerId) throw new Error("Τα επαναλαμβανόμενα παραστατικά απαιτούν πελάτη.");
  if (getDocumentType(inv.invoiceType).kind !== "invoice") throw new Error("Μόνο τιμολόγια/αποδείξεις μπορούν να γίνουν επαναλαμβανόμενα.");
  return saveTemplate(db, org.id, {
    name: name || `${inv.customerName} – ${inv.seriesCode}`,
    customerId: inv.customerId,
    seriesId: inv.seriesId,
    paymentMethod: inv.paymentMethod,
    notes: inv.notes ?? "",
    interval,
    nextRunAt,
    autoIssue: true,
    autoTransmit: org.autoTransmit,
    autoEmail: false,
    lines: linesToDraft(inv.lines),
  });
}

export async function toggleTemplate(db: Db, orgId: string, id: string) {
  const t = await db.query.recurringTemplates.findFirst({ where: and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)) });
  if (!t) throw new Error("Το πρότυπο δεν βρέθηκε.");
  await db.update(recurringTemplates).set({ active: !t.active }).where(eq(recurringTemplates.id, id));
}

export async function deleteTemplate(db: Db, orgId: string, id: string) {
  await db.delete(recurringTemplates).where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)));
}

/** Εκτέλεση ενός προτύπου: δημιουργία (και προαιρετικά έκδοση/διαβίβαση/αποστολή) παραστατικού. */
export async function runTemplate(db: Db, org: Organization, t: RecurringTemplate, runDate = new Date().toISOString().slice(0, 10)) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, t.customerId) });
  if (!customer) throw new Error(`Ο πελάτης του προτύπου «${t.name}» δεν υπάρχει πλέον.`);
  const terms = customer.paymentTermsDays ?? org.defaultPaymentTermsDays;
  const due = new Date(new Date(runDate).getTime() + terms * 86_400_000).toISOString().slice(0, 10);
  const lines = JSON.parse(t.linesJson) as InvoiceLineDraft[];
  const id = await saveDraft(db, org, {
    customerId: t.customerId,
    seriesId: t.seriesId,
    issueDate: runDate,
    dueDate: due,
    currency: "EUR",
    paymentMethod: t.paymentMethod,
    notes: t.notes ?? "",
    correlatedInvoiceId: null,
    recurringTemplateId: t.id,
    lines,
  });
  let issued = false;
  if (t.autoIssue) {
    await issueInvoice(db, org, id);
    issued = true;
    if (t.autoTransmit) await transmitToMyData(db, org, id);
    if (t.autoEmail && customer.email) await emailInvoice(db, org, id, { to: customer.email });
    if (t.autoCharge && customer.stripePaymentMethodId) {
      const { chargeSubscriptionInvoice } = await import("@/lib/payments/subscriptions");
      await chargeSubscriptionInvoice(db, org, t.id, id);
    }
  }
  await db
    .update(recurringTemplates)
    .set({ lastRunAt: new Date().toISOString(), runCount: t.runCount + 1, periodStart: runDate, nextRunAt: advance(t.nextRunAt, t.interval as RecurringInterval) })
    .where(eq(recurringTemplates.id, t.id));
  await notify(db, {
    orgId: org.id,
    type: "recurring_issued",
    title: `${issued ? "Εκδόθηκε" : "Δημιουργήθηκε πρόχειρο"} από το πρότυπο «${t.name}»`,
    body: `${customer.name} · ${runDate}${t.autoTransmit && issued ? " · διαβίβαση myDATA" : ""}${t.autoEmail && issued && customer.email ? ` · email στο ${customer.email}` : ""}`,
    link: `/invoices/${id}`,
  });
  return { invoiceId: id, issued };
}

/** Εκτέλεση όλων των ληξιπρόθεσμων προτύπων ενός οργανισμού. */
export async function runDueTemplates(db: Db, org: Organization) {
  if (!hasCapability(org.plan, "recurring")) return [] as { templateId: string; invoiceId?: string; error?: string }[];
  const today = new Date().toISOString().slice(0, 10);
  const due = await db
    .select()
    .from(recurringTemplates)
    .where(and(eq(recurringTemplates.orgId, org.id), eq(recurringTemplates.active, true), lte(recurringTemplates.nextRunAt, today)));
  const results: { templateId: string; invoiceId?: string; error?: string }[] = [];
  for (const t of due) {
    // Προστασία από διπλή εκτέλεση την ίδια ημέρα
    const already = await db.query.invoices.findFirst({ where: and(eq(invoices.recurringTemplateId, t.id), eq(invoices.issueDate, today)) });
    if (already) {
      await db.update(recurringTemplates).set({ nextRunAt: advance(t.nextRunAt, t.interval as RecurringInterval) }).where(eq(recurringTemplates.id, t.id));
      continue;
    }
    try {
      const r = await runTemplate(db, org, t, today);
      results.push({ templateId: t.id, invoiceId: r.invoiceId });
    } catch (err) {
      results.push({ templateId: t.id, error: (err as Error).message });
    }
  }
  return results;
}

export async function runDueTemplatesForAll(db: Db) {
  const orgs = await db.select().from(organizations);
  const out: { orgId: string; created: number; errors: number }[] = [];
  for (const org of orgs) {
    const r = await runDueTemplates(db, org);
    out.push({ orgId: org.id, created: r.filter((x) => x.invoiceId).length, errors: r.filter((x) => x.error).length });
  }
  return out;
}
