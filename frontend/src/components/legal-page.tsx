import Link from "next/link";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LegalProvider } from "@/lib/legal";

export function LegalPage({ title, provider, children }: { title: string; provider: LegalProvider; children: React.ReactNode }) {
  const updated = provider.updated;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
              <Receipt className="size-4" />
            </span>
            {provider.serviceName}
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Σύνδεση</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Τελευταία ενημέρωση: {updated}</p>
        <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="font-medium">Πάροχος υπηρεσίας</div>
          <div className="text-muted-foreground">
            {provider.companyName} · ΑΦΜ {provider.afm} · {provider.address} · {provider.email}
          </div>
          {!provider.configured ? (
            <p className="mt-2 text-xs text-amber-700">
              Τα στοιχεία παρόχου δεν έχουν ρυθμιστεί. Ορίστε τις μεταβλητές LEGAL_COMPANY_NAME, LEGAL_AFM, LEGAL_ADDRESS, LEGAL_EMAIL (βλ. .env.example) πριν τη διάθεση σε πελάτες.
            </p>
          ) : null}
        </div>
        <div className="prose-sm mt-8 grid gap-6 text-[15px] leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-foreground/90">{children}</div>
      </main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        <Link href="/terms" className="underline">
          Όροι χρήσης
        </Link>
        {" · "}
        <Link href="/privacy" className="underline">
          Πολιτική απορρήτου
        </Link>
      </footer>
    </div>
  );
}
