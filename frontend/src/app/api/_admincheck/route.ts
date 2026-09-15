import { NextRequest } from "next/server";
import { verifySuperAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  const email = process.env.SUPER_ADMIN_EMAIL ?? "";
  const out = {
    hasEmail: !!process.env.SUPER_ADMIN_EMAIL,
    hasHash: !!process.env.SUPER_ADMIN_PASSWORD_HASH,
    hasSecret: !!process.env.ADMIN_SESSION_SECRET,
    hashPrefix: (process.env.SUPER_ADMIN_PASSWORD_HASH ?? "").slice(0, 12),
    verify: await verifySuperAdmin(email, p),
  };
  return Response.json(out);
}
