import { getVatCategory } from "@/lib/greek/vat";
import { getWithholdingTax, STAMP_DUTY_CATEGORIES } from "@/lib/greek/classifications";

export interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Έκπτωση % επί της γραμμής (0-100). */
  discountPercent: number;
  vatCategory: number;
  vatExemptionCategory?: number | null;
  measurementUnit: number;
  classificationCategory: string;
  classificationType: string;
  withholdingCategory: number;
  stampDutyCategory: number;
}

export interface LineTotals {
  netValue: number;
  vatAmount: number;
  withheldAmount: number;
  stampDutyAmount: number;
  grossValue: number;
}

export interface InvoiceTotals {
  totalNetValue: number;
  totalVatAmount: number;
  totalWithheldAmount: number;
  totalStampDutyAmount: number;
  /** Σύνολο προς πληρωμή = καθαρό + ΦΠΑ + χαρτόσημο - παρακράτηση. */
  totalGrossValue: number;
  /** Ανάλυση ΦΠΑ ανά συντελεστή για εκτύπωση. */
  vatBreakdown: { rate: number; netValue: number; vatAmount: number }[];
  lines: LineTotals[];
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLine(line: LineInput): LineTotals {
  const vat = getVatCategory(line.vatCategory);
  const gross = line.quantity * line.unitPrice;
  const netValue = round2(gross * (1 - (line.discountPercent || 0) / 100));
  const vatAmount = round2((netValue * vat.rate) / 100);

  const wh = getWithholdingTax(line.withholdingCategory || 0);
  const withheldAmount = wh.rate ? round2((netValue * wh.rate) / 100) : 0;

  const sd = STAMP_DUTY_CATEGORIES.find((s) => s.code === (line.stampDutyCategory || 0));
  const stampDutyAmount = sd && sd.rate ? round2((netValue * sd.rate) / 100) : 0;

  return {
    netValue,
    vatAmount,
    withheldAmount,
    stampDutyAmount,
    grossValue: round2(netValue + vatAmount + stampDutyAmount - withheldAmount),
  };
}

export function computeInvoice(lines: LineInput[]): InvoiceTotals {
  const computed = lines.map(computeLine);
  const breakdown = new Map<number, { rate: number; netValue: number; vatAmount: number }>();

  lines.forEach((line, i) => {
    const rate = getVatCategory(line.vatCategory).rate;
    const entry = breakdown.get(rate) ?? { rate, netValue: 0, vatAmount: 0 };
    entry.netValue = round2(entry.netValue + computed[i].netValue);
    entry.vatAmount = round2(entry.vatAmount + computed[i].vatAmount);
    breakdown.set(rate, entry);
  });

  const sum = (key: keyof LineTotals) => round2(computed.reduce((acc, l) => acc + l[key], 0));

  return {
    totalNetValue: sum("netValue"),
    totalVatAmount: sum("vatAmount"),
    totalWithheldAmount: sum("withheldAmount"),
    totalStampDutyAmount: sum("stampDutyAmount"),
    totalGrossValue: sum("grossValue"),
    vatBreakdown: [...breakdown.values()].sort((a, b) => b.rate - a.rate),
    lines: computed,
  };
}

export function formatMoney(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(amount);
}

export function formatDate(value: string | Date) {
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: dateOnly ? "UTC" : "Europe/Athens" }).format(d);
}

/** Ημερολογιακή ημέρα Ελλάδας, ίδια στον διακομιστή και στον browser. */
export function businessDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
