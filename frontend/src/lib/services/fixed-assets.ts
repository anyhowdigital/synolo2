import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { fixedAssets, glEntries } from "@/db/schema";
import { postEntry } from "@/lib/services/gl";

const round2 = (n: number) => Math.round(n * 100) / 100;
const now = () => new Date().toISOString();

export interface AssetInput {
  name: string;
  category?: string;
  accountCode?: string;
  acquiredAt: string;
  cost: number;
  salvage?: number;
  usefulYears: number;
}

export async function listAssets(db: Db, orgId: string) {
  return db.select().from(fixedAssets).where(eq(fixedAssets.orgId, orgId)).orderBy(asc(fixedAssets.acquiredAt));
}

export async function saveAsset(db: Db, orgId: string, input: AssetInput, id?: string) {
  if (!input.name.trim()) throw new Error("Συμπληρώστε την ονομασία του παγίου.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquiredAt)) throw new Error("Μη έγκυρη ημερομηνία κτήσης.");
  if (input.cost <= 0) throw new Error("Η αξία κτήσης πρέπει να είναι θετική.");
  if (input.usefulYears <= 0) throw new Error("Η ωφέλιμη ζωή πρέπει να είναι θετική.");
  const values = {
    orgId,
    name: input.name.trim(),
    category: input.category ?? "",
    accountCode: input.accountCode || "12",
    acquiredAt: input.acquiredAt,
    cost: round2(input.cost),
    salvage: round2(input.salvage ?? 0),
    usefulYears: input.usefulYears,
  };
  if (id) {
    await db.update(fixedAssets).set(values).where(and(eq(fixedAssets.id, id), eq(fixedAssets.orgId, orgId)));
    return id;
  }
  const newId = randomUUID();
  await db.insert(fixedAssets).values({ id: newId, ...values, method: "straight", active: true, createdAt: now() });
  return newId;
}

export async function deleteAsset(db: Db, orgId: string, id: string) {
  await db.delete(fixedAssets).where(and(eq(fixedAssets.id, id), eq(fixedAssets.orgId, orgId)));
}

/** Μηνιαία απόσβεση σταθερής μεθόδου, με προ-ρατα για τον μήνα κτήσης. */
export function monthlyAmount(asset: { cost: number; salvage: number; usefulYears: number; acquiredAt: string }, month: string) {
  const depreciable = asset.cost - asset.salvage;
  if (depreciable <= 0 || asset.usefulYears <= 0) return 0;
  const monthly = depreciable / (asset.usefulYears * 12);
  const acq = asset.acquiredAt.slice(0, 7);
  if (month < acq) return 0;
  const monthsElapsed = monthDiff(acq, month);
  const totalMonths = Math.round(asset.usefulYears * 12);
  if (monthsElapsed >= totalMonths) return 0;
  return round2(monthly);
}

function monthDiff(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Συνολικές αποσβέσεις ανά πάγιο μέχρι και τον μήνα. */
export async function assetSchedule(db: Db, orgId: string, month: string) {
  const assets = await listAssets(db, orgId);
  return assets.map((a) => {
    const monthly = monthlyAmount(a, month);
    const monthsElapsed = Math.max(0, Math.min(Math.round(a.usefulYears * 12), monthDiff(a.acquiredAt.slice(0, 7), month) + 1));
    const accumulated = round2(Math.min(a.cost - a.salvage, (a.cost - a.salvage) / (a.usefulYears * 12) * monthsElapsed));
    return { asset: a, monthly, accumulated, bookValue: round2(a.cost - accumulated) };
  });
}

/** Δημιουργεί (idempotent) άρθρα αποσβέσεων του μήνα: χρέωση 66, πίστωση του λογαριασμού παγίου. */
export async function postMonthlyDepreciation(db: Db, orgId: string, month: string, createdBy = "") {
  const rows = await assetSchedule(db, orgId, month);
  const existing = await db
    .select()
    .from(glEntries)
    .where(and(eq(glEntries.orgId, orgId), eq(glEntries.sourceType, "depreciation"), eq(glEntries.sourceId, month)));
  if (existing.length) return { created: 0, amount: 0, alreadyPosted: true };

  const lines = rows
    .filter((r) => r.monthly > 0 && r.asset.active)
    .map((r) => ({ accountCode: r.asset.accountCode || "12", credit: r.monthly, description: `Απόσβεση ${r.asset.name}` }));
  const total = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (!lines.length || total <= 0) return { created: 0, amount: 0, alreadyPosted: false };

  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  await postEntry(db, orgId, {
    date: lastDay,
    description: `Αποσβέσεις ${month}`,
    lines: [{ accountCode: "66", debit: total, description: `Αποσβέσεις ${month}` }, ...lines],
    sourceType: "depreciation",
    sourceId: month,
    createdBy,
  });
  return { created: lines.length, amount: total, alreadyPosted: false };
}
