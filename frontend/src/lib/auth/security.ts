import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import type { Db } from "@/db";
import { emailVerifications, memberships, pendingLogins, sessions, users, type User } from "@/db/schema";
import { appUrl, layoutEmail, sendMail } from "@/lib/email/mailer";
import { randomToken } from "./password";

const ISSUER = "Σύνολο ERP";

/* ---------- Επαλήθευση email ---------- */

export async function sendVerificationEmail(db: Db, user: User) {
  const token = randomToken(24);
  await db.insert(emailVerifications).values({
    id: randomUUID(),
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  });
  const orgRow = await db.query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
  return sendMail(db, {
    orgId: orgRow?.orgId ?? "system",
    to: user.email,
    subject: "Επαληθεύστε το email σας – Σύνολο ERP",
    html: layoutEmail(
      "Επαλήθευση email",
      `Γεια σας ${user.name},<br/><br/>Επιβεβαιώστε ότι το <b>${user.email}</b> σας ανήκει για να ενεργοποιηθούν οι αποστολές παραστατικών και οι ειδοποιήσεις. Ο σύνδεσμος ισχύει για 48 ώρες.`,
      { label: "Επαλήθευση email", url: appUrl(`/verify-email/${token}`) },
    ),
    relatedEntity: "user",
    relatedId: user.id,
  });
}

export async function verifyEmailToken(db: Db, token: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const row = await db.query.emailVerifications.findFirst({ where: eq(emailVerifications.token, token) });
  if (!row || row.usedAt || new Date(row.expiresAt) < new Date()) {
    return { ok: false, error: "Ο σύνδεσμος επαλήθευσης δεν ισχύει πλέον. Ζητήστε νέο από τον λογαριασμό σας." };
  }
  const now = new Date().toISOString();
  await db.update(emailVerifications).set({ usedAt: now }).where(eq(emailVerifications.id, row.id));
  await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, row.userId));
  return { ok: true, userId: row.userId };
}

/* ---------- TOTP (2FA) ---------- */

function totpFor(user: Pick<User, "email">, secret: string) {
  return new OTPAuth.TOTP({ issuer: ISSUER, label: user.email, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}

/** Νέο μυστικό (σε εκκρεμότητα μέχρι την επιβεβαίωση με έγκυρο κωδικό). */
export async function beginTotpSetup(db: Db, user: User) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await db.update(users).set({ totpSecret: secret, totpEnabledAt: null }).where(eq(users.id, user.id));
  const uri = totpFor(user, secret).toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { secret, uri, qrDataUrl };
}

export function verifyTotpCode(user: Pick<User, "email" | "totpSecret">, code: string): boolean {
  if (!user.totpSecret) return false;
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const delta = totpFor(user, user.totpSecret).validate({ token: clean, window: 1 });
  return delta !== null;
}

export async function confirmTotpSetup(db: Db, user: User, code: string): Promise<boolean> {
  if (!verifyTotpCode(user, code)) return false;
  await db.update(users).set({ totpEnabledAt: new Date().toISOString() }).where(eq(users.id, user.id));
  return true;
}

export async function disableTotp(db: Db, userId: string) {
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null }).where(eq(users.id, userId));
}

/** Προσωρινή σύνδεση μετά τον κωδικό, πριν τον έλεγχο 2FA (5 λεπτά). */
export async function createPendingLogin(db: Db, userId: string) {
  const id = randomToken(32);
  await db.insert(pendingLogins).values({ id, userId, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  return id;
}

export async function consumePendingLogin(db: Db, id: string): Promise<User | null> {
  const row = await db.query.pendingLogins.findFirst({ where: eq(pendingLogins.id, id) });
  if (!row) return null;
  if (new Date(row.expiresAt) < new Date()) {
    await db.delete(pendingLogins).where(eq(pendingLogins.id, id));
    return null;
  }
  return (await db.query.users.findFirst({ where: eq(users.id, row.userId) })) ?? null;
}

export async function deletePendingLogin(db: Db, id: string) {
  await db.delete(pendingLogins).where(eq(pendingLogins.id, id));
}

/* ---------- Συνδέσεις (sessions) ---------- */

export async function listUserSessions(db: Db, userId: string) {
  return db.select().from(sessions).where(eq(sessions.userId, userId));
}

export async function revokeSession(db: Db, userId: string, sessionId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
}

export async function revokeOtherSessions(db: Db, userId: string, keepSessionId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

/** Σύντομη περιγραφή συσκευής από το user-agent. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Άγνωστη συσκευή";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : /curl/i.test(ua) ? "curl" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}
