import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Db } from "@/db";
import { webauthnCredentials, webauthnChallenges, type User } from "@/db/schema";

/**
 * Υπολογίζουμε rpID (relying party ID) και origin από το τρέχον request. Ο rpID είναι το domain
 * χωρίς σχήμα/θύρα. Σε localhost δουλεύει το "localhost". Οι passkeys δεσμεύονται στο rpID
 * και δεν μεταφέρονται σε άλλο domain – δεν επιτρέπουμε phishing.
 */
export async function rpFromRequest(): Promise<{ rpID: string; origin: string; rpName: string }> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;
  const rpID = host.split(":")[0];
  return { rpID, origin, rpName: "Σύνολο ERP" };
}

const CHALLENGE_TTL_MS = 5 * 60_000;

async function purgeExpiredChallenges(db: Db) {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date().toISOString()));
}

async function storeChallenge(db: Db, kind: "registration" | "authentication", challenge: string, userId: string | null): Promise<string> {
  await purgeExpiredChallenges(db);
  const id = randomUUID();
  await db.insert(webauthnChallenges).values({
    id,
    challenge,
    kind,
    userId,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
  return id;
}

async function consumeChallenge(db: Db, id: string, kind: "registration" | "authentication"): Promise<{ challenge: string; userId: string | null } | null> {
  const row = await db.query.webauthnChallenges.findFirst({ where: and(eq(webauthnChallenges.id, id), eq(webauthnChallenges.kind, kind)) });
  if (!row) return null;
  await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));
  if (new Date(row.expiresAt) < new Date()) return null;
  return { challenge: row.challenge, userId: row.userId };
}

/** Registration: options για νέο passkey σε συνδεδεμένο χρήστη. */
export async function buildRegistrationOptions(db: Db, user: User): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const { rpID, rpName } = await rpFromRequest();
  const existing = await db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? (c.transports.split(",") as ("internal" | "hybrid" | "usb" | "nfc" | "ble")[]) : undefined,
    })),
  });
  const challengeId = await storeChallenge(db, "registration", options.challenge, user.id);
  return { options, challengeId };
}

/** Registration: verify response και αποθήκευση credential. */
export async function verifyRegistration(db: Db, user: User, challengeId: string, response: RegistrationResponseJSON, nickname: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const rec = await consumeChallenge(db, challengeId, "registration");
  if (!rec) return { ok: false, error: "Η πρόκληση δεν ισχύει (έχει λήξει). Ξαναδοκιμάστε." };
  if (rec.userId !== user.id) return { ok: false, error: "Η πρόκληση δεν αντιστοιχεί στον χρήστη." };
  const { rpID, origin } = await rpFromRequest();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: rec.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (!verification.verified || !verification.registrationInfo) return { ok: false, error: "Η επαλήθευση απέτυχε." };

  const info = verification.registrationInfo;
  const cred = info.credential;
  const id = randomUUID();
  await db.insert(webauthnCredentials).values({
    id,
    userId: user.id,
    credentialId: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString("base64url"),
    counter: cred.counter,
    transports: (cred.transports ?? []).join(","),
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    nickname: nickname.slice(0, 60) || "Passkey",
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, id };
}

/** Authentication: options για login (usernameless — resident key). */
export async function buildAuthenticationOptions(db: Db): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
  const { rpID } = await rpFromRequest();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: [],
  });
  const challengeId = await storeChallenge(db, "authentication", options.challenge, null);
  return { options, challengeId };
}

/** Authentication: verify response και επιστροφή userId αν επιτυχία. */
export async function verifyAuthentication(db: Db, challengeId: string, response: AuthenticationResponseJSON): Promise<{ ok: true; userId: string; credentialDbId: string } | { ok: false; error: string }> {
  const rec = await consumeChallenge(db, challengeId, "authentication");
  if (!rec) return { ok: false, error: "Η πρόκληση δεν ισχύει (έχει λήξει). Ξαναδοκιμάστε." };
  const stored = await db.query.webauthnCredentials.findFirst({ where: eq(webauthnCredentials.credentialId, response.id) });
  if (!stored) return { ok: false, error: "Το passkey δεν είναι εγγεγραμμένο σε αυτόν τον λογαριασμό." };
  const { rpID, origin } = await rpFromRequest();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: rec.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter,
        transports: stored.transports ? (stored.transports.split(",") as ("internal" | "hybrid" | "usb" | "nfc" | "ble")[]) : undefined,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (!verification.verified) return { ok: false, error: "Η επαλήθευση passkey απέτυχε." };
  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() })
    .where(eq(webauthnCredentials.id, stored.id));
  return { ok: true, userId: stored.userId, credentialDbId: stored.id };
}

export async function listCredentials(db: Db, userId: string) {
  return db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId));
}

export async function deleteCredential(db: Db, userId: string, credentialDbId: string) {
  await db.delete(webauthnCredentials).where(and(eq(webauthnCredentials.id, credentialDbId), eq(webauthnCredentials.userId, userId)));
}

export async function renameCredential(db: Db, userId: string, credentialDbId: string, nickname: string) {
  await db
    .update(webauthnCredentials)
    .set({ nickname: nickname.slice(0, 60) || "Passkey" })
    .where(and(eq(webauthnCredentials.id, credentialDbId), eq(webauthnCredentials.userId, userId)));
}
