import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { customers, series, type Invoice, type Organization } from "@/db/schema";
import { parsePdfTheme, type PdfTheme } from "@/lib/pdf/theme";
import { resolveDocLang, type DocLang } from "@/lib/pdf/labels";

export interface DocumentPresentation {
  theme: PdfTheme;
  /** Όροι που εκτυπώνονται (σειρά > οργανισμός). */
  terms: string;
  /** Γλώσσα παραστατικού (ρητή επιλογή > γλώσσα πελάτη > χώρα/δίγλωσσο > ελληνικά). */
  lang: DocLang;
}

/** Θέμα εμφάνισης, όροι και γλώσσα που ισχύουν για ένα συγκεκριμένο παραστατικό. */
export async function documentPresentation(
  db: Db,
  org: Organization,
  invoice: Pick<Invoice, "seriesId" | "customerId" | "customerCountry">,
  langOverride?: string | null,
): Promise<DocumentPresentation> {
  const theme = parsePdfTheme(org.pdfThemeJson);
  const [row, customer] = await Promise.all([
    invoice.seriesId ? db.query.series.findFirst({ where: eq(series.id, invoice.seriesId), columns: { termsText: true } }) : Promise.resolve(null),
    invoice.customerId ? db.query.customers.findFirst({ where: eq(customers.id, invoice.customerId), columns: { language: true } }) : Promise.resolve(null),
  ]);
  const lang = resolveDocLang({ customerCountry: invoice.customerCountry, customerLanguage: customer?.language, bilingualEnabled: org.bilingualInvoices, override: langOverride });
  return { theme, terms: (row?.termsText ?? "").trim() || theme.terms, lang };
}

/** Γλώσσα επικοινωνίας πελάτη (για email) – χωρίς το δίγλωσσο. */
export async function customerLanguage(db: Db, customerId: string | null | undefined) {
  if (!customerId) return "el" as const;
  const c = await db.query.customers.findFirst({ where: eq(customers.id, customerId), columns: { language: true } });
  const l = c?.language;
  return l === "en" || l === "de" || l === "it" ? l : ("el" as const);
}
