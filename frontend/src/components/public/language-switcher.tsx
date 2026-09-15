"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { DOCUMENT_LANGUAGES, type DocumentLanguage } from "@/lib/i18n/languages";
import { publicText } from "@/lib/i18n/public";

/** Επιλογή γλώσσας δημόσιας σελίδας/PDF – αποθηκεύεται στο ?lang= ώστε να ακολουθεί και τη λήψη PDF. */
export function LanguageSwitcher({ current, bilingual }: { current: DocumentLanguage | "bilingual"; bilingual?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tx = publicText(current === "bilingual" ? "en" : current);
  const value = current;

  return (
    <label className="flex items-center gap-1.5 text-sm">
      <Globe className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{tx.language}</span>
      <select
        className="h-8 rounded-md border bg-background px-2 text-sm"
        value={value}
        aria-label={tx.language}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set("lang", e.target.value);
          router.replace(`${pathname}?${next.toString()}`);
        }}
      >
        {DOCUMENT_LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
        {bilingual || value === "bilingual" ? <option value="bilingual">Ελληνικά / English</option> : null}
      </select>
    </label>
  );
}
