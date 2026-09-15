"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicText } from "@/lib/i18n/public";
import type { DocumentLanguage } from "@/lib/i18n/languages";

export function PrintToolbar({
  backHref,
  backLabel = "Πίσω στο παραστατικό",
  pdfHref,
  downloadHref,
  downloadLabel,
  lang = "el",
  children,
}: {
  backHref?: string;
  backLabel?: string;
  pdfHref?: string;
  downloadHref?: string;
  downloadLabel?: string;
  lang?: DocumentLanguage;
  children?: React.ReactNode;
}) {
  const tx = publicText(lang);
  const dl = downloadHref ?? pdfHref;
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
      {backHref ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft data-icon="inline-start" /> {backLabel}
          </Link>
        </Button>
      ) : (
        <span className="text-sm font-medium">Σύνολο ERP</span>
      )}
      <div className="flex items-center gap-2">
        {children}
        {dl ? (
          <Button asChild size="sm" variant="outline">
            <a href={dl} download>
              <FileDown data-icon="inline-start" /> {downloadLabel ?? tx.downloadPdf}
            </a>
          </Button>
        ) : null}
        <Button size="sm" onClick={() => window.print()}>
          <Printer data-icon="inline-start" /> {tx.print}
        </Button>
      </div>
    </div>
  );
}
