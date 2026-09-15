import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { employees, payrollItems, payrollRuns, shifts, type Employee, type Organization } from "@/db/schema";
import { isValidDate } from "@/lib/invoice/totals";
import { postEntry } from "@/lib/services/gl";

const round2 = (n: number) => Math.round(n * 100) / 100;
const now = () => new Date().toISOString();

/** Συντελεστές ΕΦΚΑ (ΚΠΚ 101, μισθωτοί ιδιωτικού τομέα) — 2026. */
export const EFKA = { employee: 0.1337, employer: 0.2229 };

/** Κλίμακα ΦΜΥ (άρθρο 15 Ν.4172/2013). */
const TAX_BRACKETS: [number, number][] = [
  [10000, 0.09],
  [10000, 0.22],
  [10000, 0.28],
  [10000, 0.36],
  [Infinity, 0.44],
];

/** Έκπτωση φόρου βάσει τέκνων. */
function taxCredit(children: number) {
  if (children === 0) return 777;
  if (children === 1) return 900;
  if (children === 2) return 1120;
  if (children === 3) return 1340;
  return 1580 + (children - 4) * 220;
}

export function annualTax(taxableAnnual: number, children: number) {
  let left = Math.max(0, taxableAnnual);
  let tax = 0;
  for (const [size, rate] of TAX_BRACKETS) {
    const part = Math.min(left, size);
    tax += part * rate;
    left -= part;
    if (left <= 0) break;
  }
  const credit = taxableAnnual <= 12000 ? taxCredit(children) : Math.max(0, taxCredit(children) - ((taxableAnnual - 12000) / 1000) * 20);
  return Math.max(0, round2(tax - credit));
}

export interface PayrollItemInput {
  employeeId: string;
  days?: number;
  overtimeHours?: number;
  bonus?: number;
  note?: string;
}

/** Υπολογισμός γραμμής μισθοδοσίας (14 μισθοί: ο ΦΜΥ υπολογίζεται σε ετήσια βάση). */
export function computeItem(emp: Employee, input: PayrollItemInput) {
  const days = input.days ?? 25;
  if (![days, input.overtimeHours ?? 0, input.bonus ?? 0].every((v) => Number.isFinite(v) && v >= 0) || days > 31) throw new Error("Ελέγξτε ημέρες (0–31), υπερωρίες και πρόσθετες αποδοχές. Δεν επιτρέπονται αρνητικές τιμές.");
  const base = emp.grossSalary > 0 ? round2((emp.grossSalary / 25) * days) : round2(emp.dailyWage * days);
  const hourly = emp.hoursPerWeek > 0 ? (emp.grossSalary > 0 ? emp.grossSalary / (emp.hoursPerWeek * 4.33) : emp.dailyWage / 8) : 0;
  const overtimeHours = input.overtimeHours ?? 0;
  const overtimeAmount = round2(overtimeHours * hourly * 1.2);
  const bonus = round2(input.bonus ?? 0);
  const gross = round2(base + overtimeAmount + bonus);
  const efkaEmployee = round2(gross * EFKA.employee);
  const efkaEmployer = round2(gross * EFKA.employer);
  const taxable = round2(gross - efkaEmployee);
  const tax = round2(annualTax(taxable * 14, emp.children) / 14);
  const net = round2(taxable - tax);
  return {
    days,
    hours: round2(days * 8),
    overtimeHours,
    overtimeAmount,
    bonus,
    gross,
    efkaEmployee,
    efkaEmployer,
    taxable,
    tax,
    net,
    note: input.note ?? "",
  };
}

export async function listEmployees(db: Db, orgId: string) {
  return db.select().from(employees).where(eq(employees.orgId, orgId)).orderBy(asc(employees.lastName));
}

