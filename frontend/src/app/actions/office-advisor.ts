"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { officeTasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm, canWrite, firmTeam } from "@/lib/services/firm";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { taxForecast, yearEndPlan, normalizeTaxProfile, type TaxProfile } from "@/lib/tax/engine";
import { updateOrg } from "@/lib/services/org";
import { renderTaxPlanPdf, taxPlanPdfFilename } from "@/lib/pdf/tax-plan-pdf";
import { registerDocument } from "@/lib/services/doc-registry";
import { sendMail, layoutEmail, appUrl } from "@/lib/email/mailer";
import { audit } from "@/lib/services/audit";

type Result = { ok: true } | { ok: false; error: string };

/** Ανάθεση ευκαιρίας βελτιστοποίησης σε συνεργάτη του γραφείου, με προθεσμία. */
export async function assignOpportunityAction(input: {
  orgId: string;
  ruleCode: string;
  title: string;
  severity?: string;
  assigneeUserId: string;
  dueDate?: string | null;
}): Promise<Result> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const client = await firmClient(db, firm, input.orgId);
  if (!client) return { ok: false, error: "Δεν έχετε πρόσβαση στον πελάτη." };
  if (!canWrite(client.accessLevel)) return { ok: false, error: "Το επίπεδο πρόσβασης δεν επιτρέπει ανάθεση." };

  const team = await firmTeam(db, firm);
  if (!team.some((m) => m.userId === input.assigneeUserId)) return { ok: false, error: "Ο συνεργάτης δεν ανήκει στο γραφείο." };

  const code = `advisor:${input.ruleCode}`;
  const now = new Date().toISOString();
  const existing = await db
    .select()
    .from(officeTasks)
    .where(and(eq(officeTasks.orgId, input.orgId), eq(officeTasks.code, code), eq(officeTasks.status, "open")))
    .limit(1);
  if (existing.length) {
    await db
      .update(officeTasks)
      .set({ assigneeUserId: input.assigneeUserId, dueDate: input.dueDate ?? null, title: `Ευκαιρία: ${input.title}`, updatedAt: now })
      .where(eq(officeTasks.id, existing[0].id));
  } else {
    await db.insert(officeTasks).values({
      id: randomUUID(),
      orgId: input.orgId,
      code,
      title: `Ευκαιρία: ${input.title}`,
      severity: input.severity || "medium",
      assigneeUserId: input.assigneeUserId,
      dueDate: input.dueDate ?? null,
      status: "open",
      note: "",
      createdAt: now,
      updatedAt: now,
    });
  }
  await audit(db, input.orgId, "office_task", input.ruleCode, "advisor_assign", `${input.title} → ${input.assigneeUserId}`, { id: user.id, name: user.name });

  const assignee = team.find((m) => m.userId === input.assigneeUserId);
  if (assignee?.email) {
    const dueTxt = input.dueDate ? `Προθεσμία: <strong>${input.dueDate}</strong>.` : "Χωρίς συγκεκριμένη προθεσμία.";
    const url = appUrl(`/office/clients/${input.orgId}/advisor`);
    try {
      await sendMail(db, {
        orgId: input.orgId,
        to: assignee.email,
        subject: `Νέα ανάθεση ευκαιρίας — ${client.org.name}`,
        html: layoutEmail(
          "Σας ανατέθηκε μια φορολογική ευκαιρία",
          `<p>Πελάτης: <strong>${client.org.name}</strong> (ΑΦΜ ${client.org.afm || "—"}).</p>
         <p>Ευκαιρία: <strong>${input.title}</strong>.</p>
         <p>${dueTxt}</p>
         <p>Δείτε τις λεπτομέρειες και ολοκληρώστε την από τον Σύμβουλο του πελάτη.</p>`,
          { label: "Άνοιγμα Συμβούλου πελάτη", url },
        ),
        relatedEntity: "office_task",
        relatedId: input.orgId,
      });
    } catch {
      // Η ανάθεση έχει ήδη αποθηκευτεί· η αποτυχία ειδοποίησης δεν μπλοκάρει τη ροή.
    }
  }

  revalidatePath(`/office/clients/${input.orgId}/advisor`);
  revalidatePath("/office/tasks");
  return { ok: true };
}

