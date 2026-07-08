import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";
import type { OnboardingRow } from "@/lib/onboarding-schema";

export type PayrollPayCycle = "india_15th" | "pakistan_month_end";

export type PayrollLocalCurrency = "INR" | "PKR";

export const DEFAULT_USD_TO_INR = 84;
export const DEFAULT_USD_TO_PKR = 278;

export type PayrollEmployeeOverrides = {
  employeeId: string;
  startingDate?: string | null;
  lastSalaryRevisionDate?: string | null;
  nextSalaryReviewDate?: string | null;
  startingBaseSalaryLocal?: number | null;
  incrementLocal?: number | null;
  benefitsLocal?: number | null;
  reimbursementLocal?: number | null;
  meetingCreditsHours?: number | null;
  additionalCreditsHours?: number | null;
  updatedAt?: string;
};

export type PayrollPeriodSettings = {
  month: string;
  usdToInrRate?: number | null;
  usdToPkrRate?: number | null;
  /** @deprecated Legacy — used as PKR fallback when usdToPkrRate unset. */
  usdToLocalRate?: number | null;
  rateAsOf?: string | null;
  updatedAt?: string;
};

export type PayrollPaidRecord = {
  employeeId: string;
  payMonth: string;
  payCycle: PayrollPayCycle;
  localCurrency: PayrollLocalCurrency;
  paidAt: string;
  paidBy?: string | null;
  amountLocal: number;
  amountUsd: number;
  note?: string | null;
};

export type PayrollOperation =
  | "bootstrap"
  | "update_employee"
  | "update_period_fx"
  | "mark_paid"
  | "unmark_paid";

export type PayrollLogEntry = {
  ts: string;
  operation: PayrollOperation;
  actor?: string | null;
  employeeId?: string;
  employeeName?: string;
  payMonth?: string;
  payCycle?: PayrollPayCycle;
  localCurrency?: PayrollLocalCurrency;
  amountLocal?: number;
  amountUsd?: number;
  note?: string;
  detailsJson?: string;
};

export type PayrollDataFile = {
  version: 1;
  updatedAt: string;
  employees: Record<string, PayrollEmployeeOverrides>;
  periods: Record<string, PayrollPeriodSettings>;
  paid: Record<string, PayrollPaidRecord>;
};

export type PayrollReportRow = {
  employeeId: string;
  employeeName: string;
  officialEmail: string;
  team: string;
  location: string;
  active: boolean;
  localCurrency: PayrollLocalCurrency;
  payCycle: PayrollPayCycle;
  payMonth: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;

  startingDate: string | null;
  monthsWorked: number | null;
  lastSalaryRevisionDate: string | null;
  nextSalaryReviewDate: string | null;

  startingBaseSalaryLocal: number;
  incrementLocal: number;
  newBaseSalaryLocal: number;
  benefitsLocal: number;
  bonusLocal: number;
  reimbursementLocal: number;
  totalLocal: number;

  usdToLocalRate: number;
  rateAsOf: string | null;
  totalUsd: number;

  lowActivity: boolean;
  approvedHolidayDays: number;
  meetingCreditsHours: number;
  additionalCreditsHours: number;
  effectiveHours: number;
  totalRequiredHours: number;
  percentCompleted: number;
  salaryAccordingToTdHours: number;

  paidAt: string | null;
  paidBy: string | null;
};

export type PayrollReport = {
  payMonth: string;
  payMonthLabel: string;
  payCycleFilter: "all" | PayrollPayCycle;
  generatedAt: string;
  usdToInrRate: number;
  usdToPkrRate: number;
  rateAsOf: string | null;
  rows: PayrollReportRow[];
  warnings: string[];
};

export function paidRecordKey(employeeId: string, payMonth: string, payCycle: PayrollPayCycle): string {
  return `${employeeId}:${payMonth}:${payCycle}`;
}