export async function saveEmployee(db: Db, orgId: string, data: Partial<Employee> & { firstName: string; lastName: string; hireDate: string }, id?: string) {
  if (!data.firstName?.trim() || !data.lastName?.trim()) throw new Error("Συμπληρώστε ονοματεπώνυμο εργαζομένου.");
  if (!isValidDate(data.hireDate) || (data.endDate && (!isValidDate(data.endDate) || data.endDate < data.hireDate))) throw new Error("Μη έγκυρες ημερομηνίες πρόσληψης/αποχώρησης.");
  if ([data.grossSalary, data.dailyWage, data.hoursPerWeek, data.children].some((v) => v !== undefined && (!Number.isFinite(v) || v < 0))) throw new Error("Οι αποδοχές, οι ώρες και τα τέκνα δεν μπορούν να είναι αρνητικά.");
  const existing = id ? await db.query.employees.findFirst({ where: and(eq(employees.id, id), eq(employees.orgId, orgId)) }) : null;
  if (id && !existing) throw new Error("Ο εργαζόμενος δεν βρέθηκε.");
  if (data.amka && !/^\d{11}$/.test(data.amka)) throw new Error("Ο ΑΜΚΑ αποτελείται από 11 ψηφία.");
  const values = {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    afm: (data.afm ?? "").replace(/\D/g, ""),
    amka: (data.amka ?? "").replace(/\D/g, ""),
    efkaAm: data.efkaAm ?? "",
    specialtyCode: data.specialtyCode ?? "",
    specialtyName: data.specialtyName ?? "",
    kpk: data.kpk || "101",
    contractType: data.contractType || "full",
    hireDate: data.hireDate,
    grossSalary: round2(data.grossSalary ?? 0),
    dailyWage: round2(data.dailyWage ?? 0),
    hoursPerWeek: data.hoursPerWeek ?? 40,
    children: data.children ?? 0,
    iban: data.iban ?? "",
    endDate: data.endDate === undefined ? existing?.endDate ?? null : data.endDate,
    active: data.active ?? existing?.active ?? true,
    birthDate: data.birthDate ?? "",
    sex: data.sex ?? "0",
    fatherName: data.fatherName ?? "",
    motherName: data.motherName ?? "",
    nationality: data.nationality || "000",
    idType: data.idType || "ΑΔΤ",
    idNumber: data.idNumber ?? "",
    maritalStatus: data.maritalStatus ?? "0",
    doy: data.doy ?? "",
    educationLevel: data.educationLevel ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
  };
  if (id) {
    await db.update(employees).set(values).where(and(eq(employees.id, id), eq(employees.orgId, orgId)));
    return id;
  }
  const newId = randomUUID();
  await db.insert(employees).values({ id: newId, orgId, ...values, createdAt: now() });
  return newId;
}

export async function getRun(db: Db, orgId: string, month: string) {
  const run = await db.query.payrollRuns.findFirst({ where: and(eq(payrollRuns.orgId, orgId), eq(payrollRuns.month, month)) });
  if (!run) return null;
  const items = await db.select().from(payrollItems).where(eq(payrollItems.runId, run.id));
  return { run, items };
}

