"use server";

import { eq } from "drizzle-orm";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, createSession } from "@/lib/auth/session";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  deleteCredential,
  listCredentials,
  renameCredential,
  verifyAuthentication,
  verifyRegistration,
} from "@/lib/auth/passkeys";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/services/audit";
import { resolveActor } from "@/lib/services/actor";
import { memberships } from "@/db/schema";

export async function passkeyRegisterOptionsAction() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const { options, challengeId } = await buildRegistrationOptions(db, user);
  return { ok: true as const, options, challengeId };
}

export async function passkeyRegisterVerifyAction(challengeId: string, response: RegistrationResponseJSON, nickname: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const res = await verifyRegistration(db, user, challengeId, response, nickname);
  if (!res.ok) return res;
  const orgRow = await db.query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
  if (orgRow) await audit(db, orgRow.orgId, "user", user.id, "passkey_registered", nickname || "Passkey", await resolveActor(db));
  revalidatePath("/account");
  return { ok: true as const };
}

export async function passkeyDeleteAction(credentialDbId: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  await deleteCredential(db, user.id, credentialDbId);
  const orgRow = await db.query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
  if (orgRow) await audit(db, orgRow.orgId, "user", user.id, "passkey_deleted", credentialDbId, await resolveActor(db));
  revalidatePath("/account");
  return { ok: true as const };
}

export async function passkeyRenameAction(credentialDbId: string, nickname: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  await renameCredential(db, user.id, credentialDbId, nickname);
  revalidatePath("/account");
  return { ok: true as const };
}

export async function listMyPasskeysAction() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return { ok: false as const, error: "Απαιτείται σύνδεση." };
  const rows = await listCredentials(db, user.id);
  return {
    ok: true as const,
    rows: rows.map((r) => ({
      id: r.id,
      nickname: r.nickname,
      deviceType: r.deviceType,
      backedUp: r.backedUp,
      transports: r.transports,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    })),
  };
}

/* ---------- Login flow ---------- */

export async function passkeyLoginOptionsAction() {
  const db = await getDb();
  const { options, challengeId } = await buildAuthenticationOptions(db);
  return { ok: true as const, options, challengeId };
}

export async function passkeyLoginVerifyAction(challengeId: string, response: AuthenticationResponseJSON) {
  const db = await getDb();
  const res = await verifyAuthentication(db, challengeId, response);
  if (!res.ok) return res;
  const user = await db.query.users.findFirst({ where: eq(users.id, res.userId) });
  if (!user) return { ok: false as const, error: "Ο χρήστης δεν βρέθηκε." };
  await createSession(db, user.id);
  return { ok: true as const };
}