/** Αποστολή του φορολογικού πλάνου (PDF) στον πελάτη μέσω email. */
export async function emailTaxPlanAction(input: { orgId: string; to: string; message?: string }): Promise<Result & { delivered?: boolean }> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const client = await firmClient(db, firm, input.orgId);
  if (!client) return { ok: false, error: "Δεν έχετε πρόσβαση στον πελάτη." };
  if (!canWrite(client.accessLevel)) return { ok: false, error: "Το επίπεδο πρόσβασης δεν επιτρέπει αποστολή." };
  const to = (input.to || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "Μη έγκυρο email παραλήπτη." };

  const org = client.org;
  const { profile, financials, opportunities, totalBenefit } = await taxAdvisor(db, org);
  const forecast = taxForecast(profile, financials);
  const yearEnd = yearEndPlan(profile, financials);
  const buffer = await renderTaxPlanPdf({
    org,
    data: { year: financials.year, opportunities, totalBenefit, forecast, yearEnd, preparedByName: user.name, firmName: firm.firmName },
  });
  const fileName = taxPlanPdfFilename(org, financials.year);
  await registerDocument(db, {
    orgId: org.id,
    kind: "tax_plan",
    title: `Φορολογικό πλάνο ${financials.year}`,
    period: String(financials.year),
    fileName,
    bytes: buffer,
    userId: user.id,
    userName: user.name,
  });

  const body = `${input.message ? `<p>${input.message.replace(/</g, "&lt;")}</p>` : ""}
    <p>Επισυνάπτεται η πρόταση φορολογικής βελτιστοποίησης για τη χρήση ${financials.year}, με εκτιμώμενο δυνητικό όφελος ~${totalBenefit.toFixed(2).replace(".", ",")} €/έτος.</p>
    <p>Οι εκτιμήσεις είναι ενδεικτικές και προϋποθέτουν επιβεβαίωση πριν την εφαρμογή. Είμαστε στη διάθεσή σας για διευκρινίσεις.</p>
    <p>${firm.firmName}</p>`;
  const res = await sendMail(db, {
    orgId: org.id,
    to,
    subject: `Φορολογικό πλάνο ${financials.year} — ${org.name}`,
    html: layoutEmail(`Φορολογικό πλάνο ${financials.year}`, body),
    attachments: [{ filename: fileName, content: buffer, contentType: "application/pdf" }],
    relatedEntity: "tax_plan",
    relatedId: org.id,
  });
  await audit(db, org.id, "tax_plan", org.id, "advisor_email", `Πλάνο ${financials.year} → ${to}`, { id: user.id, name: user.name });
  if (!res.ok) return { ok: false, error: res.error || "Αποτυχία αποστολής." };
  revalidatePath(`/office/clients/${org.id}/advisor`);
  return { ok: true, delivered: res.delivered };
}

/** Αποθήκευση φορολογικού προφίλ πελάτη από τον λογιστή (ίδιο πεδίο organizations.taxProfileJson — συγχρονισμένο με την επιχείρηση). */
export async function saveClientTaxProfileAction(orgId: string, input: Partial<TaxProfile>): Promise<Result> {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false, error: "Απαιτείται σύνδεση." };
  const firm = await resolveFirm(db, user.id);
  if (!firm) return { ok: false, error: "Μη εξουσιοδοτημένος." };
  const client = await firmClient(db, firm, orgId);
  if (!client) return { ok: false, error: "Δεν έχετε πρόσβαση στον πελάτη." };
  if (!canWrite(client.accessLevel)) return { ok: false, error: "Το επίπεδο πρόσβασης δεν επιτρέπει τροποποίηση." };
  await updateOrg(db, orgId, { taxProfileJson: JSON.stringify(normalizeTaxProfile(input)) });
  await audit(db, orgId, "tax_profile", orgId, "advisor_profile_update", "Ενημέρωση φορολογικού προφίλ από λογιστή", { id: user.id, name: user.name });
  revalidatePath(`/office/clients/${orgId}/advisor`);
  revalidatePath("/advisor");
  return { ok: true };
}
