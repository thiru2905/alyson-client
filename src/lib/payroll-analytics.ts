import type { PayrollLocalCurrency, PayrollReportRow } from "@/lib/payroll-schema";
import { payCycleLabel } from "@/lib/payroll-schema";

export type PayrollAnalyticsFact = {
  employeeId: string;
  employeeName: string;
  team: string;
  location: string;
  localCurrency: PayrollLocalCurrency;
  payCycle: string;
  payMonth: string;
  totalLocal: number;
  totalUsd: number;
  paid: boolean;
  paidAt: string | null;
};

export type PayrollAnalyticsReport = {
  generatedAt: string;
  summary: {
    employeeCount: number;
    totalUsd: number;
    totalInr: number;
    totalPkr: number;
    paidCount: number;
    unpaidCount: number;
    paidUsd: number;
    unpaidUsd: number;
    teamCount: number;
    locationCount: number;
  };
  byTeam: Array<{ team: string; totalLocal: number; totalUsd: number; employees: number; paid: number }>;
  byLocation: Array<{ location: string; totalLocal: number; totalUsd: number; employees: number; paid: number }>;
  byPayCycle: Array<{ payCycle: string; totalLocal: number; totalUsd: number; employees: number }>;
  byMonth: Array<{ key: string; label: string; totalLocal: number; totalUsd: number; employees: number }>;
  topByComp: Array<{
    employeeId: string;
    name: string;
    team: string;
    location: string;
    localCurrency: PayrollLocalCurrency;
    totalLocal: number;
    totalUsd: number;
  }>;
  allRows: PayrollAnalyticsFact[];
};

function norm(v: string, fallback: string) {
  const t = v.trim();
  return t || fallback;
}

