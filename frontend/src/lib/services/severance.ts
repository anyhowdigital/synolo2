import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { employees, terminations, type Employee, type Organization } from "@/db/schema";

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86400000;
export type TerminationKind = "dismissal" | "contract_end" | "resignation";
export const TERMINATION_LABEL: Record<TerminationKind, string> = { dismissal: "Καταγγελία σύμβασης (Ε6)", contract_end: "Λήξη σύμβασης ορισμένου χρόνου (Ε7)", resignation: "Οικειοθελής αποχώρηση (Ε5)" };

export function serviceYears(hireDate: string, endDate: string) {
  return (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${hireDate}T00:00:00Z`).getTime()) / (365.25 * DAY);
}

/** Μήνες αποζημίωσης υπαλλήλων (Ν.4093/2012, χωρίς προειδοποίηση). */
export function severanceMonths(years: number) {
  if (years < 1) return 0;
  if (years < 4) return 2;
  if (years < 6) return 3;
  if (years < 8) return 4;
  if (years < 10) return 5;
  return Math.min(12, 6 + Math.floor(years) - 10);
}

/** Ημερομίσθια αποζημίωσης εργατοτεχνιτών (Β.Δ. 16/18-7-1920). */
export function severanceDailyWages(years: number) {
  if (years < 1) return 5;
  if (years < 2) return 7;
  if (years < 5) return 15;
  if (years < 10) return 30;
  if (years < 15) return 60;
  if (years < 20) return 100;
  if (years < 25) return 120;
  if (years < 30) return 145;
  return 165;
}

/** Μήνες προειδοποίησης (αν επιλεγεί καταγγελία με προμήνυση → αποζημίωση στο ½). */
export function noticeMonths(years: number) {
  if (years < 1) return 0;
  if (years < 2) return 1;
  if (years < 5) return 2;
  if (years < 10) return 3;
  return 4;
}

/** Φόρος αποζημίωσης απόλυσης (άρθρο 15§3 Ν.4172/2013): αφορολόγητο έως 60.000 €. */
export function severanceTax(gross: number) {
  let tax = 0;
  if (gross > 150000) tax += (gross - 150000) * 0.3;
  if (gross > 100000) tax += (Math.min(gross, 150000) - 100000) * 0.2;
  if (gross > 60000) tax += (Math.min(gross, 100000) - 60000) * 0.1;
  return round2(tax);
}

export function computeSeverance(emp: Employee, kind: TerminationKind, endDate: string, withNotice: boolean) {
  const years = round2(serviceYears(emp.hireDate, endDate));
  const salaried = emp.grossSalary > 0;
  const monthlyBase = round2((salaried ? emp.grossSalary : emp.dailyWage * 25) * (14 / 12));
  let monthsOwed = 0;
  let gross = 0;
  let explain = "";
  if (kind === "dismissal") {
    if (salaried) {
      const base = severanceMonths(years);
      let extra = 0;
      if (emp.hireDate <= "2012-11-12") {
        const yearsAt2012 = serviceYears(emp.hireDate, "2012-11-12");
        if (yearsAt2012 > 17) extra = Math.min(12, Math.floor(yearsAt2012) - 17);
      }
      monthsOwed = round2((base + extra) * (withNotice ? 0.5 : 1));
      gross = round2(base * monthlyBase * (withNotice ? 0.5 : 1) + extra * Math.min(monthlyBase, 2000) * (withNotice ? 0.5 : 1));
      explain = `${years} έτη προϋπηρεσίας → ${base} μήνες${extra ? ` + ${extra} επιπλέον (προϋπηρεσία >17 ετών την 12/11/2012, όριο 2.000 €)` : ""}${withNotice ? ` · με προειδοποίηση ${noticeMonths(years)} μηνών → ½` : ""}`;
    } else {
      const dw = severanceDailyWages(years);
      monthsOwed = round2((dw / 25) * (withNotice ? 0.5 : 1));
      gross = round2(dw * emp.dailyWage * (14 / 12) * (withNotice ? 0.5 : 1));
      explain = `${years} έτη → ${dw} ημερομίσθια${withNotice ? " · με προειδοποίηση → ½" : ""}`;
    }
  } else {
    explain = kind === "contract_end" ? "Λήξη σύμβασης ορισμένου χρόνου — δεν οφείλεται αποζημίωση." : "Οικειοθελής αποχώρηση — δεν οφείλεται αποζημίωση.";
  }
  const tax = severanceTax(gross);
  return { years, monthsOwed, monthlyBase, gross, tax, net: round2(gross - tax), noticeMonths: noticeMonths(years), explain };
}

export async function saveTermination(db: Db, orgId: string, input: { employeeId: string; kind: TerminationKind; endDate: string; withNotice: boolean; note?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) throw new Error("Μη έγκυρη ημερομηνία αποχώρησης.");
  const emp = await db.query.employees.findFirst({ where: and(eq(employees.id, input.employeeId), eq(employees.orgId, orgId)) });
  if (!emp) throw new Error("Ο εργαζόμενος δεν βρέθηκε.");
  if (input.endDate < emp.hireDate) throw new Error("Η αποχώρηση δεν μπορεί να προηγείται της πρόσληψης.");
  const calc = computeSeverance(emp, input.kind, input.endDate, input.withNotice);
  const id = randomUUID();
  await db.insert(terminations).values({
    id,
    orgId,
    employeeId: emp.id,
    employeeName: `${emp.lastName} ${emp.firstName}`,
    kind: input.kind,
    endDate: input.endDate,
    withNotice: input.withNotice,
    serviceYears: calc.years,
    monthsOwed: calc.monthsOwed,
    monthlyBase: calc.monthlyBase,
    gross: calc.gross,
    tax: calc.tax,
    net: calc.net,
    note: [calc.explain, input.note ?? ""].filter(Boolean).join(" · "),
    createdAt: new Date().toISOString(),
  });
  await db.update(employees).set({ endDate: input.endDate, active: false }).where(eq(employees.id, emp.id));
  return { id, ...calc };
}

export async function listTerminations(db: Db, orgId: string) {
  return db.select().from(terminations).where(eq(terminations.orgId, orgId)).orderBy(desc(terminations.endDate));
}

const esc = (v: string) => v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Ε6 (καταγγελία) / Ε7 (λήξη ορισμένου χρόνου) / Ε5 (οικειοθελής) — XML όπως τα υπόλοιπα αρχεία ΕΡΓΑΝΗ. */
export async function terminationFile(db: Db, org: Organization, terminationId: string) {
  const t = await db.query.terminations.findFirst({ where: and(eq(terminations.id, terminationId), eq(terminations.orgId, org.id)) });
  if (!t) throw new Error("Η αποχώρηση δεν βρέθηκε.");
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, t.employeeId) });
  const form = t.kind === "dismissal" ? "E6" : t.kind === "contract_end" ? "E7" : "E5";
  const body =
    form === "E6"
      ? `  <Dismissal><AMKA>${esc(emp?.amka ?? "")}</AMKA><AFM>${esc(emp?.afm ?? "")}</AFM><Name>${esc(t.employeeName)}</Name><HireDate>${emp?.hireDate ?? ""}</HireDate><EndDate>${t.endDate}</EndDate><WithNotice>${t.withNotice ? "1" : "0"}</WithNotice><ServiceYears>${t.serviceYears}</ServiceYears><CompensationMonths>${t.monthsOwed}</CompensationMonths><CompensationAmount>${t.gross.toFixed(2)}</CompensationAmount><CompensationTax>${t.tax.toFixed(2)}</CompensationTax><CompensationNet>${t.net.toFixed(2)}</CompensationNet></Dismissal>`
      : `  <${form === "E7" ? "ContractEnd" : "Resignation"}><AMKA>${esc(emp?.amka ?? "")}</AMKA><AFM>${esc(emp?.afm ?? "")}</AFM><Name>${esc(t.employeeName)}</Name><HireDate>${emp?.hireDate ?? ""}</HireDate><EndDate>${t.endDate}</EndDate></${form === "E7" ? "ContractEnd" : "Resignation"}>`;
  return {
    form,
    fileName: `ERGANI_${form}_${org.afm}_${t.endDate}.xml`,
    content: `<?xml version="1.0" encoding="UTF-8"?>\n<Ergani form="${form}">\n  <Employer><AFM>${esc(org.afm)}</AFM><Name>${esc(org.name)}</Name></Employer>\n${body}\n</Ergani>\n`,
  };
}
