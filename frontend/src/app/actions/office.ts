"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { expenses, invoices, memberships, officeTasks, orgPins, organizations, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { transmitAllPending, listPendingTransmissions } from "@/lib/services/mydata-sync";
import { resolveFirm, firmClient } from "@/lib/services/firm";
import { sendMail, layoutEmail, appUrl } from "@/lib/email/mailer";
import { audit } from "@/lib/services/audit";

async function accessibleOrgIds(userId: string) {
  const db = await getDb();
  const rows = await db.select({ orgId: memberships.orgId, role: memberships.role }).from(memberships).where(eq(memberships.userId, userId));
  return rows;
}

/** Καρφίτσωμα / ξεκαρφίτσωμα επιχείρησης στο cockpit. */
export async function toggleOrgPinAction(orgId: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const existing = await db
    .select()
    .from(orgPins)
    .where(and(eq(orgPins.userId, user.id), eq(orgPins.orgId, orgId)))
    .limit(1);
  if (existing.length) {
    await db.update(orgPins).set({ pinned: !existing[0].pinned }).where(eq(orgPins.id, existing[0].id));
  } else {
    await db.insert(orgPins).values({ id: randomUUID(), userId: user.id, orgId, pinned: true, lastOpenedAt: null, createdAt: new Date().toISOString() });
  }
  revalidatePath("/accountant/cockpit");
  return { ok: true as const };
}

/** Καταγράφει το τελευταίο άνοιγμα (λίστα «πρόσφατες»). */
export async function markOrgOpenedAction(orgId: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const };
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(orgPins)
    .where(and(eq(orgPins.userId, user.id), eq(orgPins.orgId, orgId)))
    .limit(1);
  if (existing.length) await db.update(orgPins).set({ lastOpenedAt: now }).where(eq(orgPins.id, existing[0].id));
  else await db.insert(orgPins).values({ id: randomUUID(), userId: user.id, orgId, pinned: false, lastOpenedAt: now, createdAt: now });
  return { ok: true as const };
}

export type BulkResult = { ok: true; rows: { orgName: string; done: number; failed: number; message: string }[] } | { ok: false; error: string };

/** Μαζική διαβίβαση εκκρεμών myDATA σε πολλές επιχειρήσεις. */
export async function bulkTransmitAction(orgIds: string[]): Promise<BulkResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const allowed = (await accessibleOrgIds(user.id)).filter((m) => m.role !== "viewer").map((m) => m.orgId);
  const targets = orgIds.filter((id) => allowed.includes(id));
  if (!targets.length) return { ok: false, error: "Δεν έχετε δικαίωμα διαβίβασης στις επιλεγμένες επιχειρήσεις." };

  const orgs = await db.select().from(organizations).where(inArray(organizations.id, targets));
  const rows: { orgName: string; done: number; failed: number; message: string }[] = [];
  for (const org of orgs) {
    const pending = await listPendingTransmissions(db, org.id);
    if (!pending.length) {
      rows.push({ orgName: org.name, done: 0, failed: 0, message: "Καμία εκκρεμότητα." });
      continue;
    }
    const res = await transmitAllPending(db, org);
    rows.push({
      orgName: org.name,
      done: res.sent,
      failed: res.errors.length,
      message: `${res.sent} διαβιβάστηκαν${res.errors.length ? `, ${res.errors.length} απέτυχαν` : ""}${org.mydataEnvironment === "mock" ? " (προσομοίωση)" : ""}`,
    });
    await audit(db, org.id, "mydata", "bulk", "bulk_transmit_cockpit", `${res.sent}/${pending.length} από cockpit λογιστή`);
  }
  revalidatePath("/accountant/cockpit");
  return { ok: true, rows };
}

/** Μαζικός χαρακτηρισμός & έγκριση αχαρακτήριστων εξόδων (από την προεπιλογή του προμηθευτή/οργανισμού). */
export async function bulkClassifyExpensesAction(orgIds: string[]): Promise<BulkResult> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const allowed = (await accessibleOrgIds(user.id)).filter((m) => m.role !== "viewer").map((m) => m.orgId);
  const targets = orgIds.filter((id) => allowed.includes(id));
  if (!targets.length) return { ok: false, error: "Δεν έχετε δικαίωμα σε αυτές τις επιχειρήσεις." };

  const orgs = await db.select().from(organizations).where(inArray(organizations.id, targets));
  const rows: { orgName: string; done: number; failed: number; message: string }[] = [];
  for (const org of orgs) {
    const drafts = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.orgId, org.id), eq(expenses.status, "draft")));
    let done = 0;
    for (const e of drafts) {
      const category = e.classificationCategory || "category2_1";
      const type = e.classificationType || "E3_102_001";
      await db
        .update(expenses)
        .set({ classificationCategory: category, classificationType: type, status: "approved" })
        .where(eq(expenses.id, e.id));
      done++;
    }
    rows.push({ orgName: org.name, done, failed: 0, message: done ? `${done} έξοδα χαρακτηρίστηκαν & εγκρίθηκαν.` : "Κανένα αχαρακτήριστο έξοδο." });
    if (done) await audit(db, org.id, "expense", "bulk", "bulk_classify_cockpit", `${done} έξοδα από cockpit λογιστή`);
  }
  revalidatePath("/accountant/cockpit");
  return { ok: true, rows };
}

