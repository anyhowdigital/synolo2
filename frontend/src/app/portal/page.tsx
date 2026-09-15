import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { PortalRequestForm } from "@/components/portal/portal-request-form";

export const metadata = { title: "Σελίδα πελάτη", robots: { index: false, follow: false } };

export default function PortalLoginPage() {
  return (
    <AuthShell
      title="Σελίδα πελάτη"
      description="Δείτε τα παραστατικά, το υπόλοιπο και τις πληρωμές σας. Δώστε το email στο οποίο λαμβάνετε τα παραστατικά και θα σας στείλουμε προσωπικό σύνδεσμο – χωρίς κωδικό."
      footer={
        <span>
          Είστε επιχείρηση που εκδίδει παραστατικά;{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            Σύνδεση στην εφαρμογή
          </Link>
        </span>
      }
    >
      <PortalRequestForm />
    </AuthShell>
  );
}
