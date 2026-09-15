/**
 * Στοιχεία παρόχου για Όρους χρήσης / Πολιτική απορρήτου. Ρυθμίζονται με μεταβλητές περιβάλλοντος
 * LEGAL_* ώστε ο ιδιοκτήτης του SaaS να βάλει τη δική του εταιρεία χωρίς αλλαγή κώδικα.
 * Οι προεπιλογές είναι placeholder και σημαίνονται ως τέτοιες στη σελίδα.
 */
export interface LegalProvider {
  serviceName: string;
  companyName: string;
  afm: string;
  address: string;
  email: string;
  privacyEmail: string;
  dpoEmail: string;
  court: string;
  updated: string;
  configured: boolean;
}

export function legalProvider(): LegalProvider {
  const companyName = process.env.LEGAL_COMPANY_NAME?.trim() ?? "";
  const configured = companyName.length > 0;
  return {
    serviceName: process.env.LEGAL_SERVICE_NAME?.trim() || "Σύνολο ERP",
    companyName: companyName || "[Επωνυμία παρόχου – ορίστε LEGAL_COMPANY_NAME]",
    afm: process.env.LEGAL_AFM?.trim() || "[ΑΦΜ παρόχου]",
    address: process.env.LEGAL_ADDRESS?.trim() || "[Διεύθυνση έδρας]",
    email: process.env.LEGAL_EMAIL?.trim() || "legal@example.com",
    privacyEmail: process.env.LEGAL_PRIVACY_EMAIL?.trim() || process.env.LEGAL_EMAIL?.trim() || "privacy@example.com",
    dpoEmail: process.env.LEGAL_DPO_EMAIL?.trim() || process.env.LEGAL_PRIVACY_EMAIL?.trim() || process.env.LEGAL_EMAIL?.trim() || "dpo@example.com",
    court: process.env.LEGAL_COURT_CITY?.trim() || "Αθήνας",
    updated: process.env.LEGAL_UPDATED?.trim() || "10 Σεπτεμβρίου 2026",
    configured,
  };
}
