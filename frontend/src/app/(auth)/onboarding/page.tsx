import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentContext, getCurrentUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingWizard } from "@/components/auth/onboarding-wizard";

export const metadata = { title: "Ρύθμιση επιχείρησης" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect("/login");
  const ctx = await getCurrentContext(db);
  if (ctx && sp.new !== "1") redirect("/dashboard");
  return (
    <AuthShell
      wide
      title={ctx ? "Νέα επιχείρηση" : "Ας στήσουμε την επιχείρησή σας"}
      description="Τρία γρήγορα βήματα: στοιχεία εκδότη, myDATA & τιμολόγηση, ολοκλήρωση. Διαρκεί λιγότερο από ένα λεπτό."
    >
      <OnboardingWizard defaultEmail={user.email} />
    </AuthShell>
  );
}
