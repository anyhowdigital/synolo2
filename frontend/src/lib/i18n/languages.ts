/** Γλώσσες παραστατικών/επικοινωνίας ανά πελάτη (ασφαλές για client bundles). */
export const DOCUMENT_LANGUAGES = [
  { id: "el", label: "Ελληνικά" },
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
] as const;

export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number]["id"];

export function isDocumentLanguage(v: unknown): v is DocumentLanguage {
  return DOCUMENT_LANGUAGES.some((l) => l.id === v);
}

export interface MemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
}