/** Δημιουργεί εκκρεμότητες γραφείου από τα ευρήματα κινδύνου των επιλεγμένων επιχειρήσεων. */
export async function syncOfficeTasksAction(orgIds: string[], findings: { orgId: string; code: string; title: string; severity: string }[]) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const now = new Date().toISOString();
  let created = 0;
  for (const f of findings.filter((f) => orgIds.includes(f.orgId))) {
    const existing = await db
      .select()
      .from(officeTasks)
      .where(and(eq(officeTasks.orgId, f.orgId), eq(officeTasks.code, f.code), eq(officeTasks.status, "open")))
      .limit(1);
    if (existing.length) continue;
    const due = new Date(Date.now() + (f.severity === "critical" ? 2 : f.severity === "high" ? 5 : 10) * 86_400_000).toISOString().slice(0, 10);
    await db.insert(officeTasks).values({ id: randomUUID(), orgId: f.orgId, code: f.code, title: f.title, severity: f.severity, dueDate: due, status: "open", createdAt: now, updatedAt: now });
    created++;
  }
  revalidatePath("/accountant/tasks");
  return { ok: true as const, created };
}

export async function updateOfficeTaskAction(id: string, patch: { status?: string; assigneeUserId?: string | null; dueDate?: string | null; note?: string }) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const before = (await db.select().from(officeTasks).where(eq(officeTasks.id, id)).limit(1))[0];
  if (!before) return { ok: false as const, error: "Δεν βρέθηκε η εκκρεμότητα." };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { ok: false as const, error: "Μη εξουσιοδοτημένος." };
  const client = await firmClient(db, firm, before.orgId);
  if (!client) return { ok: false as const, error: "Δεν έχετε πρόσβαση σε αυτή την εκκρεμότητα." };
  await db
    .update(officeTasks)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(officeTasks.id, id));

  // Ειδοποίηση ολοκλήρωσης ανατεθειμένης ευκαιρίας προς τον ιδιοκτήτη του γραφείου.
  if (patch.status === "done" && before.status !== "done" && before.code.startsWith("advisor:")) {
    try {
      if (firm.firmUserId !== user.id) {
        const owner = (await db.select().from(users).where(eq(users.id, firm.firmUserId)).limit(1))[0];
        const org = (await db.select().from(organizations).where(eq(organizations.id, before.orgId)).limit(1))[0];
        if (owner?.email) {
          await sendMail(db, {
            orgId: before.orgId,
            to: owner.email,
            subject: `Ολοκληρώθηκε ανάθεση ευκαιρίας — ${org?.name ?? ""}`,
            html: layoutEmail(
              "Ολοκληρώθηκε ανατεθειμένη ευκαιρία",
              `<p>Ο/Η <strong>${user.name}</strong> σημείωσε ως ολοκληρωμένη την ανάθεση:</p>
               <p><strong>${before.title}</strong></p>
               <p>Πελάτης: ${org?.name ?? "—"}${org?.afm ? ` (ΑΦΜ ${org.afm})` : ""}.</p>`,
              { label: "Άνοιγμα Συμβούλου πελάτη", url: appUrl(`/office/clients/${before.orgId}/advisor`) },
            ),
            relatedEntity: "office_task",
            relatedId: before.orgId,
          });
        }
      }
    } catch {
      // Η ολοκλήρωση έχει καταχωρηθεί· αποτυχία ειδοποίησης δεν μπλοκάρει.
    }
  }

  revalidatePath("/accountant/tasks");
  revalidatePath("/office/tasks");
  return { ok: true as const };
}

/** Εξαγωγή βιβλίων (έσοδα/έξοδα) για πολλές επιχειρήσεις σε ένα CSV. */
export async function bulkBooksCsvAction(orgIds: string[]) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const allowed = (await accessibleOrgIds(user.id)).map((m) => m.orgId);
  const targets = orgIds.filter((id) => allowed.includes(id));
  if (!targets.length) return { ok: false as const, error: "Επιλέξτε τουλάχιστον μία επιχείρηση." };
  const orgs = await db.select().from(organizations).where(inArray(organizations.id, targets));
  const lines = ["Επιχείρηση;ΑΦΜ;Τύπος;Ημερομηνία;Παραστατικό;Αντισυμβαλλόμενος;Καθαρή αξία;ΦΠΑ;Σύνολο;ΜΑΡΚ"];
  for (const org of orgs) {
    const [inv, exp] = await Promise.all([
      db.select().from(invoices).where(and(eq(invoices.orgId, org.id), inArray(invoices.status, ["issued", "partially_paid", "paid", "overdue"]))),
      db.select().from(expenses).where(and(eq(expenses.orgId, org.id), eq(expenses.status, "approved"))),
    ]);
    for (const i of inv) {
      lines.push([org.name, org.afm, "Έσοδο", i.issueDate, `${i.seriesCode} ${i.number ?? ""}`, i.customerName ?? "Λιανική", i.totalNetValue, i.totalVatAmount, i.totalGrossValue, i.mydataMark ?? ""].join(";"));
    }
    for (const e of exp) {
      lines.push([org.name, org.afm, "Έξοδο", e.issueDate, `${e.series ?? ""} ${e.number ?? ""}`.trim(), e.supplierName, e.netValue, e.vatAmount, e.grossValue, e.mark ?? ""].join(";"));
    }
  }
  return { ok: true as const, csv: "\uFEFF" + lines.join("\r\n"), rows: lines.length - 1 };
}
