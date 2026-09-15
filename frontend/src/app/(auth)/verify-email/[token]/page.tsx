import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { getDb } from "@/db";
import { verifyEmailToken } from "@/lib/auth/security";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Επαλήθευση email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ params }: PageProps<"/verify-email/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const result = await verifyEmailToken(db, token);
  const user = await getCurrentUser(db);
  return (
    <AuthShell title="Επαλήθευση email">
      {result.ok ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="text-sm">Το email σας επαληθεύτηκε. Ευχαριστούμε!</p>
          <Button asChild className="mt-2">
            <Link href={user ? "/dashboard" : "/login"}>{user ? "Συνέχεια στην εφαρμογή" : "Σύνδεση"}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="size-10 text-destructive" />
          <p className="text-sm">{result.error}</p>
          <Button asChild variant="outline" className="mt-2">
            <Link href={user ? "/account" : "/login"}>{user ? "Μετάβαση στον λογαριασμό" : "Σύνδεση"}</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
