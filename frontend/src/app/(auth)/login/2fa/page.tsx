import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { TotpLoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Επαλήθευση δύο βημάτων" };

export default async function TwoFactorPage({ searchParams }: PageProps<"/login/2fa">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthShell
      title="Επαλήθευση δύο βημάτων"
      description="Εισάγετε τον 6ψήφιο κωδικό από την εφαρμογή αυθεντικοποίησης (Google Authenticator, Authy, 1Password κ.ά.)."
      footer={
        <Link href="/login" className="underline">
          Πίσω στη σύνδεση
        </Link>
      }
    >
      <TotpLoginForm next={next} />
    </AuthShell>
  );
}
