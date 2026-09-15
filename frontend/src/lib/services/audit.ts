import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditActor {
  id: string;
  name: string;
  ip?: string | null;
}

/**
 * Ιστορικό ενεργειών (audit trail). Ο actor είναι προαιρετικός – σε αυτοματισμούς (cron, API)
 * καταγράφεται «Σύστημα» / «API».
 */
export async function audit(db: Db, orgId: string, entity: string, entityId: string, action: string, detail = "", actor?: AuditActor | null) {
  await db.insert(auditLog).values({
    id: randomUUID(),
    orgId,
    entity,
    entityId,
    action,
    detail,
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    ipAddress: actor?.ip ?? null,
    createdAt: new Date().toISOString(),
  });
}

export async function listAuditLog(db: Db, orgId: string, opts: { entity?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.entity ? and(eq(auditLog.orgId, orgId), eq(auditLog.entity, opts.entity)) : eq(auditLog.orgId, orgId);
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)` }).from(auditLog).where(where),
  ]);
  return { rows, total: Number(count), page, pageSize };
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  portal_invite_sent: "Πρόσκληση portal πελάτη",
  portal_link_rotated: "Ανανέωση συνδέσμου portal",
  draft_created: "Δημιουργία πρόχειρου",
  draft_updated: "Ενημέρωση πρόχειρου",
  issued: "Έκδοση",
  mydata_sent: "Διαβίβαση myDATA",
  b2g_sent: "Αποστολή στο Δημόσιο (B2G)",
  b2g_error: "Σφάλμα B2G",
  b2g_accepted: "Αποδοχή από φορέα Δημοσίου",
  b2g_rejected: "Απόρριψη από φορέα Δημοσίου",
  b2g_settings_updated: "Ρυθμίσεις B2G",
  mydata_error: "Σφάλμα myDATA",
  cancelled: "Ακύρωση",
  duplicated_from: "Αντιγραφή από",
  quote_accepted: "Αποδοχή προσφοράς",
  quote_rejected: "Απόρριψη προσφοράς",
  quote_converted: "Μετατροπή προσφοράς",
  payment: "Είσπραξη",
  emailed: "Αποστολή email",
  created: "Δημιουργία",
  posted: "Οριστικοποίηση",
  updated: "Ενημέρωση",
  deleted: "Διαγραφή",
  settings_saved: "Αποθήκευση ρυθμίσεων",
  mydata_settings_saved: "Ρυθμίσεις myDATA",
  mydata_connection_test: "Έλεγχος σύνδεσης myDATA",
  member_invited: "Πρόσκληση χρήστη",
  member_removed: "Αφαίρεση χρήστη",
  member_role_changed: "Αλλαγή ρόλου",
  api_key_created: "Νέο κλειδί API",
  api_key_revoked: "Ανάκληση κλειδιού API",
  webhook_created: "Νέο webhook",
  webhook_deleted: "Διαγραφή webhook",
  plan_changed: "Αλλαγή πακέτου",
  expense_classified: "Χαρακτηρισμός εξόδου",
  data_exported: "Εξαγωγή δεδομένων",
  imported: "Εισαγωγή δεδομένων",
  attachment_added: "Προσθήκη συνημμένου",
  attachment_removed: "Αφαίρεση συνημμένου",
  bulk_deleted: "Μαζική διαγραφή προχείρων",
  bulk_issued: "Μαζική έκδοση παραστατικών",
  bulk_paid: "Μαζική εξόφληση",
  late_charges_invoiced: "Έκδοση παραστατικού επιβαρύνσεων",
  payment_recorded: "Πληρωμή προμηθευτή",
  statement_imported: "Εισαγωγή κινήσεων τράπεζας",
  reconciled: "Συμφωνία extrait",
  matched: "Σύνδεση κίνησης",
  transfer: "Μεταφορά μεταξύ λογαριασμών",
  advance_received: "Προκαταβολή πελάτη",
  credit_adjusted: "Πίστωση / διόρθωση υπολοίπου",
  credit_refunded: "Επιστροφή πιστωτικού υπολοίπου",
  credit_applied: "Συμψηφισμός με πιστωτικό",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  invoice: "Παραστατικό",
  supplier: "Προμηθευτής",
  customer: "Πελάτης",
  product: "Είδος",
  warehouse: "Αποθήκη",
  stock_count: "Απογραφή",
  cash_account: "Λογαριασμός ταμείου/τράπεζας",
  bank_transaction: "Κίνηση extrait",
  expense: "Έξοδο",
  organization: "Επιχείρηση",
  membership: "Χρήστης",
  api_key: "Κλειδί API",
  webhook: "Webhook",
  billing: "Συνδρομή",
  export: "Εξαγωγή",
};
