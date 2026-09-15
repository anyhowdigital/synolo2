"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { organizations } from "@/db/schema";
import { getInvoiceByPublicToken, invoiceDisplayNumber, setQuoteStatus } from "@/lib/services/invoices";
import { addNote } from "@/lib/services/collab";
import { notify } from "@/lib/services/notifications";
import { getDocumentType } from "@/lib/greek/document-types";
import { requestIp } from "@/lib/auth/session";
import { loginLockedMinutes, recordLoginFailure } from "@/lib/services/login-throttle";
import { demoPaymentReference, onlinePaymentAvailable, remainingAmount, settleOnlinePayment, startInvoiceCheckout } from "@/lib/payments/online";
import { stripeEnabled } from "@/lib/billing/stripe";
import type { ActionResult } from "./customers";

export interface PublicDecisionInput {
  name: string;
  note?: string;
  signature?: string | null;
  agree?: boolean;
}

const SIGNATURE_MAX_BYTES = 120_000;

function validSignature(sig: string | null | undefined): string | null {
  if (!sig) return null;
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig)) throw new Error("Μη έγκυρη υπογραφή.");
  if (sig.length > SIGNATURE_MAX_BYTES) throw new Error("Η υπογραφή είναι πολύ μεγάλη. Δοκιμάστε ξανά.");
  return sig;
}

/** Αποδοχή/απόρριψη προσφοράς από τον πελάτη μέσω δημόσιου συνδέσμου (χωρίς login), με ονοματεπώνυμο & υπογραφή. */
export async function publicQuoteDecisionAction(token: string, status: "accepted" | "rejected", input: PublicDecisionInput): Promise<ActionResult> {
  try {
    const db = await getDb();
    const inv = await getInvoiceByPublicToken(db, token);
    if (!inv) return { ok: false, error: "Ο σύνδεσμος δεν ισχύει." };
    if (inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toISOString().slice(0, 10))) {
      return { ok: false, error: "Η προσφορά έχει λήξει. Επικοινωνήστε με τον εκδότη για ανανέωση." };
    }
    const name = (input.name ?? "").trim();
    if (name.length < 3) return { ok: false, error: "Γράψτε το ονοματεπώνυμό σας για να επιβεβαιώσετε την απόφαση." };
    if (status === "accepted" && !input.agree) return { ok: false, error: "Επιβεβαιώστε ότι αποδέχεστε τους όρους της προσφοράς." };
    const signature = status === "accepted" ? validSignature(input.signature) : null;
    if (status === "accepted" && !signature) return { ok: false, error: "Σχεδιάστε την υπογραφή σας στο πλαίσιο." };
    await setQuoteStatus(db, inv.orgId, inv.id, status, { name, note: (input.note ?? "").trim(), ip: await requestIp(), signature });
    revalidatePath(`/p/${token}`);
    revalidatePath(`/invoices/${inv.id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Μήνυμα του πελάτη προς τον εκδότη από τη δημόσια σελίδα παραστατικού (συζήτηση). */
export async function publicPostMessageAction(token: string, input: { name: string; body: string }): Promise<ActionResult> {
  try {
    const db = await getDb();
    const inv = await getInvoiceByPublicToken(db, token);
    if (!inv || inv.status === "draft") return { ok: false, error: "Ο σύνδεσμος δεν ισχύει." };
    const body = (input.body ?? "").trim();
    const name = (input.name ?? "").trim() || inv.customerName || "Πελάτης";
    if (body.length < 2) return { ok: false, error: "Γράψτε το μήνυμά σας." };
    if (body.length > 2000) return { ok: false, error: "Το μήνυμα δεν μπορεί να ξεπερνά τους 2.000 χαρακτήρες." };
    const key = `msg:${token}`;
    if ((await loginLockedMinutes(db, key)) > 0) return { ok: false, error: "Πολλά μηνύματα σε σύντομο διάστημα. Δοκιμάστε ξανά αργότερα." };
    await recordLoginFailure(db, key);
    const id = await addNote(db, inv.orgId, "invoice", inv.id, body, null, { visibility: "customer", authorType: "customer", authorName: name.slice(0, 120) });
    const dt = getDocumentType(inv.invoiceType);
    const number = invoiceDisplayNumber(inv);
    await notify(db, {
      orgId: inv.orgId,
      type: "comment_added",
      title: `Νέο μήνυμα από ${name} για ${dt.kind === "quote" ? "την προσφορά" : "το παραστατικό"} ${number}`,
      body: body.slice(0, 300),
      link: `/invoices/${inv.id}`,
    });
    revalidatePath(`/p/${token}`);
    revalidatePath(`/invoices/${inv.id}`);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Έναρξη online πληρωμής από τη δημόσια σελίδα. Επιστρέφει URL (Stripe Checkout ή τοπική προσομοίωση). */
export async function publicStartPaymentAction(token: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const db = await getDb();
    const inv = await getInvoiceByPublicToken(db, token);
    if (!inv) return { ok: false, error: "Ο σύνδεσμος δεν ισχύει." };
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, inv.orgId) });
    if (!org || !onlinePaymentAvailable(org, inv)) return { ok: false, error: "Η online πληρωμή δεν είναι διαθέσιμη για αυτό το παραστατικό." };
    const url = await startInvoiceCheckout(db, org, inv, token);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Ολοκλήρωση προσομοίωσης πληρωμής (μόνο χωρίς Stripe). Καταχωρεί είσπραξη POS με αναφορά DEMO-…. */
export async function publicDemoPayAction(token: string): Promise<ActionResult> {
  if (stripeEnabled()) return { ok: false, error: "Η προσομοίωση δεν είναι διαθέσιμη όταν το Stripe είναι ενεργό." };
  try {
    const db = await getDb();
    const inv = await getInvoiceByPublicToken(db, token);
    if (!inv) return { ok: false, error: "Ο σύνδεσμος δεν ισχύει." };
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, inv.orgId) });
    if (!org || !onlinePaymentAvailable(org, inv)) return { ok: false, error: "Η online πληρωμή δεν είναι διαθέσιμη για αυτό το παραστατικό." };
    const outcome = await settleOnlinePayment(db, inv.orgId, inv.id, remainingAmount(inv), demoPaymentReference());
    if (outcome !== "recorded") return { ok: false, error: "Η πληρωμή δεν καταχωρήθηκε." };
    revalidatePath(`/p/${token}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
