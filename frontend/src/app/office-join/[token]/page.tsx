import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountantProfiles, firmStaffInvites, users } from "@/db/schema";
import { FIRM_ROLES, type FirmRole } from "@/lib/services/firm";
import { StaffJoinForm } from "@/components/office/staff-join-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Πρόσκληση σε λογιστικό γραφείο" };
export const dynamic = "force-dynamic";

export default async function OfficeJoinPage({ params }: PageProps<"/office-join/[token]">) {
  const { token } = await params;
  const db = await getDb();
  const invite = await db.query.firmStaffInvites.findFirst({ where: and(eq(firmStaffInvites.token, token), eq(firmStaffInvites.status, "pending")) });

  if (!invite || invite.expiresAt < new Date().toISOString()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <Card>
          <CardHeader>
            <CardTitle>Η πρόσκληση δεν είναι έγκυρη</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground" data-testid="join-invalid">
            Ο σύνδεσμος έχει λήξει ή χρησιμοποιήθηκε. Ζητήστε νέα πρόσκληση από το γραφείο σας.
          </CardContent>
        </Card>
      </main>
    );
  }

  const profile = await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, invite.firmUserId) });
  const existing = await db.query.users.findFirst({ where: eq(users.email, invite.email) });

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Πρόσκληση από {profile?.firmName ?? "λογιστικό γραφείο"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {invite.email} · ρόλος {FIRM_ROLES[(invite.role as FirmRole) ?? "staff"]}
          </p>
        </CardHeader>
        <CardContent>
          <StaffJoinForm token={token} needsAccount={!existing} />
        </CardContent>
      </Card>
    </main>
  );
}