function monthLabel(key: string): string {
  const d = new Date(`${key}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function buildPayrollAnalyticsReport(rows: PayrollReportRow[]): PayrollAnalyticsReport {
  const facts: PayrollAnalyticsFact[] = rows.map((r) => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    team: norm(r.team, "—"),
    location: norm(r.location, "—"),
    payCycle: payCycleLabel(r.payCycle),
    payMonth: r.payMonth,
    localCurrency: r.localCurrency,
    totalLocal: r.totalLocal,
    totalUsd: r.totalUsd,
    paid: Boolean(r.paidAt),
    paidAt: r.paidAt,
  }));

  const teamMap = new Map<string, { totalLocal: number; totalUsd: number; employees: Set<string>; paid: number }>();
  const locMap = new Map<string, { totalLocal: number; totalUsd: number; employees: Set<string>; paid: number }>();
  const cycleMap = new Map<string, { totalLocal: number; totalUsd: number; employees: number }>();
  const monthMap = new Map<string, { totalLocal: number; totalUsd: number; employees: number }>();

  let paidCount = 0;
  let paidUsd = 0;
  let totalInr = 0;
  let totalPkr = 0;

  for (const f of facts) {
    if (f.paid) {
      paidCount += 1;
      paidUsd += f.totalUsd;
    }
    if (f.localCurrency === "INR") totalInr += f.totalLocal;
    else totalPkr += f.totalLocal;

    const bump = (
      map: Map<string, { totalLocal: number; totalUsd: number; employees: Set<string>; paid: number }>,
      key: string,
    ) => {
      const row = map.get(key) ?? { totalLocal: 0, totalUsd: 0, employees: new Set<string>(), paid: 0 };
      row.totalUsd += f.totalUsd;
      row.totalLocal += f.totalLocal;
      row.employees.add(f.employeeId);
      if (f.paid) row.paid += 1;
      map.set(key, row);
    };
    bump(teamMap, f.team);
    bump(locMap, f.location);

    const c = cycleMap.get(f.payCycle) ?? { totalLocal: 0, totalUsd: 0, employees: 0 };
    c.totalLocal += f.totalLocal;
    c.totalUsd += f.totalUsd;
    c.employees += 1;
    cycleMap.set(f.payCycle, c);

    const m = monthMap.get(f.payMonth) ?? { totalLocal: 0, totalUsd: 0, employees: 0 };
    m.totalLocal += f.totalLocal;
    m.totalUsd += f.totalUsd;
    m.employees += 1;
    monthMap.set(f.payMonth, m);
  }

  const totalUsd = facts.reduce((s, f) => s + f.totalUsd, 0);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      employeeCount: facts.length,
      totalUsd,
      totalInr,
      totalPkr,
      paidCount,
      unpaidCount: facts.length - paidCount,
      paidUsd,
      unpaidUsd: totalUsd - paidUsd,
      teamCount: teamMap.size,
      locationCount: locMap.size,
    },
    byTeam: [...teamMap.entries()]
      .map(([team, v]) => ({
        team,
        totalLocal: v.totalLocal,
        totalUsd: v.totalUsd,
        employees: v.employees.size,
        paid: v.paid,
      }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    byLocation: [...locMap.entries()]
      .map(([location, v]) => ({
        location,
        totalLocal: v.totalLocal,
        totalUsd: v.totalUsd,
        employees: v.employees.size,
        paid: v.paid,
      }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    byPayCycle: [...cycleMap.entries()]
      .map(([payCycle, v]) => ({ payCycle, ...v }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    byMonth: [...monthMap.entries()]
      .map(([key, v]) => ({ key, label: monthLabel(key), ...v }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    topByComp: [...facts]
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 12)
      .map((f) => ({
        employeeId: f.employeeId,
        name: f.employeeName,
        team: f.team,
        location: f.location,
        totalLocal: f.totalLocal,
        totalUsd: f.totalUsd,
        localCurrency: f.localCurrency,
      })),
    allRows: facts,
  };
}

export function filterPayrollAnalytics(
  report: PayrollAnalyticsReport,
  filters: { team?: string; location?: string; payCycle?: string; paidOnly?: boolean; unpaidOnly?: boolean },
): PayrollAnalyticsReport {
  let rows = report.allRows;
  if (filters.team && filters.team !== "__all__") {
    rows = rows.filter((r) => r.team === filters.team);
  }
  if (filters.location && filters.location !== "__all__") {
    rows = rows.filter((r) => r.location === filters.location);
  }
  if (filters.payCycle && filters.payCycle !== "__all__") {
    rows = rows.filter((r) => r.payCycle === filters.payCycle);
  }
  if (filters.paidOnly) rows = rows.filter((r) => r.paid);
  if (filters.unpaidOnly) rows = rows.filter((r) => !r.paid);

  const rebuilt = rows.map((f) => ({
    employeeId: f.employeeId,
    employeeName: f.employeeName,
    officialEmail: "",
    team: f.team,
    location: f.location,
    active: true,
    localCurrency: f.localCurrency,
    payCycle: f.payCycle.includes("India") ? ("india_15th" as const) : ("pakistan_month_end" as const),
    payMonth: f.payMonth,
    payDate: "",
    periodStart: "",
    periodEnd: "",
    periodLabel: "",
    startingDate: null,
    monthsWorked: null,
    lastSalaryRevisionDate: null,
    nextSalaryReviewDate: null,
    startingBaseSalaryLocal: 0,
    incrementLocal: 0,
    newBaseSalaryLocal: 0,
    benefitsLocal: 0,
    bonusLocal: 0,
    reimbursementLocal: 0,
    totalLocal: f.totalLocal,
    usdToLocalRate: 0,
    rateAsOf: null,
    totalUsd: f.totalUsd,
    lowActivity: false,
    approvedHolidayDays: 0,
    meetingCreditsHours: 0,
    additionalCreditsHours: 0,
    effectiveHours: 0,
    totalRequiredHours: 0,
    percentCompleted: 0,
    salaryAccordingToTdHours: 0,
    paidAt: f.paidAt,
    paidBy: null,
  }));

  return buildPayrollAnalyticsReport(rebuilt);
}
