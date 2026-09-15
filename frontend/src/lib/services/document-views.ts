import { and, desc, eq, gt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { documentViews, invoices, memberships, type DocumentView, type Invoice } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getDocumentType } from "@/lib/greek/document-types";
import { invoiceDisplayNumber } from "./invoice-display";
import { notify } from "./notifications";

export type ViewSource = "email" | "link" | "portal";

export const VIEW_SOURCE_LABELS: Record<ViewSource, string> = {
  email: "Άνοιγμα email",
  link: "Δημόσιος σύνδεσμος",
  portal: "Portal πελάτη",
};

/** Επαναλαμβανόμενα ανοίγματα από την ίδια IP/πηγή μέσα σε αυτό το διάστημα μετρούν ως ένα. */
const DEDUPE_MINUTES = 15;

export interface ViewMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function looksLikeBot(ua: string) {
  return /bot|crawl|spider|preview|fetch|scan|monitor|curl|wget|python-requests|headlesschrome/i.test(ua);
}

/**
 * Καταγραφή προβολής παραστατικού από τον πελάτη. Αγνοεί προβολές από συνδεδεμένους χρήστες του
 * ίδιου οργανισμού (προεπισκόπηση), bots και διπλές προβολές μέσα σε λίγα λεπτά.
 * Επιστρέφει true αν καταγράφηκε νέα προβολή.
 */
export async function recordDocumentView(db: Db, inv: Invoice, source: ViewSource, meta: ViewMeta = {}): Promise<boolean> {
  if (inv.status === "draft") return false;
  const ua = (meta.userAgent ?? "").slice(0, 200);
  const ip = (meta.ip ?? "").slice(0, 64);
  if (looksLikeBot(ua)) return false;

  try {
    const user = await getCurrentUser(db).catch(() => null);
    if (user) {
      const member = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, user.id), eq(memberships.orgId, inv.orgId)) });
      if (member) return false;
    }

    const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
    const recent = await db.query.documentViews.findFirst({
      where: and(eq(documentViews.invoiceId, inv.id), eq(documentViews.source, source), eq(documentViews.ipAddress, ip), gt(documentViews.createdAt, since)),
    });
    if (recent) return false;

    const now = new Date().toISOString();
    await db.insert(documentViews).values({ id: randomUUID(), orgId: inv.orgId, invoiceId: inv.id, source, ipAddress: ip, userAgent: ua, createdAt: now });
    await db
      .update(invoices)
      .set({ viewCount: sql`${invoices.viewCount} + 1`, viewedAt: inv.viewedAt ?? now })
      .where(eq(invoices.id, inv.id));

    if (!inv.viewedAt) {
      const dt = getDocumentType(inv.invoiceType);
      const number = invoiceDisplayNumber(inv);
      await notify(db, {
        orgId: inv.orgId,
        type: "document_viewed",
        title: `${inv.customerName || "Ο πελάτης"} άνοιξε ${dt.kind === "quote" ? "την προσφορά" : "το παραστατικό"} ${number}`,
        body: `${dt.name} · ${VIEW_SOURCE_LABELS[source]}`,
        link: `/invoices/${inv.id}`,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function listDocumentViews(db: Db, orgId: string, invoiceId: string, limit = 20): Promise<DocumentView[]> {
  return db
    .select()
    .from(documentViews)
    .where(and(eq(documentViews.orgId, orgId), eq(documentViews.invoiceId, invoiceId)))
    .orderBy(desc(documentViews.createdAt))
    .limit(limit);
}

/** Σύντομη περιγραφή συσκευής/προγράμματος από το user-agent (για εμφάνιση στο ιστορικό). */
export function describeUserAgent(ua: string | null | undefined) {
  if (!ua) return "Άγνωστη συσκευή";
  const mobile = /iphone|ipad|android|mobile/i.test(ua);
  const browser = /googleimageproxy|gmail/i.test(ua)
    ? "Gmail"
    : /outlook|microsoft office/i.test(ua)
      ? "Outlook"
      : /edg\//i.test(ua)
        ? "Edge"
        : /chrome\//i.test(ua)
          ? "Chrome"
          : /firefox\//i.test(ua)
            ? "Firefox"
            : /safari\//i.test(ua)
              ? "Safari"
              : "Πρόγραμμα";
  const os = /windows/i.test(ua) ? "Windows" : /iphone|ipad/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "";
  return [browser, os, mobile ? "κινητό" : ""].filter(Boolean).join(" · ");
}
