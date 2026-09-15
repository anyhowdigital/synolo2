import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { PasskeyLoginButton } from "@/components/auth/passkey-login-button";

export const metadata = { title: "Σύνδεση" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const db = await getDb();
  if (await getCurrentUser(db)) redirect("/dashboard");
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthShell
      title="Καλώς ήρθατε στο Σύνολο."
      description="Συνδεθείτε στην επιχείρηση ή στο λογιστικό σας γραφείο. Ένα σημείο εισόδου, το δικό σας περιβάλλον."
      footer={
        <>
          Δεν έχετε λογαριασμό;{" "}
          <Link href="/register" className="font-semibold underline" data-testid="login-register-link">
            Δημιουργήστε τον δικό σας
          </Link>
          <details className="synolo-demo-disclosure" data-testid="login-demo-details">
            <summary data-testid="login-demo-toggle">Θέλετε πρώτα να δείτε ένα παράδειγμα; <ChevronDown className="size-3" /></summary>
            <div data-testid="login-demo-credentials">Δοκιμαστική επιχείρηση με ενδεικτικά δεδομένα.<br />Email: <code>demo@timologio.gr</code><br />Κωδικός: <code>demo1234</code></div>
          </details>
        </>
      }
    >
      <LoginForm next={next} />
      <PasskeyLoginButton next={next} />
    </AuthShell>
  );
}
