import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Building2, Calculator, ArrowRight } from "lucide-react";
import { getDb } from "@/db";
import { invitations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Εγγραφή" };

const OPTIONS = [
  {
    href: "/register?type=business",
    testid: "register-type-business",
    icon: Building2,
    title: "Επιχείρηση / Ελεύθερος επαγγελματίας",
    desc: "Τιμολόγηση, έξοδα, myDATA, εισπράξεις, αποθήκη και αναφορές για τη δική σας δραστηριότητα.",
    bullets: ["Έκδοση & διαβίβαση παραστατικών", "Έξοδα, ταμείο, απαιτήσεις", "Σύνδεση με τον λογιστή σας"],
  },
  {
    href: "/accountant-signup",
    testid: "register-type-accountant",
    icon: Calculator,
    title: "Λογιστικό γραφείο",
    desc: "Δικό σας περιβάλλον γραφείου: πολλοί πελάτες, ημερολόγιο υποχρεώσεων, κίνδυνοι και μαζικές ενέργειες.",
    bullets: ["Πολλαπλές επιχειρήσεις σε ένα πάνελ", "Ομάδα γραφείου & ανάθεση πελατών", "Αμοιβές, εκκρεμότητες, AI βοηθός"],
  },
];

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const invite = typeof sp.invite === "string" ? sp.invite : undefined;
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const db = await getDb();
  if (await getCurrentUser(db)) redirect(invite ? `/invite/${invite}` : "/dashboard");
  const inv = invite ? await db.query.invitations.findFirst({ where: eq(invitations.token, invite) }) : null;

  if (!inv && type !== "business") {
    return (
      <AuthShell
        title="Η δική σας πλευρά του Συνόλου."
        description="Επιλέξτε από πού ξεκινάτε. Κάθε πλευρά έχει το δικό της περιβάλλον, με δυνατότητα σύνδεσης μεταξύ τους."
        footer={
          <>
            Έχετε ήδη λογαριασμό;{" "}
            <Link href="/login" className="font-medium underline" data-testid="register-chooser-login-link">
              Σύνδεση
            </Link>
          </>
        }
      >
        <div className="grid gap-3" data-testid="register-type-chooser">
          {OPTIONS.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              data-testid={o.testid}
              className="group auth-persona-card"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-lg border bg-muted p-2">
                  <o.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{o.title}</div>
                    <ArrowRight className="size-4 shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{o.desc}</p>
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {o.bullets.map((b) => (
                      <li key={b}>· {b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={inv ? "Αποδοχή πρόσκλησης" : "Η επιχείρησή σας ξεκινά εδώ."}
      description={inv ? `Έχετε προσκληθεί με ρόλο «${inv.role}». Δημιουργήστε λογαριασμό με το email ${inv.email}.` : "Δημιουργήστε πρώτα τον λογαριασμό σας. Τα στοιχεία της επιχείρησης θα τα συμπληρώσετε στο επόμενο βήμα. 14 ημέρες δοκιμή, χωρίς κάρτα."}
      footer={
        <>
          Έχετε ήδη λογαριασμό;{" "}
          <Link href="/login" className="font-medium underline" data-testid="register-form-login-link">
            Σύνδεση
          </Link>
          {!inv ? (
            <>
              {" · "}
              <Link href="/register" className="underline" data-testid="register-back-chooser">
                Αλλαγή τύπου λογαριασμού
              </Link>
            </>
          ) : null}
        </>
      }
    >
      <RegisterForm invite={invite} inviteEmail={inv?.email} />
    </AuthShell>
  );
}
