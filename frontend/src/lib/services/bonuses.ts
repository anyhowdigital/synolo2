import { isValidDate } from "@/lib/invoice/totals";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { payrollItems, payrollRuns, type Employee } from "@/db/schema";
import { EFKA, annualTax, getRun, listEmployees } from "@/lib/services/payroll";

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;

export type BonusKind = "xmas" | "easter" | "leave";

export const BONUS_LABEL: Record<BonusKind, string> = { xmas: "Δώρο Χριστουγέννων", easter: "Δώρο Πάσχα", leave: "Επίδομα αδείας" };

/** Κλειδί περιόδου: 2026-DX / 2026-DP / 2026-EA (μοναδικό ανά org+period). */
export const bonusRunKey = (year: number, kind: BonusKind) => `${year}-${kind === "xmas" ? "DX" : kind === "easter" ? "DP" : "EA"}`;

/** Ορθόδοξο Πάσχα (Meeus Julian) — για την προθεσμία πληρωμής του Δώρου Πάσχα (Μ. Τετάρτη). */
export function orthodoxEaster(year: number) {
  const a = year % 4, b = year % 7, c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day + 13));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

/** Ημερολογιακές ημέρες απασχόλησης εντός περιόδου (συμπεριλαμβανομένων άκρων). */
function daysWithin(emp: Employee, from: string, to: string) {
  const start = Math.max(utc(emp.hireDate).getTime(), utc(from).getTime());
  const end = Math.min(emp.endDate ? utc(emp.endDate).getTime() : Infinity, utc(to).getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / DAY) + 1;
}

/** Ημέρες κανονικής άδειας (πενθήμερο) με βάση την προϋπηρεσία στον ίδιο εργοδότη. */
export function leaveDays(emp: Employee, year: number) {
  if (!isValidDate(emp.hireDate) || (emp.endDate && !isValidDate(emp.endDate))) throw new Error("Ελέγξτε τις ημερομηνίες απασχόλησης.");
  if (daysWithin(emp, `${year}-01-01`, `${year}-12-31`) === 0) return 0;
  const hire = utc(emp.hireDate);
  const hireYear = hire.getUTCFullYear();
  const yearsAtEnd = (Date.UTC(year, 11, 31) - hire.getTime()) / (365.25 * DAY);
  if (yearsAtEnd >= 25) return 26;
  if (yearsAtEnd >= 10) return 25;
  if (hireYear === year) {
    const monthsEmployed = 12 - hire.getUTCMonth() - (hire.getUTCDate() > 15 ? 0.5 : 0);
    return round2(Math.min(20, (20 / 12) * monthsEmployed));
  }
  if (hireYear === year - 1) return 21;
  return 22;
}

export interface BonusCalc {
  base: number;
  qualifyingDays: number;
  periodDays: number;
  leaveIncrement: number;
  gross: number;
  explain: string;
}

/**
 * Δώρο Χριστουγέννων: περίοδος 1/5–31/12. Πλήρες = 1 μισθός (25 ημερομίσθια).
 * Αναλογία: 2/25 του μισθού (2 ημερομίσθια) ανά 19 ημερολογιακές ημέρες. Προσαύξηση 4,166% (αναλογία επιδόματος αδείας).
 */
export function christmasBonus(emp: Employee, year: number): BonusCalc {
  const from = `${year}-05-01`, to = `${year}-12-31`;
  const periodDays = daysWithin({ ...emp, hireDate: from, endDate: null } as Employee, from, to);
  const days = daysWithin(emp, from, to);
  const salaried = emp.grossSalary > 0;
  const full = salaried ? emp.grossSalary : emp.dailyWage * 25;
  const base = days >= periodDays ? full : round2(((salaried ? (emp.grossSalary * 2) / 25 : emp.dailyWage * 2) * days) / 19);
  const leaveIncrement = round2(base * 0.04166);
  return { base, qualifyingDays: days, periodDays, leaveIncrement, gross: round2(base + leaveIncrement), explain: days >= periodDays ? "Πλήρης απασχόληση 1/5–31/12 → 1 μισθός" : `${days} ημέρες × 2/25 μισθού ανά 19 ημέρες` };
}