/** Υπολογίζει (ή ξαναϋπολογίζει) τη μισθοδοσία του μήνα. Δεν δημιουργεί λογιστικό άρθρο. */
export async function computeRun(db: Db, orgId: string, month: string, createdBy = "", overrides: Record<string, PayrollItemInput> = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Μη έγκυρος μήνας.");
  const existing = await getRun(db, orgId, month);
  if (existing?.run.status === "posted") throw new Error(`Η μισθοδοσία ${month} έχει καταχωρηθεί λογιστικά.`);

  const staff = (await listEmployees(db, orgId)).filter((e) => (e.active || !!e.endDate) && e.hireDate.slice(0, 7) <= month && (!e.endDate || e.endDate.slice(0, 7) >= month));
  if (!staff.length) throw new Error("Δεν υπάρχουν ενεργοί εργαζόμενοι για τον μήνα.");

  const shiftRows = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.orgId, orgId), gte(shifts.workDate, `${month}-01`), lte(shifts.workDate, `${month}-31`)));

  const computed = staff.map((emp) => {
    const empShifts = shiftRows.filter((s) => s.employeeId === emp.id && s.kind === "work");
    const overtimeFromShifts = round2(empShifts.reduce((s, x) => s + x.overtimeMinutes, 0) / 60);
    const o = overrides[emp.id] ?? {};
    if (emp.grossSalary > 0 && o.days === undefined && (emp.hireDate > `${month}-01` || (emp.endDate && emp.endDate < new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)))) throw new Error(`${emp.lastName} ${emp.firstName}: πρόσληψη ή αποχώρηση μέσα στον μήνα. Συμπληρώστε τις πληρωτέες ημέρες πριν τον υπολογισμό.`);
    const item = computeItem(emp, {
      employeeId: emp.id,
      days: o.days ?? (emp.grossSalary > 0 ? 25 : empShifts.length || undefined),
      overtimeHours: o.overtimeHours ?? overtimeFromShifts,
      bonus: o.bonus,
      note: o.note,
    });
    return { emp, item };
  });

  const totals = computed.reduce(
    (acc, { item }) => ({
      gross: acc.gross + item.gross,
      efkaEmployee: acc.efkaEmployee + item.efkaEmployee,
      efkaEmployer: acc.efkaEmployer + item.efkaEmployer,
      tax: acc.tax + item.tax,
      net: acc.net + item.net,
    }),
    { gross: 0, efkaEmployee: 0, efkaEmployer: 0, tax: 0, net: 0 },
  );

  const runId = existing?.run.id ?? randomUUID();
  if (existing) {
    await db.delete(payrollItems).where(eq(payrollItems.runId, runId));
    await db
      .update(payrollRuns)
      .set({ grossTotal: round2(totals.gross), efkaEmployee: round2(totals.efkaEmployee), efkaEmployer: round2(totals.efkaEmployer), taxTotal: round2(totals.tax), netTotal: round2(totals.net) })
      .where(eq(payrollRuns.id, runId));
  } else {
    await db.insert(payrollRuns).values({
      id: runId,
      orgId,
      month,
      status: "draft",
      grossTotal: round2(totals.gross),
      efkaEmployee: round2(totals.efkaEmployee),
      efkaEmployer: round2(totals.efkaEmployer),
      taxTotal: round2(totals.tax),
      netTotal: round2(totals.net),
      createdBy,
      createdAt: now(),
    });
  }

  for (const { emp, item } of computed) {
    await db.insert(payrollItems).values({ id: randomUUID(), orgId, runId, employeeId: emp.id, employeeName: `${emp.lastName} ${emp.firstName}`, ...item });
  }
  return (await getRun(db, orgId, month))!;
}

/** Καταχώρηση μισθοδοσίας στα διπλογραφικά (60 / 55 / 54.03 / 53). */
export async function postRun(db: Db, orgId: string, month: string, createdBy = "") {
  const data = await getRun(db, orgId, month);
  if (!data) throw new Error("Δεν υπάρχει υπολογισμένη μισθοδοσία για τον μήνα.");
  if (data.run.status === "posted") throw new Error("Η μισθοδοσία έχει ήδη καταχωρηθεί.");
  const { run } = data;
  const isBonus = !/^\d{4}-\d{2}$/.test(month);
  const [y, m] = isBonus ? [Number(month.slice(0, 4)), month.endsWith("DP") ? 4 : month.endsWith("EA") ? 7 : 12] : month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const label = isBonus ? (month.endsWith("DX") ? `Δώρο Χριστουγέννων ${y}` : month.endsWith("DP") ? `Δώρο Πάσχα ${y}` : `Επίδομα αδείας ${y}`) : `Μισθοδοσία ${month}`;
  const entryId = await postEntry(db, orgId, {
    date: lastDay,
    description: label,
    sourceType: "payroll",
    sourceId: run.id,
    createdBy,
    lines: [
      { accountCode: "60", debit: round2(run.grossTotal + run.efkaEmployer), description: "Αμοιβές & εργοδοτικές εισφορές" },
      { accountCode: "55", credit: round2(run.efkaEmployee + run.efkaEmployer), description: "ΕΦΚΑ πληρωτέος" },
      { accountCode: "54.03", credit: round2(run.taxTotal), description: "ΦΜΥ πληρωτέος" },
      { accountCode: "53", credit: round2(run.netTotal), description: "Καθαρές αποδοχές πληρωτέες" },
    ],
  });
  await db.update(payrollRuns).set({ status: "posted", glEntryId: entryId }).where(eq(payrollRuns.id, run.id));
  return entryId;
}

/* ------------------------------- Αρχεία υποβολής ------------------------------- */

const pad = (v: string | number, len: number) => String(v).slice(0, len).padEnd(len, " ");
const padNum = (v: number, len: number, dec = 2) => String(Math.round(v * 10 ** dec)).padStart(len, "0");

