import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { fxRates } from "@/db/schema";

/**
 * Ισοτιμίες ΕΚΤ μέσω Frankfurter (δημόσιο API χωρίς κλειδί, δεδομένα Ευρωπαϊκής Κεντρικής Τράπεζας).
 * Αποθηκεύονται ανά ημέρα/νόμισμα στον πίνακα fx_rates ώστε κάθε ισοτιμία να ζητείται μία φορά.
 * Για μη εργάσιμες ημέρες η ΕΚΤ δίνει την ισοτιμία της προηγούμενης εργάσιμης – αυτό ισχύει και στα βιβλία.
 */
const FX_API = process.env.FX_API_URL ?? "https://api.frankfurter.dev/v1";

export interface FxQuote {
  currency: string;
  date: string;
  /** 1 μονάδα νομίσματος = rateToEur EUR */
  rateToEur: number;
  /** 1 EUR = eurTo μονάδες νομίσματος (όπως δημοσιεύει η ΕΚΤ) */
  eurTo: number;
  source: "cache" | "ecb";
  /** Ημερομηνία αναφοράς της ΕΚΤ (μπορεί να διαφέρει σε αργίες). */
  referenceDate: string;
}

export async function getRateToEur(db: Db, currency: string, date: string): Promise<FxQuote> {
  const cur = currency.toUpperCase();
  if (cur === "EUR") return { currency: "EUR", date, rateToEur: 1, eurTo: 1, source: "cache", referenceDate: date };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Μη έγκυρη ημερομηνία ισοτιμίας.");
  const today = new Date().toISOString().slice(0, 10);
  const lookup = date > today ? today : date;
  const id = `${lookup}:${cur}`;

  const cached = await db.query.fxRates.findFirst({ where: eq(fxRates.id, id) });
  if (cached) return { currency: cur, date: lookup, rateToEur: cached.rateToEur, eurTo: round6(1 / cached.rateToEur), source: "cache", referenceDate: cached.date };

  const res = await fetch(`${FX_API}/${lookup}?base=EUR&symbols=${cur}`, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Η υπηρεσία ισοτιμιών απάντησε ${res.status}.`);
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const eurTo = json.rates?.[cur];
  if (!eurTo || eurTo <= 0) throw new Error(`Δεν υπάρχει ισοτιμία ΕΚΤ για ${cur}.`);
  const rateToEur = round6(1 / eurTo);
  await db
    .insert(fxRates)
    .values({ id, date: json.date ?? lookup, currency: cur, rateToEur, fetchedAt: new Date().toISOString() })
    .onConflictDoNothing();
  return { currency: cur, date: lookup, rateToEur, eurTo, source: "ecb", referenceDate: json.date ?? lookup };
}

function round6(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
