/**
 * Ανάλυση extrait τράπεζας (CSV / TSV) σε γραμμές κίνησης.
 * Αναγνωρίζει αυτόματα διαχωριστικό, στήλες (ελληνικές/αγγλικές επικεφαλίδες), ημερομηνίες dd/mm/yyyy
 * και ποσά σε ελληνική μορφή (1.234,56) ή αγγλική (1,234.56). Στηρίζει είτε μία στήλη ποσού με πρόσημο,
 * είτε ξεχωριστές στήλες χρέωσης/πίστωσης.
 */

export interface ParsedStatementRow {
  bookedAt: string;
  amount: number;
  description: string;
  counterparty?: string;
  reference?: string;
  balanceAfter?: number | null;
}

export interface ColumnMapping {
  date: number;
  amount: number;
  debit: number;
  credit: number;
  description: number;
  counterparty: number;
  reference: number;
  balance: number;
}

export interface ParseResult {
  headers: string[];
  mapping: ColumnMapping;
  rows: ParsedStatementRow[];
  invalid: number;
  delimiter: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zα-ω0-9]+/g, " ")
    .trim();

const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  date: ["ημερομηνια", "ημ νια", "ημερ", "date", "booking date", "value date", "ημερομηνια συναλλαγης", "ημερομηνια κινησης"],
  amount: ["ποσο", "amount", "ποσο συναλλαγης", "ποσο κινησης", "κινηση"],
  debit: ["χρεωση", "debit", "εξοδα", "αναληψη", "εκροη", "withdrawal"],
  credit: ["πιστωση", "credit", "καταθεση", "εισροη", "deposit"],
  description: ["περιγραφη", "αιτιολογια", "description", "details", "σχολια", "λεπτομερειες", "narrative", "memo"],
  counterparty: ["αντισυμβαλλομενος", "δικαιουχος", "counterparty", "beneficiary", "payee", "ονομα", "name", "πληρωτης"],
  reference: ["αναφορα", "reference", "αριθμος συναλλαγης", "κωδικος", "ref", "transaction id", "αρ συναλλαγης", "αιτ πληρωμης"],
  balance: ["υπολοιπο", "balance", "λογιστικο υπολοιπο", "διαθεσιμο υπολοιπο"],
};

export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
  const counts = [";", "\t", ",", "|"].map((d) => ({ d, n: firstLines.reduce((s, l) => s + splitLine(l, d).length, 0) }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > firstLines.length ? counts[0].d : ";";
}

export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Ποσό σε ελληνική ("1.234,56", "-12,30", "1.234,56 €") ή αγγλική ("1,234.56") μορφή. */
export function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[€$£\s]/g, "").replace(/EUR/i, "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Το τελευταίο διαχωριστικό είναι το δεκαδικό.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    // "1.234" με ακριβώς 3 ψηφία μετά την τελεία και χωρίς άλλο δεκαδικό → χιλιάδες (ελληνική μορφή).
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Ημερομηνία σε ISO (yyyy-mm-dd) από dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy, yyyy-mm-dd, yyyymmdd. */
export function parseDate(raw: string): string | null {
  const s = String(raw ?? "").trim().split(/[ T]/)[0];
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(m[3], m[2], m[1]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return iso(`20${m[3]}`, m[2], m[1]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  return null;
}

function iso(y: string, mo: string, d: string): string | null {
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function detectMapping(headers: string[]): ColumnMapping {
  const normed = headers.map(norm);
  const find = (key: keyof ColumnMapping) => {
    const hints = HEADER_HINTS[key];
    let best = -1;
    let bestRank = Infinity;
    normed.forEach((h, i) => {
      const rank = hints.findIndex((hint) => h === hint);
      const partial = rank < 0 ? hints.findIndex((hint) => h.includes(hint)) : -1;
      const r = rank >= 0 ? rank : partial >= 0 ? partial + 100 : -1;
      if (r >= 0 && r < bestRank) {
        bestRank = r;
        best = i;
      }
    });
    return best;
  };
  const mapping: ColumnMapping = {
    date: find("date"),
    amount: find("amount"),
    debit: find("debit"),
    credit: find("credit"),
    description: find("description"),
    counterparty: find("counterparty"),
    reference: find("reference"),
    balance: find("balance"),
  };
  // Η στήλη "Ποσό" δεν πρέπει να συμπίπτει με χρέωση/πίστωση.
  if (mapping.amount >= 0 && (mapping.amount === mapping.debit || mapping.amount === mapping.credit)) mapping.amount = -1;
  if (mapping.balance >= 0 && mapping.balance === mapping.amount) mapping.balance = -1;
  return mapping;
}

/** Εάν δεν υπάρχει επικεφαλίδα, μαντεύουμε στήλες από το περιεχόμενο της πρώτης γραμμής. */
function guessMappingFromData(row: string[]): ColumnMapping {
  const mapping: ColumnMapping = { date: -1, amount: -1, debit: -1, credit: -1, description: -1, counterparty: -1, reference: -1, balance: -1 };
  row.forEach((cell, i) => {
    if (mapping.date < 0 && parseDate(cell)) mapping.date = i;
    else if (parseAmount(cell) != null && /\d/.test(cell) && !/[a-zα-ω]{3,}/i.test(cell)) {
      if (mapping.amount < 0) mapping.amount = i;
      else if (mapping.balance < 0) mapping.balance = i;
    } else if (mapping.description < 0 && cell.length > 3) mapping.description = i;
  });
  return mapping;
}

export function looksLikeHeader(cells: string[]): boolean {
  const withDigits = cells.filter((c) => /\d/.test(c)).length;
  return withDigits <= Math.floor(cells.length / 3) && !cells.some((c) => parseDate(c));
}

export function parseStatement(text: string, override?: Partial<ColumnMapping>): ParseResult {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], mapping: detectMapping([]), rows: [], invalid: 0, delimiter };
  const first = splitLine(lines[0], delimiter);
  const hasHeader = looksLikeHeader(first);
  const headers = hasHeader ? first : first.map((_, i) => `Στήλη ${i + 1}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const base = hasHeader ? detectMapping(headers) : guessMappingFromData(first);
  const mapping: ColumnMapping = { ...base, ...(override ?? {}) };
  const rows: ParsedStatementRow[] = [];
  let invalid = 0;
  const cell = (cells: string[], idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : "");
  for (const line of dataLines) {
    const cells = splitLine(line, delimiter);
    const bookedAt = parseDate(cell(cells, mapping.date));
    let amount: number | null = null;
    if (mapping.amount >= 0) amount = parseAmount(cell(cells, mapping.amount));
    if ((amount == null || amount === 0) && (mapping.debit >= 0 || mapping.credit >= 0)) {
      const debit = parseAmount(cell(cells, mapping.debit));
      const credit = parseAmount(cell(cells, mapping.credit));
      if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit != null && debit !== 0) amount = -Math.abs(debit);
    }
    if (!bookedAt || amount == null || amount === 0) {
      invalid++;
      continue;
    }
    const description = cell(cells, mapping.description) || cell(cells, mapping.counterparty) || "Κίνηση extrait";
    rows.push({
      bookedAt,
      amount: Math.round(amount * 100) / 100,
      description,
      counterparty: cell(cells, mapping.counterparty) || undefined,
      reference: cell(cells, mapping.reference) || undefined,
      balanceAfter: mapping.balance >= 0 ? parseAmount(cell(cells, mapping.balance)) : null,
    });
  }
  return { headers, mapping, rows, invalid, delimiter };
}