/** Αρχείο ΑΠΔ ΕΦΚΑ (τύπος 01 – κανονική), σταθερού μήκους εγγραφών. */
export async function apdFile(db: Db, org: Organization, month: string) {
  const data = await getRun(db, org.id, month);
  if (!data) throw new Error("Δεν υπάρχει μισθοδοσία για τον μήνα.");
  const staff = await listEmployees(db, org.id);
  const [y, m] = month.split("-");
  const lines: string[] = [];
  lines.push(["01", pad(org.afm, 9), pad(org.name, 60), pad(`${m}${y}`, 6), pad("01", 2), padNum(data.run.grossTotal, 12), padNum(data.run.efkaEmployee + data.run.efkaEmployer, 12)].join(""));
  for (const it of data.items) {
    const emp = staff.find((e) => e.id === it.employeeId);
    lines.push(
      [
        "02",
        pad(emp?.amka ?? "", 11),
        pad(emp?.afm ?? "", 9),
        pad(`${emp?.lastName ?? ""} ${emp?.firstName ?? ""}`, 50),
        pad(emp?.kpk ?? "101", 4),
        pad(emp?.specialtyCode ?? "", 6),
        padNum(it.days, 4, 0),
        padNum(it.gross, 12),
        padNum(it.efkaEmployee, 12),
        padNum(it.efkaEmployer, 12),
      ].join(""),
    );
  }
  lines.push(["99", padNum(data.items.length, 6, 0), padNum(data.run.efkaEmployee + data.run.efkaEmployer, 14)].join(""));
  return { fileName: `APD_${org.afm}_${y}${m}.txt`, content: `${lines.join("\r\n")}\r\n` };
}

/** Αρχείο ΦΜΥ (μορφή JL10 – μηνιαία απόδοση παρακρατούμενου φόρου μισθωτών). */
export async function fmyFile(db: Db, org: Organization, month: string) {
  const data = await getRun(db, org.id, month);
  if (!data) throw new Error("Δεν υπάρχει μισθοδοσία για τον μήνα.");
  const staff = await listEmployees(db, org.id);
  const [y, m] = month.split("-");
  const rows = [["ΑΦΜ_ΕΡΓΟΔΟΤΗ", "ΜΗΝΑΣ", "ΕΤΟΣ", "ΑΦΜ_ΔΙΚΑΙΟΥΧΟΥ", "ΟΝΟΜΑΤΕΠΩΝΥΜΟ", "ΑΚΑΘΑΡΙΣΤΕΣ", "ΕΙΣΦΟΡΕΣ", "ΦΟΡΟΣ"].join(";")];
  for (const it of data.items) {
    const emp = staff.find((e) => e.id === it.employeeId);
    rows.push([org.afm, m, y, emp?.afm ?? "", `${emp?.lastName ?? ""} ${emp?.firstName ?? ""}`, it.gross.toFixed(2), it.efkaEmployee.toFixed(2), it.tax.toFixed(2)].join(";"));
  }
  rows.push(["ΣΥΝΟΛΑ", m, y, "", "", data.run.grossTotal.toFixed(2), data.run.efkaEmployee.toFixed(2), data.run.taxTotal.toFixed(2)].join(";"));
  return { fileName: `FMY_JL10_${org.afm}_${y}${m}.csv`, content: `\uFEFF${rows.join("\r\n")}\r\n` };
}

/* ------------------------------- ΕΡΓΑΝΗ ------------------------------- */

export async function listShifts(db: Db, orgId: string, month: string) {
  return db
    .select()
    .from(shifts)
    .where(and(eq(shifts.orgId, orgId), gte(shifts.workDate, `${month}-01`), lte(shifts.workDate, `${month}-31`)))
    .orderBy(asc(shifts.workDate));
}

export async function saveShift(db: Db, orgId: string, data: { employeeId: string; workDate: string; startTime: string; endTime: string; breakMinutes?: number; overtimeMinutes?: number; kind?: string }) {
  if (!data.employeeId) throw new Error("Επιλέξτε εργαζόμενο.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.workDate)) throw new Error("Μη έγκυρη ημερομηνία.");
  if (data.kind !== "leave" && data.kind !== "sick" && data.kind !== "off" && (!data.startTime || !data.endTime)) throw new Error("Συμπληρώστε ώρα έναρξης και λήξης.");
  const id = randomUUID();
  await db.insert(shifts).values({
    id,
    orgId,
    employeeId: data.employeeId,
    workDate: data.workDate,
    startTime: data.startTime ?? "",
    endTime: data.endTime ?? "",
    breakMinutes: data.breakMinutes ?? 0,
    overtimeMinutes: data.overtimeMinutes ?? 0,
    kind: data.kind || "work",
    erganiStatus: "pending",
    erganiRef: "",
    createdAt: now(),
  });
  return id;
}

export async function deleteShift(db: Db, orgId: string, id: string) {
  await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.orgId, orgId)));
}

