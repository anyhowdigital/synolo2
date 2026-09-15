"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { customerActivities, customers, invoices } from "@/db/schema";
import { requirePermission } from "@/lib/services/org";
import { resolveActor } from "@/lib/services/actor";
import { audit } from "@/lib/services/audit";
import { customerCreditProfile, lateCharges } from "@/lib/services/credit-profile";
import { invoiceDisplayNumber } from "@/lib/services/invoice-display";
import { emailPaymentReminder } from "@/lib/services/invoice-email";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";
import { invoiceLateChargesAction } from "@/app/actions/late-charges";
import { round2 } from "@/lib/invoice/totals";

/** Ενέργειες πάνω από αυτό το ποσό απαιτούν δεύτερη επιβεβαίωση από τον χρήστη. */
const HIGH_VALUE_THRESHOLD = 500;

export type CollectionActionKind = "send_reminder" | "late_charges" | "credit_limit" | "call_task" | "installment_plan";

export interface CollectionAction {
  id: string;
  kind: CollectionActionKind;
  customerId: string | null;
  customerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  tone: "friendly" | "firm" | "final" | null;
  subject: string | null;
  body: string | null;
  creditLimit: number | null;
  dueInDays: number | null;
  installments: { date: string; amount: number }[] | null;
  reason: string;
  risk: "low" | "medium" | "high";
  /** Email παραλήπτη (από την καρτέλα πελάτη) – κενό σημαίνει ότι η αποστολή δεν είναι δυνατή. */
  to: string;
  /** Απαιτεί δεύτερη επιβεβαίωση (ποσό > 500 €). */
  needsDoubleConfirm: boolean;
}

export type CollectionsPlan = { ok: true; summary: string; actions: CollectionAction[] } | { ok: false; error: string };
export type ExecuteResult = { ok: true; message: string } | { ok: false; error: string };

/** Συγκεντρώνει τους οφειλέτες και ζητά από το AI σχέδιο ενεργειών (τίποτα δεν εκτελείται εδώ). */
export async function proposeCollectionsAction(instruction = ""): Promise<CollectionsPlan> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  const today = new Date().toISOString().slice(0, 10);

  const open = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid"])));
  const overdue = open.filter((i) => {
    const remaining = round2(i.totalGrossValue - i.paidAmount);
    const due = i.dueDate ?? i.issueDate;
    return remaining > 0.005 && due < today;
  });
  if (overdue.length === 0) return { ok: false, error: "Δεν υπάρχουν ληξιπρόθεσμες οφειλές αυτή τη στιγμή." };

  const custIds = [...new Set(overdue.map((i) => i.customerId).filter(Boolean) as string[])];
  const custRows = custIds.length ? await db.select().from(customers).where(and(eq(customers.orgId, org.id), inArray(customers.id, custIds))) : [];
  const custMap = new Map(custRows.map((c) => [c.id, c]));

  const debtors = [];
  for (const key of custIds.length ? custIds : ["retail"]) {
    const cust = custMap.get(key);
    const list = overdue.filter((i) => i.customerId === key);
    if (!list.length) continue;
    const profile = cust ? await customerCreditProfile(db, org.id, cust) : null;
    debtors.push({
      customer_id: key,
      customer_name: cust?.name ?? list[0]!.customerName ?? "Πελάτης",
      email: cust?.email ?? "",
      language: cust?.language ?? "el",
      rating: profile?.rating ?? "unknown",
      avg_payment_days: profile?.avgPaymentDays ?? null,
      outstanding: round2(list.reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0)),
      overdue: round2(list.reduce((s, i) => s + (i.totalGrossValue - i.paidAmount), 0)),
      credit_limit: cust?.creditLimit ?? 0,
      reminders_sent: Math.max(...list.map((i) => i.reminderCount)),
      last_reminder_at: list.map((i) => i.lastReminderAt).filter(Boolean).sort().at(-1) ?? null,
      late_charges: round2(list.reduce((s, i) => s + lateCharges(org, i).total, 0)),
      invoices: list.map((i) => ({
        invoice_id: i.id,
        number: invoiceDisplayNumber(i),
        issue_date: i.issueDate,
        due_date: i.dueDate,
        remaining: round2(i.totalGrossValue - i.paidAmount),
        days_overdue: Math.floor((Date.now() - new Date(i.dueDate ?? i.issueDate).getTime()) / 86_400_000),
        currency: i.currency,
        reminders_sent: i.reminderCount,
      })),
    });
  }

  try {
    const resp = await fetch("http://127.0.0.1:8001/api/copilot/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_name: org.name,
        org_iban: org.iban ?? "",
        current_date: today,
        late_interest_rate: org.lateInterestAnnualRate,
        late_fee_flat: org.lateFeeFlat,
        instruction,
        debtors,
      }),
    });
    if (!resp.ok) return { ok: false, error: `Το AI δεν απάντησε (${resp.status}): ${(await resp.text()).slice(0, 200)}` };
    const data = await resp.json();
    const raw = (data.plan?.actions ?? []) as Record<string, unknown>[];
    const actions: CollectionAction[] = raw.map((a) => {
      const customerId = (a.customer_id as string | null) ?? null;
      const cust = customerId ? custMap.get(customerId) : undefined;
      const amount = typeof a.amount === "number" ? round2(a.amount) : null;
      const kind = (a.kind as CollectionActionKind) ?? "call_task";
      return {
        id: randomUUID(),
        kind,
        customerId,
        customerName: (a.customer_name as string) ?? cust?.name ?? "Πελάτης",
        invoiceId: (a.invoice_id as string | null) ?? null,
        invoiceNumber: (a.invoice_number as string | null) ?? null,
        amount,
        tone: (a.tone as CollectionAction["tone"]) ?? null,
        subject: (a.subject as string | null) ?? null,
        body: (a.body as string | null) ?? null,
        creditLimit: typeof a.credit_limit === "number" ? round2(a.credit_limit) : null,
        dueInDays: typeof a.due_in_days === "number" ? a.due_in_days : null,
        installments: Array.isArray(a.installments) ? (a.installments as { date: string; amount: number }[]) : null,
        reason: (a.reason as string) ?? "",
        risk: (a.risk as CollectionAction["risk"]) ?? "medium",
        to: cust?.email ?? "",
        needsDoubleConfirm: (amount ?? 0) > HIGH_VALUE_THRESHOLD || kind === "late_charges",
      };
    });
    return { ok: true, summary: (data.plan?.summary as string) ?? "", actions };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Εκτελεί ΜΙΑ εγκεκριμένη ενέργεια. Απαιτεί ρητή έγκριση και, για ποσά > 500 €, διπλή επιβεβαίωση. */