/**
 * Δώρο Πάσχα: περίοδος 1/1–30/4. Πλήρες = ½ μισθός (15 ημερομίσθια).
 * Αναλογία: 1/15 του ½ μισθού (1 ημερομίσθιο) ανά 8 ημερολογιακές ημέρες. Προσαύξηση 4,166%.
 */
export function easterBonus(emp: Employee, year: number): BonusCalc {
  const from = `${year}-01-01`, to = `${year}-04-30`;
  const periodDays = daysWithin({ ...emp, hireDate: from, endDate: null } as Employee, from, to);
  const days = daysWithin(emp, from, to);
  const salaried = emp.grossSalary > 0;
  const full = salaried ? emp.grossSalary / 2 : emp.dailyWage * 15;
  const base = days >= periodDays ? round2(full) : round2(((salaried ? emp.grossSalary / 2 / 15 : emp.dailyWage) * days) / 8);
  const leaveIncrement = round2(base * 0.04166);
  return { base, qualifyingDays: days, periodDays, leaveIncrement, gross: round2(base + leaveIncrement), explain: days >= periodDays ? "Πλήρης απασχόληση 1/1–30/4 → ½ μισθός" : `${days} ημέρες × 1/15 του ½ μισθού ανά 8 ημέρες` };
}

/** Επίδομα αδείας: αποδοχές ημερών άδειας, με ανώτατο όριο ½ μισθού (13 ημερομίσθια). */
export function leaveAllowance(emp: Employee, year: number): BonusCalc {
  const days = leaveDays(emp, year);
  const salaried = emp.grossSalary > 0;
  const daily = salaried ? emp.grossSalary / 25 : emp.dailyWage;
  const cap = salaried ? emp.grossSalary / 2 : emp.dailyWage * 13;
  if (daysWithin(emp, `${year}-01-01`, `${year}-12-31`) === 0) return { base: 0, qualifyingDays: 0, periodDays: 0, leaveIncrement: 0, gross: 0, explain: "Χωρίς απασχόληση στο επιλεγμένο έτος." };
  if (emp.endDate && emp.endDate.slice(0, 4) === String(year) && year - Number(emp.hireDate.slice(0, 4)) < 2) {
    throw new Error("Λύση σύμβασης στο πρώτο/δεύτερο ημερολογιακό έτος: το επίδομα αδείας χρειάζεται εξατομικευμένο υπολογισμό από τον λογιστή. Δεν υπολογίζεται αυτόματα πλήρες ετήσιο επίδομα.");
  }
  const gross = round2(Math.min(days * daily, cap));
  return { base: gross, qualifyingDays: days, periodDays: 0, leaveIncrement: 0, gross, explain: `${days} ημέρες άδειας × ${daily.toFixed(2)} € (όριο ${cap.toFixed(2)} €)` };
}

export function computeBonus(emp: Employee, kind: BonusKind, year: number) {
  return kind === "xmas" ? christmasBonus(emp, year) : kind === "easter" ? easterBonus(emp, year) : leaveAllowance(emp, year);
}

/** Κρατήσεις δώρου: ΕΦΚΑ κανονικά, ΦΜΥ με τον μέσο ετήσιο συντελεστή του εργαζομένου. */
export function bonusDeductions(emp: Employee, gross: number) {
  const efkaEmployee = round2(gross * EFKA.employee);
  const efkaEmployer = round2(gross * EFKA.employer);
  const taxable = round2(gross - efkaEmployee);
  const regularMonthly = emp.grossSalary > 0 ? emp.grossSalary : emp.dailyWage * 25;
  const regularTaxableAnnual = regularMonthly * (1 - EFKA.employee) * 14;
  const rate = regularTaxableAnnual > 0 ? annualTax(regularTaxableAnnual, emp.children) / regularTaxableAnnual : 0;
  const tax = round2(taxable * rate);
  return { efkaEmployee, efkaEmployer, taxable, tax, net: round2(taxable - tax) };
}

