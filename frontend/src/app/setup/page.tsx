import { Database, ExternalLink, Receipt, ShieldAlert } from "lucide-react";
import { databaseConfig } from "@/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Απαιτείται ρύθμιση βάσης δεδομένων", robots: { index: false, follow: false } };

/**
 * Εμφανίζεται (μέσω proxy) όταν η εφαρμογή τρέχει σε serverless περιβάλλον χωρίς DATABASE_URL.
 */
export default function SetupPage() {
  const cfg = databaseConfig();
  const vars = [
    { name: "DATABASE_URL", alt: "TURSO_DATABASE_URL", set: !!(process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL) },
    { name: "DATABASE_AUTH_TOKEN", alt: "TURSO_AUTH_TOKEN", set: !!(process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN) },
    { name: "APP_URL", set: !!process.env.APP_URL },
    { name: "CRON_SECRET", set: !!process.env.CRON_SECRET },
  ];

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-12 text-neutral-900">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <Receipt className="size-4" />
          </span>
          Σύνολο ERP
        </div>

        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <h1 className="text-lg font-semibold">Η εφαρμογή χρειάζεται βάση δεδομένων για να ξεκινήσει</h1>
              <p className="mt-1 text-sm text-amber-900">
                Το deployment τρέχει σε serverless περιβάλλον χωρίς <code className="rounded bg-white/70 px-1">DATABASE_URL</code>. Χωρίς κοινή βάση, κάθε αίτημα θα εξυπηρετούνταν από διαφορετικό instance με
                δικά του δεδομένα: αποσύνδεση σε κάθε κλικ και παραστατικά που «εξαφανίζονται». Για αυτό η εφαρμογή σταματά εδώ μέχρι να ρυθμιστεί.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Database className="size-4" /> Κατάσταση μεταβλητών περιβάλλοντος
          </h2>
          <ul className="mt-3 divide-y text-sm">
            {vars.map((v) => (
              <li key={v.name} className="flex items-center justify-between py-2">
                <span className="font-mono">
                  {v.name}
                  {v.alt ? <span className="text-neutral-400"> / {v.alt}</span> : null}
                </span>
                <span className={v.set ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{v.set ? "ορίστηκε" : "λείπει"}</span>
              </li>
            ))}
          </ul>
          {cfg ? <p className="mt-3 text-sm text-emerald-700">Η βάση έχει ρυθμιστεί. Κάντε redeploy ώστε να ενεργοποιηθεί.</p> : null}
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Ρύθμιση σε 3 λεπτά (Vercel + Turso)</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
            <li>
              <strong>Επιλογή Α – Vercel Marketplace:</strong> στο Vercel project ανοίξτε <em>Storage → Create Database → Turso</em>, δημιουργήστε βάση (region Frankfurt) και συνδέστε την στο project. Το Vercel
              ορίζει αυτόματα <code className="rounded bg-neutral-100 px-1">TURSO_DATABASE_URL</code> και <code className="rounded bg-neutral-100 px-1">TURSO_AUTH_TOKEN</code>, τα οποία η εφαρμογή αναγνωρίζει.
            </li>
            <li>
              <strong>Επιλογή Β – turso.tech:</strong> δημιουργήστε βάση στο{" "}
              <a href="https://turso.tech" className="inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer">
                turso.tech <ExternalLink className="size-3" />
              </a>
              , αντιγράψτε το URL (<code className="rounded bg-neutral-100 px-1">libsql://…turso.io</code>) και δημιουργήστε token. Στο Vercel: <em>Settings → Environment Variables</em> προσθέστε{" "}
              <code className="rounded bg-neutral-100 px-1">DATABASE_URL</code> και <code className="rounded bg-neutral-100 px-1">DATABASE_AUTH_TOKEN</code>.
            </li>
            <li>
              Προσθέστε επίσης <code className="rounded bg-neutral-100 px-1">APP_URL</code> (π.χ. το domain του project) και <code className="rounded bg-neutral-100 px-1">CRON_SECRET</code> (τυχαίο string).
            </li>
            <li>
              <em>Deployments → ⋯ → Redeploy</em>. Στην πρώτη κλήση εκτελούνται τα migrations. Στη συνέχεια δημιουργήστε λογαριασμό από το <code className="rounded bg-neutral-100 px-1">/register</code>.
            </li>
            <li>
              Προαιρετικά, για δοκιμή: <code className="rounded bg-neutral-100 px-1">SEED_DEMO_DATA=true</code> δημιουργεί την επιδεικτική επιχείρηση (σύνδεση με <code className="rounded bg-neutral-100 px-1">demo@timologio.gr</code> /{" "}
              <code className="rounded bg-neutral-100 px-1">demo1234</code>). Ο κωδικός είναι δημόσιος – μην το ενεργοποιείτε σε πραγματικό deployment.
            </li>
          </ol>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">Η σελίδα αυτή εμφανίζεται μόνο σε serverless deployments χωρίς ρυθμισμένη βάση. Τοπικά χρησιμοποιείται αυτόματα SQLite αρχείο.</p>
      </div>
    </div>
  );
}
