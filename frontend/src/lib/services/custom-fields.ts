import { z } from "zod";

/** Οντότητες που δέχονται ετικέτες και custom πεδία. */
export type CustomFieldEntity = "customer" | "invoice" | "expense" | "product";

export const CUSTOM_FIELD_ENTITIES: { id: CustomFieldEntity; label: string }[] = [
  { id: "customer", label: "Πελάτες" },
  { id: "invoice", label: "Παραστατικά" },
  { id: "expense", label: "Έξοδα" },
  { id: "product", label: "Είδη" },
];

export const CUSTOM_FIELD_TYPES = [
  { id: "text", label: "Κείμενο" },
  { id: "number", label: "Αριθμός" },
  { id: "date", label: "Ημερομηνία" },
  { id: "select", label: "Επιλογή από λίστα" },
  { id: "checkbox", label: "Ναι/Όχι" },
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]["id"];

export const customFieldDefSchema = z.object({
  id: z.string().min(1),
  entity: z.enum(["customer", "invoice", "expense", "product"]),
  label: z.string().trim().min(1, "Το όνομα πεδίου είναι υποχρεωτικό.").max(60),
  type: z.enum(["text", "number", "date", "select", "checkbox"]),
  options: z.array(z.string().trim().min(1)).default([]),
  required: z.boolean().default(false),
  /** Εμφάνιση στο PDF/δημόσια σελίδα (μόνο για παραστατικά). */
  showOnPdf: z.boolean().default(false),
});

export type CustomFieldDef = z.infer<typeof customFieldDefSchema>;

export function parseCustomFieldDefs(json: string | null | undefined): CustomFieldDef[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((d) => customFieldDefSchema.safeParse(d)).filter((r) => r.success).map((r) => (r as { data: CustomFieldDef }).data);
  } catch {
    return [];
  }
}

export function defsFor(json: string | null | undefined, entity: CustomFieldEntity) {
  return parseCustomFieldDefs(json).filter((d) => d.entity === entity);
}

export type CustomFieldValues = Record<string, string | number | boolean | null>;

export function parseCustomFieldValues(json: string | null | undefined): CustomFieldValues {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

/**
 * Διαβάζει τιμές custom πεδίων από FormData (inputs με όνομα `cf.<id>`) και τις επικυρώνει
 * σύμφωνα με τους ορισμούς. Επιστρέφει σφάλμα για υποχρεωτικά κενά ή μη έγκυρους αριθμούς.
 */
export function readCustomFieldValues(fd: FormData, defs: CustomFieldDef[]): { values: CustomFieldValues; error?: string } {
  const values: CustomFieldValues = {};
  for (const def of defs) {
    const raw = fd.get(`cf.${def.id}`);
    const str = typeof raw === "string" ? raw.trim() : "";
    if (def.type === "checkbox") {
      values[def.id] = raw === "on" || raw === "true" || raw === "1";
      continue;
    }
    if (!str) {
      if (def.required) return { values, error: `Το πεδίο «${def.label}» είναι υποχρεωτικό.` };
      values[def.id] = null;
      continue;
    }
    if (def.type === "number") {
      const n = Number(str.replace(",", "."));
      if (!Number.isFinite(n)) return { values, error: `Το πεδίο «${def.label}» πρέπει να είναι αριθμός.` };
      values[def.id] = n;
    } else if (def.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { values, error: `Το πεδίο «${def.label}» πρέπει να είναι ημερομηνία.` };
      values[def.id] = str;
    } else if (def.type === "select") {
      if (def.options.length && !def.options.includes(str)) return { values, error: `Μη έγκυρη επιλογή για «${def.label}».` };
      values[def.id] = str;
    } else {
      values[def.id] = str.slice(0, 500);
    }
  }
  return { values };
}

/** Επικύρωση τιμών που έρχονται ως αντικείμενο (π.χ. από τον editor παραστατικών). */
export function validateCustomFieldValues(input: unknown, defs: CustomFieldDef[]): { values: CustomFieldValues; error?: string } {
  const fd = new FormData();
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      fd.set(`cf.${k}`, typeof v === "boolean" ? (v ? "on" : "") : String(v));
    }
  }
  return readCustomFieldValues(fd, defs);
}

export function formatCustomFieldValue(def: CustomFieldDef, value: CustomFieldValues[string]) {
  if (value === null || value === undefined || value === "") return "";
  if (def.type === "checkbox") return value ? "Ναι" : "Όχι";
  if (def.type === "date" && typeof value === "string") {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  if (def.type === "number") return new Intl.NumberFormat("el-GR").format(Number(value));
  return String(value);
}

/** Ετικέτες: JSON array σε text στήλη. Καθαρισμός, μοναδικότητα, μέγιστο 20 · 30 χαρακτήρες. */
export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return json
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
}

export function normalizeTags(input: unknown): string[] {
  const raw: unknown[] = Array.isArray(input) ? input : typeof input === "string" ? (input.trim().startsWith("[") ? parseTags(input) : input.split(",")) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const clean = t.trim().replace(/\s+/g, " ").slice(0, 30);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 20) break;
  }
  return out;
}

export function serializeTags(tags: string[]) {
  return JSON.stringify(normalizeTags(tags));
}

/** Σταθερή, ευανάγνωστη απόχρωση ανά ετικέτα (για chips). */
export function tagHue(tag: string) {
  let h = 0;
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Πεδία παραστατικού με `showOnPdf` που έχουν τιμή, μορφοποιημένα για PDF/δημόσια σελίδα. */
export function pdfCustomFields(orgDefsJson: string | null | undefined, valuesJson: string | null | undefined) {
  const values = parseCustomFieldValues(valuesJson);
  return defsFor(orgDefsJson, "invoice")
    .filter((d) => d.showOnPdf)
    .map((def) => ({ def, text: formatCustomFieldValue(def, values[def.id]) }))
    .filter((f) => f.text !== "");
}