function normFacet(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normPersonName(name: string): string {
  return normFacet(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PAYROLL_INACTIVE_STATUSES = new Set(["resigned", "fired", "terminated", "inactive"]);

/** Hard exclusions — resigned before onboarding/S3 is updated. */
const PAYROLL_EXCLUDED_EMAILS = new Set(
  ["asmita@revcloud.com", "asmita@cintara.ai", "asmita.amritraj@cintara.ai"].map((e) => e.toLowerCase()),
);

const PAYROLL_EXCLUDED_NAMES = new Set(["asmita amritraj"].map(normPersonName));

/** Whether an employee should appear on the payroll board. */
export function isPayrollEligibleEmployee(row: OnboardingRow): boolean {
  const status = normFacet(String(row["Employment Status"] ?? ""));
  if (status && PAYROLL_INACTIVE_STATUSES.has(status)) return false;

  const name = normPersonName(String(row.Name ?? ""));
  if (name && PAYROLL_EXCLUDED_NAMES.has(name)) return false;

  const email = canonicalOfficialEmail(String(row["Official Email"] ?? ""));
  for (const key of emailLookupKeys(email || String(row["Official Email"] ?? ""))) {
    if (key.includes("@") && PAYROLL_EXCLUDED_EMAILS.has(key.toLowerCase())) return false;
  }

  return true;
}

const INDIA_MARKERS = [
  "india",
  "indian",
  "pune",
  "mumbai",
  "bangalore",
  "bengaluru",
  "delhi",
  "hyderabad",
  "chennai",
  "gurgaon",
  "gurugram",
  "noida",
];

const PAKISTAN_MARKERS = ["pakistan", "pakistani", "lahore", "islamabad", "bahawalpur", "karachi", "rawalpindi"];

function matchesMarker(norm: string, markers: string[]): boolean {
  return markers.some((m) => norm.includes(m));
}

/** Indian team or location → India pay cycle. Team is checked first. */
export function isIndianWorkforce(team: string, location: string): boolean {
  const teamNorm = normFacet(team);
  const locNorm = normFacet(location);
  if (matchesMarker(teamNorm, INDIA_MARKERS)) return true;
  return matchesMarker(locNorm, INDIA_MARKERS);
}

export function resolvePayCycleFromLocation(location: string, team?: string): PayrollPayCycle {
  if (team !== undefined && isIndianWorkforce(team, location)) {
    return "india_15th";
  }
  const loc = normFacet(location);
  if (matchesMarker(loc, INDIA_MARKERS)) {
    return "india_15th";
  }
  return "pakistan_month_end";
}

export function payCycleLabel(cycle: PayrollPayCycle): string {
  return cycle === "india_15th" ? "India (15th)" : "Pakistan (month end)";
}

/** Indian team → INR; Pakistan team / location → PKR. Team is checked first. */
export function resolvePayrollCurrency(
  team: string,
  location: string,
  payCycle: PayrollPayCycle,
): PayrollLocalCurrency {
  const teamNorm = normFacet(team);
  const locNorm = normFacet(location);

  if (matchesMarker(teamNorm, INDIA_MARKERS)) return "INR";
  if (payCycle === "india_15th" || matchesMarker(locNorm, INDIA_MARKERS)) return "INR";
  if (matchesMarker(teamNorm, PAKISTAN_MARKERS) || matchesMarker(locNorm, PAKISTAN_MARKERS)) return "PKR";
  return "PKR";
}

export function fxRateForCurrency(
  settings: PayrollPeriodSettings | undefined,
  currency: PayrollLocalCurrency,
): number {
  if (currency === "INR") {
    return settings?.usdToInrRate ?? DEFAULT_USD_TO_INR;
  }
  return settings?.usdToPkrRate ?? settings?.usdToLocalRate ?? DEFAULT_USD_TO_PKR;
}

export function periodFxRates(settings: PayrollPeriodSettings | undefined): {
  usdToInrRate: number;
  usdToPkrRate: number;
} {
  return {
    usdToInrRate: fxRateForCurrency(settings, "INR"),
    usdToPkrRate: fxRateForCurrency(settings, "PKR"),
  };
}

export function parseMoneyLocal(raw: string | number | null | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").replace(/,/g, "").trim();
  if (!s) return 0;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export function monthsBetween(startIso: string | null, endIso: string): number | null {
  if (!startIso?.trim()) return null;
  const start = new Date(`${startIso.slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}
