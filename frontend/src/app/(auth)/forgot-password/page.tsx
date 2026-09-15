import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Επαναφορά κωδικού" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Επαναφορά κωδικού"
      description="Θα σας στείλουμε σύνδεσμο για να ορίσετε νέο κωδικό."
      footer={
        <Link href="/login" className="font-medium text-foreground underline">
          Πίσω στη σύνδεση
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