const xmlEscape = (v: string) => v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Αρχεία ΕΡΓΑΝΗ: κάρτα εργασίας (Ε12), Ε4 (πίνακας προσωπικού), Ε3 (πρόσληψη), Ε8 (υπερωρίες). */
export async function erganiFile(db: Db, org: Organization, form: "E12" | "E4" | "E3" | "E8", month: string) {
  const staff = await listEmployees(db, org.id);
  const rows = await listShifts(db, org.id, month);
  const head = `  <Employer><AFM>${xmlEscape(org.afm)}</AFM><Name>${xmlEscape(org.name)}</Name><Period>${month}</Period></Employer>`;
  let body = "";

  if (form === "E12") {
    body = rows
      .filter((r) => r.kind === "work")
      .map((r) => {
        const emp = staff.find((e) => e.id === r.employeeId);
        return `  <WorkCard><AMKA>${xmlEscape(emp?.amka ?? "")}</AMKA><AFM>${xmlEscape(emp?.afm ?? "")}</AFM><Name>${xmlEscape(`${emp?.lastName ?? ""} ${emp?.firstName ?? ""}`)}</Name><Date>${r.workDate}</Date><From>${r.startTime}</From><To>${r.endTime}</To><Break>${r.breakMinutes}</Break><Overtime>${r.overtimeMinutes}</Overtime></WorkCard>`;
      })
      .join("\n");
  } else if (form === "E4") {
    body = staff
      .filter((e) => e.active)
      .map(
        (e) =>
          `  <Employee><AMKA>${xmlEscape(e.amka)}</AMKA><AFM>${xmlEscape(e.afm)}</AFM><Name>${xmlEscape(`${e.lastName} ${e.firstName}`)}</Name><Specialty>${xmlEscape(e.specialtyCode)}</Specialty><Contract>${e.contractType}</Contract><HireDate>${e.hireDate}</HireDate><Gross>${e.grossSalary.toFixed(2)}</Gross><WeeklyHours>${e.hoursPerWeek}</WeeklyHours></Employee>`,
      )
      .join("\n");
  } else if (form === "E3") {
    body = staff
      .filter((e) => e.hireDate.slice(0, 7) === month)
      .map((e) => `  <Hiring><AMKA>${xmlEscape(e.amka)}</AMKA><AFM>${xmlEscape(e.afm)}</AFM><Name>${xmlEscape(`${e.lastName} ${e.firstName}`)}</Name><HireDate>${e.hireDate}</HireDate><Specialty>${xmlEscape(e.specialtyCode)}</Specialty><Gross>${e.grossSalary.toFixed(2)}</Gross></Hiring>`)
      .join("\n");
  } else {
    body = rows
      .filter((r) => r.overtimeMinutes > 0)
      .map((r) => {
        const emp = staff.find((e) => e.id === r.employeeId);
        return `  <Overtime><AMKA>${xmlEscape(emp?.amka ?? "")}</AMKA><Name>${xmlEscape(`${emp?.lastName ?? ""} ${emp?.firstName ?? ""}`)}</Name><Date>${r.workDate}</Date><Minutes>${r.overtimeMinutes}</Minutes><Reason>Έκτακτες ανάγκες</Reason></Overtime>`;
      })
      .join("\n");
  }

  return {
    fileName: `ERGANI_${form}_${org.afm}_${month}.xml`,
    content: `<?xml version="1.0" encoding="UTF-8"?>\n<Ergani form="${form}">\n${head}\n${body}\n</Ergani>\n`,
  };
}

export async function markShiftsSent(db: Db, orgId: string, ids: string[], ref: string) {
  if (!ids.length) return;
  await db.update(shifts).set({ erganiStatus: "sent", erganiRef: ref }).where(and(eq(shifts.orgId, orgId), inArray(shifts.id, ids)));
}
