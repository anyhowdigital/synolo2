import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __timologioDb?: Promise<Db> };

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured for this serverless deployment.");
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * Σύνδεση βάσης. Δέχεται DATABASE_URL/DATABASE_AUTH_TOKEN ή τα ονόματα που ορίζει αυτόματα η
 * ενσωμάτωση Turso του Vercel Marketplace (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN).
 * Σε serverless (Vercel) χωρίς απομακρυσμένη βάση ΔΕΝ γίνεται fallback σε τοπικό αρχείο: κάθε instance
 * θα είχε δική του βάση και τα sessions/δεδομένα θα «χάνονταν» ανά αίτημα.
 */
export function databaseConfig(): { url: string; authToken?: string } | null {
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
  if (url) return { url, authToken };
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return null;
  return { url: "file:./data/timologio.db" };
}

export function databaseConfigured() {
  return databaseConfig() !== null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Migrations με ανοχή σε ταυτόχρονη εκτέλεση: σε serverless πολλά instances μπορεί να ξεκινήσουν μαζί
 * και να τρέξουν το ίδιο ALTER/CREATE. Αν αποτύχει, περιμένουμε λίγο και ξαναδοκιμάζουμε· η δεύτερη
 * προσπάθεια βλέπει τα migrations ήδη καταγεγραμμένα και δεν κάνει τίποτα.
 */
async function migrateWithRetry(db: Db) {
  const folder = path.join(process.cwd(), "drizzle");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await migrate(db, { migrationsFolder: folder });
      return;
    } catch (err) {
      lastError = err;
      await sleep(500 + attempt * 1000);
    }
  }
  // Η αποτυχία migration δεν καλύπτεται από την ύπαρξη ενός παλιού πίνακα.
  throw lastError;
}

/**
 * Το demo σπέρνεται αυτόματα μόνο σε τοπική εγκατάσταση (αρχείο SQLite). Σε παραγωγή/serverless
 * απαιτεί ρητά SEED_DEMO_DATA=true, ώστε να μη δημιουργείται λογαριασμός επίδειξης με γνωστό κωδικό.
 */
function shouldSeedDemo(cfg: { url: string }) {
  const flag = (process.env.SEED_DEMO_DATA ?? "").toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return cfg.url.startsWith("file:") && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

async function init(): Promise<Db> {
  const cfg = databaseConfig();
  if (!cfg) throw new DatabaseNotConfiguredError();
  if (cfg.url.startsWith("file:")) {
    const filePath = cfg.url.replace(/^file:/, "");
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const client = createClient({ url: cfg.url, authToken: cfg.authToken });
  const db = drizzle(client, { schema });
  await migrateWithRetry(db);
  if (shouldSeedDemo(cfg)) {
    try {
      await seedIfEmpty(db);
    } catch (err) {
      // Δύο instances μπορεί να σπεύσουν να σπείρουν ταυτόχρονα· το seed είναι μόνο δεδομένα επίδειξης,
      // οπότε μια αποτυχία δεν πρέπει να ρίχνει την εφαρμογή.
      console.warn("[db] Το seed επίδειξης δεν ολοκληρώθηκε:", (err as Error).message);
    }
  }
  return db;
}

/** Επιστρέφει τη (μοναδική) σύνδεση βάσης, εκτελώντας migrations & seed την πρώτη φορά. */
export function getDb(): Promise<Db> {
  if (!globalForDb.__timologioDb) {
    globalForDb.__timologioDb = init().catch((err) => {
      globalForDb.__timologioDb = undefined;
      throw err;
    });
  }
  return globalForDb.__timologioDb;
}

export { schema };