export async function executeCollectionAction(action: CollectionAction, confirmed: boolean): Promise<ExecuteResult> {
  const db = await getDb();
  const { ctx, error } = await requirePermission(db, "write");
  if (error) return { ok: false, error };
  const org = ctx.org;
  if (action.needsDoubleConfirm && !confirmed) {
    return { ok: false, error: `Η ενέργεια αφορά ποσό άνω των ${HIGH_VALUE_THRESHOLD} € ή χρέωση τόκων – απαιτείται δεύτερη επιβεβαίωση.` };
  }
  const actor = await resolveActor(db);

  const customer = action.customerId ? await db.query.customers.findFirst({ where: and(eq(customers.id, action.customerId), eq(customers.orgId, org.id)) }) : null;

  switch (action.kind) {
    case "send_reminder": {
      if (!action.invoiceId) return { ok: false, error: "Λείπει το παραστατικό της υπενθύμισης." };
      const inv = await db.query.invoices.findFirst({ where: and(eq(invoices.id, action.invoiceId), eq(invoices.orgId, org.id)) });
      if (!inv) return { ok: false, error: "Το παραστατικό δεν βρέθηκε." };
      const to = action.to || customer?.email || "";
      if (!to) return { ok: false, error: "Ο πελάτης δεν έχει email – συμπληρώστε το στην καρτέλα του." };

      if (action.subject && action.body) {
        const html = layoutEmail(
          action.subject,
          action.body
            .split(/\n{2,}/)
            .map((p) => `<p>${p.replace(/\n/g, "<br/>").replace(/</g, "&lt;")}</p>`)
            .join(""),
          inv.publicToken ? { label: "Προβολή παραστατικού", url: appUrl(`/p/${inv.publicToken}`) } : undefined,
        );
        await sendMail(db, { orgId: org.id, to, subject: action.subject, html, relatedEntity: "invoice", relatedId: inv.id });
        await db
          .update(invoices)
          .set({ lastReminderAt: new Date().toISOString(), reminderCount: inv.reminderCount + 1 })
          .where(eq(invoices.id, inv.id));
      } else {
        const tone = action.tone === "friendly" ? "late" : action.tone === "final" ? "final" : "late";
        await emailPaymentReminder(db, org, inv, to, { tone });
      }
      await audit(db, org.id, "invoice", inv.id, "ai_reminder_sent", `AI υπενθύμιση (${action.tone ?? "late"}) προς ${to} – εγκρίθηκε από χρήστη`, actor);
      revalidatePath("/invoices");
      return { ok: true, message: `Η υπενθύμιση στάλθηκε στον ${action.customerName} (${to}).` };
    }

    case "late_charges": {
      if (!action.invoiceId) return { ok: false, error: "Λείπει το παραστατικό για τη χρέωση." };
      const res = await invoiceLateChargesAction(action.invoiceId);
      if (!res.ok) return { ok: false, error: res.error };
      await audit(db, org.id, "invoice", action.invoiceId, "ai_late_charges", "AI πρόταση χρέωσης επιβαρύνσεων – εγκρίθηκε από χρήστη", actor);
      return { ok: true, message: res.message };
    }

    case "credit_limit": {
      if (!action.customerId || action.creditLimit === null) return { ok: false, error: "Λείπει ο πελάτης ή το προτεινόμενο όριο." };
      await db.update(customers).set({ creditLimit: Math.max(0, action.creditLimit) }).where(and(eq(customers.id, action.customerId), eq(customers.orgId, org.id)));
      await audit(db, org.id, "customer", action.customerId, "ai_credit_limit", `Πιστωτικό όριο → ${action.creditLimit.toFixed(2)} € (AI πρόταση, εγκρίθηκε)`, actor);
      revalidatePath("/customers");
      return { ok: true, message: `Το πιστωτικό όριο του ${action.customerName} ορίστηκε σε ${action.creditLimit.toFixed(2)} €.` };
    }

    case "call_task": {
      if (!action.customerId) return { ok: false, error: "Λείπει ο πελάτης." };
      const dueAt = new Date(Date.now() + (action.dueInDays ?? 1) * 86_400_000).toISOString();
      await db.insert(customerActivities).values({
        id: randomUUID(),
        orgId: org.id,
        customerId: action.customerId,
        kind: "task",
        content: `Τηλεφωνική όχληση: ${action.reason || "ληξιπρόθεσμη οφειλή"}${action.amount ? ` (${action.amount.toFixed(2)} €)` : ""}`,
        dueAt,
        done: false,
        createdAt: new Date().toISOString(),
      });
      await audit(db, org.id, "customer", action.customerId, "ai_call_task", "Δημιουργήθηκε εργασία τηλεφωνικής όχλησης (AI πρόταση)", actor);
      revalidatePath("/customers");
      return { ok: true, message: `Δημιουργήθηκε εργασία τηλεφωνήματος για τον ${action.customerName}.` };
    }

    case "installment_plan": {
      if (!action.customerId || !action.installments?.length) return { ok: false, error: "Λείπει το πλάνο δόσεων." };
      const plan = action.installments.map((i) => `${i.date}: ${i.amount.toFixed(2)} €`).join(" · ");
      await db.insert(customerActivities).values({
        id: randomUUID(),
        orgId: org.id,
        customerId: action.customerId,
        kind: "note",
        content: `Πρόταση διακανονισμού (AI, εγκεκριμένη): ${plan}. ${action.reason}`,
        dueAt: action.installments[0]!.date,
        done: false,
        createdAt: new Date().toISOString(),
      });
      const to = action.to || customer?.email || "";
      if (to) {
        const html = layoutEmail(
          "Πρόταση διακανονισμού οφειλής",
          `<p>Αγαπητοί συνεργάτες,</p><p>Για τη διευθέτηση της οφειλής σας προτείνουμε το παρακάτω πλάνο δόσεων:</p><ul>${action.installments
            .map((i) => `<li>${i.date}: <strong>${i.amount.toFixed(2)} €</strong></li>`)
            .join("")}</ul>${org.iban ? `<p>Πληρωμές: IBAN <strong>${org.iban}</strong></p>` : ""}<p>Με εκτίμηση,<br/>${org.name}</p>`,
        );
        await sendMail(db, { orgId: org.id, to, subject: `Πρόταση διακανονισμού – ${org.name}`, html, relatedEntity: "customer", relatedId: action.customerId });
      }
      await audit(db, org.id, "customer", action.customerId, "ai_installment_plan", `Διακανονισμός: ${plan}`, actor);
      revalidatePath("/customers");
      return { ok: true, message: to ? `Το πλάνο δόσεων καταγράφηκε και στάλθηκε στον ${action.customerName}.` : `Το πλάνο δόσεων καταγράφηκε στην καρτέλα του ${action.customerName}.` };
    }

    default:
      return { ok: false, error: "Άγνωστος τύπος ενέργειας." };
  }
}
