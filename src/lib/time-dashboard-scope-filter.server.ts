import { canonicalOfficialEmail } from "@/lib/cintara-email";
import { rowAllowedForManagerScope } from "@/lib/manager-access-roster";
import { getOrgChartRosterLookup } from "@/lib/org-chart-roster.server";
import type { ResolvedTimeDashboardScope } from "@/lib/time-dashboard-access.server";
import type { MonthlyPacingReport } from "@/lib/monthly-pacing";
import type { WeeklyPacingReport } from "@/lib/weekly-pacing";
import type { TimeDoctorEmployeeRow } from "@/lib/time-doctor-functions";

function scopeNote(scope: ResolvedTimeDashboardScope): string | null {
  if (scope.level !== "team") return null;
  return `Team view for ${scope.managerName} (${scope.allowedEmails.size} direct report${scope.allowedEmails.size === 1 ? "" : "s"}).`;
}

export function filterEmployeeRowsForScope<T extends { email: string; name?: string }>(
  rows: T[],
  scope: ResolvedTimeDashboardScope,
): T[] {
  if (scope.level === "full") return rows;
  if (scope.level === "none") return [];
  const lookup = getOrgChartRosterLookup();
  return rows.filter((row) => rowAllowedForManagerScope(row, scope.managerEmail, lookup));
}

export function filterEmployeesTableForScope(
  report: {
    employees: TimeDoctorEmployeeRow[];
    warnings: string[];
  },
  scope: ResolvedTimeDashboardScope,
) {
  const filtered = filterEmployeeRowsForScope(report.employees, scope);
  const note = scopeNote(scope);
  return {
    ...report,
    employees: filtered,
    warnings: note ? [...report.warnings, note] : report.warnings,
  };
}

export function filterWeeklyPacingReportForScope(
  report: WeeklyPacingReport,
  scope: ResolvedTimeDashboardScope,
): WeeklyPacingReport {
  const rows = filterEmployeeRowsForScope(report.rows, scope);
  const note = scopeNote(scope);
  return {
    ...report,
    rows,
    warnings: note ? [...report.warnings, note] : report.warnings,
  };
}

export function filterMonthlyPacingReportForScope(
  report: MonthlyPacingReport,
  scope: ResolvedTimeDashboardScope,
): MonthlyPacingReport {
  const rows = filterEmployeeRowsForScope(report.rows, scope);
  const note = scopeNote(scope);
  return {
    ...report,
    rows,
    warnings: note ? [...report.warnings, note] : report.warnings,
  };
}

export function filterUnderHoursReportForScope<
  T extends {
    weeks: Array<{ underThreshold: Array<{ email: string; name?: string }> }>;
    warnings: string[];
  },
>(report: T, scope: ResolvedTimeDashboardScope): T {
  const weeks = report.weeks.map((week) => ({
    ...week,
    underThreshold: filterEmployeeRowsForScope(week.underThreshold, scope),
  }));
  const note = scopeNote(scope);
  return {
    ...report,
    weeks,
    warnings: note ? [...report.warnings, note] : report.warnings,
  };
}

export function assertUserDetailAllowed(
  employeeEmail: string,
  scope: ResolvedTimeDashboardScope,
): void {
  if (scope.level === "full") return;
  if (scope.level === "none") {
    throw new Error("Forbidden — Time Dashboard access required");
  }
  const key = canonicalOfficialEmail(employeeEmail)?.toLowerCase();
  if (!key || !scope.allowedEmails.has(key)) {
    throw new Error("Forbidden — you can only view your direct reports in Time Dashboard");
  }
}
