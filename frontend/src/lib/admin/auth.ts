import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "@/lib/auth/password";

const ADMIN_COOKIE = "tc_admin";

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function token(email: string): string {
  return `${email}.${sign(email)}`;
}

/** Επαλήθευση credentials super-admin από μεταβλητές περιβάλλοντος. */
export async function verifySuperAdmin(email: string, password: string): Promise<boolean> {
  const envEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase();
  const hash = process.env.SUPER_ADMIN_PASSWORD_HASH ?? "";
  if (!envEmail || !hash || !secret()) return false;
  if (email.trim().toLowerCase() !== envEmail) return false;
  return verifyPassword(password, hash);
}

export async function startSuperAdminSession(email: string) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token(email.toLowerCase()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 3600,
  });
}

export async function endSuperAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** Τρέχων super-admin (email) ή null — έλεγχος υπογραφής cookie. */
export async function currentSuperAdmin(): Promise<string | null> {
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw || !secret()) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const email = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(email);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (email !== (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase()) return null;
  return email;
}
