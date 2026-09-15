/** Ελαφρύς CSV parser (RFC 4180-ish): αυτόματη ανίχνευση διαχωριστικού (; , tab), εισαγωγικά, BOM, CRLF. */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function detectDelimiter(firstLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const n = firstLine.split(c).length - 1;
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const src = text.replace(/^\uFEFF/, "");
  const firstLineEnd = src.search(/\r?\n/);
  const delim = delimiter ?? detectDelimiter(firstLineEnd === -1 ? src : src.slice(0, firstLineEnd));

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f.trim() !== "")) records.push(record);
      record = [];
    } else field += ch;
  }
  record.push(field);
  if (record.some((f) => f.trim() !== "")) records.push(record);

  if (records.length === 0) return { headers: [], rows: [], delimiter: delim };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
  return { headers, rows, delimiter: delim };
}

/** Βρίσκει στήλη με βάση εναλλακτικά ονόματα (χωρίς διάκριση πεζών/κεφαλαίων και τόνων). */
export function pick(row: Record<string, string>, aliases: string[]): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9α-ω]/g, "");
  const keys = Object.keys(row);
  for (const a of aliases) {
    const na = norm(a);
    const k = keys.find((key) => norm(key) === na);
    if (k !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

export function parseNumber(v: string): number | null {
  if (!v) return null;
  const s = v.replace(/\s|€/g, "");
  // 1.234,56 → 1234.56 · 1,234.56 → 1234.56 · 1234,56 → 1234.56
  const normalized = s.includes(",") && s.includes(".") ? (s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")) : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