/** Υπολογισμός/επανυπολογισμός δώρου ή επιδόματος για όλους τους εργαζόμενους της χρονιάς. */
export async function computeBonusRun(db: Db, orgId: string, kind: BonusKind, year: number, createdBy = "") {
  const key = bonusRunKey(year, kind);
  const existing = await getRun(db, orgId, key);
  if (existing?.run.status === "posted") throw new Error(`${BONUS_LABEL[kind]} ${year} έχει καταχωρηθεί λογιστικά.`);
  const [from, to] = kind === "xmas" ? [`${year}-05-01`, `${year}-12-31`] : kind === "easter" ? [`${year}-01-01`, `${year}-04-30`] : [`${year}-01-01`, `${year}-12-31`];
  const staff = (await listEmployees(db, orgId)).filter((e) => e.hireDate <= to && (!e.endDate || e.endDate >= from));
  if (!staff.length) throw new Error("Δεν υπάρχουν εργαζόμενοι με απασχόληση στην περίοδο.");

  const rows = staff
    .map((emp) => {
      const calc = computeBonus(emp, kind, year);
      const d = bonusDeductions(emp, calc.gross);
      return { emp, calc, d };
    })
    .filter((r) => r.calc.gross > 0);

  const totals = rows.reduce(
    (a, r) => ({ gross: a.gross + r.calc.gross, ee: a.ee + r.d.efkaEmployee, er: a.er + r.d.efkaEmployer, tax: a.tax + r.d.tax, net: a.net + r.d.net }),
    { gross: 0, ee: 0, er: 0, tax: 0, net: 0 },
  );
  const runId = existing?.run.id ?? randomUUID();
  const values = { grossTotal: round2(totals.gross), efkaEmployee: round2(totals.ee), efkaEmployer: round2(totals.er), taxTotal: round2(totals.tax), netTotal: round2(totals.net) };
  if (existing) {
    await db.delete(payrollItems).where(eq(payrollItems.runId, runId));
    await db.update(payrollRuns).set(values).where(eq(payrollRuns.id, runId));
  } else {
    await db.insert(payrollRuns).values({ id: runId, orgId, month: key, kind, status: "draft", ...values, createdBy, createdAt: new Date().toISOString() });
  }
  for (const { emp, calc, d } of rows) {
    await db.insert(payrollItems).values({
      id: randomUUID(),
      orgId,
      runId,
      employeeId: emp.id,
      employeeName: `${emp.lastName} ${emp.firstName}`,
      days: calc.qualifyingDays,
      hours: 0,
      overtimeHours: 0,
      overtimeAmount: 0,
      bonus: calc.gross,
      gross: calc.gross,
      ...d,
      note: calc.explain,
    });
  }
  return (await getRun(db, orgId, key))!;
}

export async function listBonusRuns(db: Db, orgId: string, year: number) {
  const out: Record<BonusKind, Awaited<ReturnType<typeof getRun>>> = { xmas: null, easter: null, leave: null };
  for (const kind of ["xmas", "easter", "leave"] as BonusKind[]) out[kind] = await getRun(db, orgId, bonusRunKey(year, kind));
  return out;
}

export function bonusDeadline(kind: BonusKind, year: number) {
  if (kind === "xmas") return `${year}-12-21`;
  if (kind === "easter") {
    const e = orthodoxEaster(year);
    return iso(new Date(e.getTime() - 4 * DAY));
  }
  return "με τη λήψη της άδειας";
}

export async function runByKey(db: Db, orgId: string, key: string) {
  return db.query.payrollRuns.findFirst({ where: and(eq(payrollRuns.orgId, orgId), eq(payrollRuns.month, key)) });
}
