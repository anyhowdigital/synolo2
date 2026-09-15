import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Νέος κωδικός" };

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return (
    <AuthShell title="Ορισμός νέου κωδικού">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
