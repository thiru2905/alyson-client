import { monthEndIso, monthLabel } from "@/lib/monthly-pacing";
import type { PayrollPayCycle } from "@/lib/payroll-schema";
import { pacingTodayIso } from "@/lib/weekly-pacing";

export type PayPeriod = {
  payMonth: string;
  payCycle: PayrollPayCycle;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  label: string;
};

function addMonthsToMonthYear(monthYear: string, delta: number): string {
  const [y, m] = monthYear.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatShortRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/** India: 15th of prior month → 15th of pay month. Pakistan: calendar month → last day. */
export function resolvePayPeriod(payMonth: string, payCycle: PayrollPayCycle): PayPeriod {
  if (!/^\d{4}-\d{2}$/.test(payMonth)) {
    throw new Error("Invalid pay month — use YYYY-MM");
  }

  if (payCycle === "india_15th") {
    const prevMonth = addMonthsToMonthYear(payMonth, -1);
    const periodStart = `${prevMonth}-15`;
    const periodEnd = `${payMonth}-15`;
    return {
      payMonth,
      payCycle,
      periodStart,
      periodEnd,
      payDate: periodEnd,
      label: formatShortRange(periodStart, periodEnd),
    };
  }

  const periodStart = `${payMonth}-01`;
  const periodEnd = monthEndIso(payMonth);
  return {
    payMonth,
    payCycle,
    periodStart,
    periodEnd,
    payDate: periodEnd,
    label: `${monthLabel(payMonth)} (calendar month)`,
  };
}

/** Rollup day for TD hours: cap at today when period is in progress. */
export function resolvePayPeriodRollupDay(period: PayPeriod, today = pacingTodayIso()): string {
  if (today < period.periodStart) return period.periodStart;
  if (today > period.periodEnd) return period.periodEnd;
  return today;
}
