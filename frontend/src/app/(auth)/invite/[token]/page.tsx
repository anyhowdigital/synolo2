import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvitationAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata = { title: "Πρόσκληση" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const inv = await db.query.invitations.findFirst({ where: eq(invitations.token, token) });
  const org = inv ? await db.query.organizations.findFirst({ where: eq(organizations.id, inv.orgId) }) : null;
  const valid = inv && org && !inv.acceptedAt && new Date(inv.expiresAt) > new Date();
  const user = await getCurrentUser(db);
  if (valid && !user) redirect(`/register?invite=${encodeURIComponent(token)}`);

  return (
    <AuthShell title="Πρόσκληση συνεργασίας" description={valid ? `Πρόσβαση στην επιχείρηση «${org!.name}» με ρόλο ${inv!.role}.` : undefined}>
      {!valid ? (
        <Alert variant="destructive">
          <AlertDescription>Η πρόσκληση δεν ισχύει πλέον ή έχει ήδη χρησιμοποιηθεί.</AlertDescription>
        </Alert>
      ) : user!.email.toLowerCase() !== inv!.email.toLowerCase() ? (
        <Alert variant="destructive">
          <AlertDescription>
            Η πρόσκληση αφορά το email {inv!.email}, αλλά είστε συνδεδεμένοι ως {user!.email}. Αποσυνδεθείτε και εγγραφείτε με το σωστό email.
          </AlertDescription>
        </Alert>
      ) : (
        <form
          action={async () => {
            "use server";
            await acceptInvitationAction(token);
          }}
        >
          <Button type="submit" className="w-full">
            Αποδοχή πρόσκλησης
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
