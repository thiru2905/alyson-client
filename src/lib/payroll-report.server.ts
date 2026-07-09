import { ensureBonusOnS3 } from "@/lib/bonus-s3.server";
import { sumBonusEvents } from "@/lib/bonus-schema";
import { monthLabel } from "@/lib/monthly-pacing";
import { canonicalOfficialEmail } from "@/lib/cintara-email";
import { ensureOnboardingOnS3 } from "@/lib/onboarding-s3.server";
import type { OnboardingRow } from "@/lib/onboarding-schema";
import { resolvePayPeriod } from "@/lib/payroll-period";
import {
  buildPayPeriodPacingReport,
  buildPacingRowLookup,
  isLowActivity,
  lookupPacingRow,
} from "@/lib/payroll-pacing.server";
import {
  ensurePayrollOnS3,
  getPaidRecord,
  isPastPayMonth,
  loadPayrollMonthSnapshot,
  mergePaidStatusIntoSnapshotRows,
  savePayrollMonthSnapshot,
} from "@/lib/payroll-s3.server";
import {
  fxRateForCurrency,
  monthsBetween,
  parseMoneyLocal,
  payCycleLabel,
  periodFxRates,
  resolvePayCycleFromLocation,
  resolvePayrollCurrency,
  isPayrollEligibleEmployee,
  type PayrollPayCycle,
  type PayrollReport,
  type PayrollReportRow,
} from "@/lib/payroll-schema";
import { enrichBonusLedgersWithPacingActive } from "@/lib/weekly-pacing-active.server";
import { mergePayrollRosterWithOrgChart } from "@/lib/payroll-roster.server";

function applyReportFilters(
  rows: PayrollReportRow[],
  payCycleFilter: "all" | PayrollPayCycle,
  activeOnly: boolean,
): PayrollReportRow[] {
  return rows.filter((row) => {
    if (payCycleFilter !== "all" && row.payCycle !== payCycleFilter) return false;
    if (activeOnly && !row.active) return false;
    return true;
  });
}

function reportFromSnapshot(args: {
  snapshot: Awaited<ReturnType<typeof loadPayrollMonthSnapshot>>;
  payMonth: string;
  payCycleFilter: "all" | PayrollPayCycle;
  activeOnly: boolean;
  payrollFile: Awaited<ReturnType<typeof ensurePayrollOnS3>>;
}): PayrollReport {
  const { snapshot, payMonth, payCycleFilter, activeOnly, payrollFile } = args;
  if (!snapshot) throw new Error("Missing snapshot");

  let rows = mergePaidStatusIntoSnapshotRows(snapshot.rows, payrollFile, payMonth);
  rows = applyReportFilters(rows, payCycleFilter, activeOnly);
  rows = dedupePayrollRows(rows);
  rows.sort((a, b) => {
    if (a.payCycle !== b.payCycle) return a.payCycle.localeCompare(b.payCycle);
    return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" });
  });

  return {
    payMonth,
    payMonthLabel: monthLabel(payMonth),
    payCycleFilter,
    generatedAt: snapshot.capturedAt,
    snapshotCapturedAt: snapshot.capturedAt,
    dataSource: "snapshot",
    usdToInrRate: snapshot.usdToInrRate,
    usdToPkrRate: snapshot.usdToPkrRate,
    rateAsOf: snapshot.rateAsOf,
    rows,
    warnings: snapshot.warnings,
  };
}

function employeeIdFromRow(row: OnboardingRow): string {
  return String(row["Employee ID"] ?? row._rowId ?? "").trim();
}

function normPayrollName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function payrollRowScore(row: PayrollReportRow): number {
  let score = 0;
  const email = row.officialEmail.toLowerCase();
  if (email.endsWith("@cintara.ai") && !/^user\d+@cintara\.ai$/.test(email)) score += 10;
  if (row.effectiveHours > 0) score += 3;
  if (row.startingBaseSalaryLocal > 0) score += 2;
  if (!row.employeeId.startsWith("cint_")) score += 1;
  return score;
}

/** Same person can appear twice when onboarding has a placeholder email and org chart supplements. */
function dedupePayrollRows(rows: PayrollReportRow[]): PayrollReportRow[] {
  const byKey = new Map<string, PayrollReportRow>();
  for (const row of rows) {
    const key = `${row.payCycle}|${normPayrollName(row.employeeName) || row.employeeId}`;
    const prev = byKey.get(key);
    if (!prev || payrollRowScore(row) > payrollRowScore(prev)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function bonusInPeriod(
  events: { paidOn: string; amountUsd: number }[],
  periodStart: string,
  periodEnd: string,
  rate: number,
) {
  const usd = events
    .filter((e) => {
      const d = String(e.paidOn || "").slice(0, 10);
      return d >= periodStart && d <= periodEnd;
    })
    .reduce((s, e) => s + (Number.isFinite(e.amountUsd) ? e.amountUsd : 0), 0);
  return Math.round(usd * rate);
}

export async function buildPayrollReport(args: {
  month: string;
  payCycleFilter?: "all" | PayrollPayCycle;
  activeOnly?: boolean;
}): Promise<PayrollReport> {
  const payMonth = String(args.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(payMonth)) {
    throw new Error("Invalid month — use YYYY-MM");
  }
  const payCycleFilter = args.payCycleFilter ?? "all";
  const activeOnly = args.activeOnly ?? true;

  if (isPastPayMonth(payMonth)) {
    const existing = await loadPayrollMonthSnapshot(payMonth);
    if (existing) {
      const payrollFile = await ensurePayrollOnS3();
      return reportFromSnapshot({
        snapshot: existing,
        payMonth,
        payCycleFilter,
        activeOnly,
        payrollFile,
      });
    }

    const fullReport = await buildPayrollReportLive({
      month: payMonth,
      payCycleFilter: "all",
      activeOnly: false,
    });
    await savePayrollMonthSnapshot(fullReport);
    return {
      ...reportFromSnapshot({
        snapshot: {
          version: 1,
          payMonth,
          capturedAt: fullReport.generatedAt,
          usdToInrRate: fullReport.usdToInrRate,
          usdToPkrRate: fullReport.usdToPkrRate,
          rateAsOf: fullReport.rateAsOf,
          rows: fullReport.rows,
          warnings: fullReport.warnings,
        },
        payMonth,
        payCycleFilter,
        activeOnly,
        payrollFile: await ensurePayrollOnS3(),
      }),
      dataSource: "live",
      snapshotCapturedAt: fullReport.generatedAt,
    };
  }

  const report = await buildPayrollReportLive(args);
  return {
    ...report,
    dataSource: "live",
    snapshotCapturedAt: null,
  };
}

export async function buildPayrollReportLive(args: {
  month: string;
  payCycleFilter?: "all" | PayrollPayCycle;
  activeOnly?: boolean;
}): Promise<PayrollReport> {
  const payMonth = String(args.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(payMonth)) {
    throw new Error("Invalid month — use YYYY-MM");
  }
  const payCycleFilter = args.payCycleFilter ?? "all";
  const activeOnly = args.activeOnly ?? true;
  const warnings: string[] = [];

  const [onboardingFile, bonusData, payrollFile] = await Promise.all([
    ensureOnboardingOnS3(),
    ensureBonusOnS3(),
    ensurePayrollOnS3(),
  ]);

  const onboardingRows = mergePayrollRosterWithOrgChart(onboardingFile.rows);

  const onboardingIds = new Set(onboardingRows.map((r) => employeeIdFromRow(r)).filter(Boolean));
  const bonusLedgers = await enrichBonusLedgersWithPacingActive(bonusData.employees, onboardingIds);

  const periodSettings = payrollFile.periods[payMonth];
  const { usdToInrRate, usdToPkrRate } = periodFxRates(periodSettings);
  const rateAsOf = periodSettings?.rateAsOf ?? null;

  const rows: PayrollReportRow[] = [];
  let tdUnmatched = 0;

  const cycles: PayrollPayCycle[] =
    payCycleFilter === "all" ? ["india_15th", "pakistan_month_end"] : [payCycleFilter];

  const pacingByCycle = new Map<PayrollPayCycle, Awaited<ReturnType<typeof buildPayPeriodPacingReport>>>();
  const pacingLookupByCycle = new Map<PayrollPayCycle, ReturnType<typeof buildPacingRowLookup>>();
  for (const cycle of cycles) {
    const period = resolvePayPeriod(payMonth, cycle);
    try {
      const report = await buildPayPeriodPacingReport(period);
      pacingByCycle.set(cycle, report);
      pacingLookupByCycle.set(cycle, buildPacingRowLookup(report.rows));
    } catch (e) {
      warnings.push(`${cycle}-pacing: ${String(e)}`);
    }
  }

  for (const row of onboardingRows) {
    const employeeId = employeeIdFromRow(row);
    if (!employeeId) continue;
    if (!isPayrollEligibleEmployee(row)) continue;

    const employeeName = String(row.Name ?? "").trim() || employeeId;
    const officialEmail = canonicalOfficialEmail(String(row["Official Email"] ?? ""));
    const team = String(row.Team ?? "").trim();
    const location = String(row.Location ?? "").trim();
    const payCycle = resolvePayCycleFromLocation(location, team);
    const localCurrency = resolvePayrollCurrency(team, location, payCycle);
    const usdToLocalRate = fxRateForCurrency(periodSettings, localCurrency);

    if (payCycleFilter !== "all" && payCycle !== payCycleFilter) continue;

    const bonusLedger = bonusLedgers[employeeId];
    const active = bonusLedger?.active ?? true;
    if (activeOnly && !active) continue;

    const period = resolvePayPeriod(payMonth, payCycle);
    const pacingReport = pacingByCycle.get(payCycle);
    const pacingLookup = pacingLookupByCycle.get(payCycle);
    const pacing = pacingLookup
      ? lookupPacingRow(pacingLookup, { email: officialEmail, name: employeeName })
      : undefined;
    if (!pacing && officialEmail) tdUnmatched += 1;

    const overrides = payrollFile.employees[employeeId];
    const startingDate = overrides?.startingDate?.trim() || null;
    const lastSalaryRevisionDate = overrides?.lastSalaryRevisionDate?.trim() || null;
    const nextSalaryReviewDate = overrides?.nextSalaryReviewDate?.trim() || null;

    const startingBaseSalaryLocal =
      overrides?.startingBaseSalaryLocal ?? parseMoneyLocal(row["Base Salary"]);
    const incrementLocal = overrides?.incrementLocal ?? 0;
    const newBaseSalaryLocal = startingBaseSalaryLocal + incrementLocal;
    const benefitsLocal = overrides?.benefitsLocal ?? parseMoneyLocal(row.Benefits);
    const reimbursementLocal = overrides?.reimbursementLocal ?? 0;
    const bonusLocal = bonusLedger
      ? bonusInPeriod(bonusLedger.bonusEvents, period.periodStart, period.periodEnd, usdToLocalRate)
      : 0;

    const totalLocal = newBaseSalaryLocal + benefitsLocal + bonusLocal + reimbursementLocal;
    const totalUsd = usdToLocalRate > 0 ? Math.round((totalLocal / usdToLocalRate) * 100) / 100 : 0;

    const approvedHolidayDays = pacing?.leaveDays ?? 0;
    const meetingCreditsHours = overrides?.meetingCreditsHours ?? 0;
    const additionalCreditsHours = overrides?.additionalCreditsHours ?? 0;
    const loggedHours = pacing?.hoursWorkedLogged ?? 0;
    const leaveCreditHours = pacing?.leaveHoursCredit ?? 0;
    const effectiveHours =
      Math.round((loggedHours + leaveCreditHours + meetingCreditsHours + additionalCreditsHours) * 100) / 100;
    const totalRequiredHours = pacingReport?.targetHours ?? 0;
    const percentCompleted =
      totalRequiredHours > 0
        ? Math.round((effectiveHours / totalRequiredHours) * 1000) / 10
        : 0;
    const salaryAccordingToTdHours =
      Math.round((newBaseSalaryLocal * Math.min(percentCompleted, 100)) / 100);

    const paid = getPaidRecord(payrollFile, employeeId, payMonth, payCycle);

    rows.push({
      employeeId,
      employeeName,
      officialEmail,
      team,
      location,
      active,
      localCurrency,
      payCycle,
      payMonth,
      payDate: period.payDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      periodLabel: period.label,
      startingDate,
      monthsWorked: monthsBetween(startingDate, period.periodEnd),
      lastSalaryRevisionDate,
      nextSalaryReviewDate,
      startingBaseSalaryLocal,
      incrementLocal,
      newBaseSalaryLocal,
      benefitsLocal,
      bonusLocal,
      reimbursementLocal,
      totalLocal,
      usdToLocalRate,
      rateAsOf,
      totalUsd,
      lowActivity: isLowActivity(pacing, active),
      approvedHolidayDays,
      meetingCreditsHours,
      additionalCreditsHours,
      effectiveHours,
      totalRequiredHours,
      percentCompleted,
      salaryAccordingToTdHours,
      paidAt: paid?.paidAt ?? null,
      paidBy: paid?.paidBy ?? null,
    });
  }

  const dedupedRows = dedupePayrollRows(rows);
  dedupedRows.sort((a, b) => {
    if (a.payCycle !== b.payCycle) return a.payCycle.localeCompare(b.payCycle);
    return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" });
  });

  if (!pacingByCycle.size) {
    warnings.push("Time Doctor pacing unavailable for this pay period.");
  } else if (tdUnmatched > 0) {
    warnings.push(
      `${tdUnmatched} employee(s) could not be matched to Time Doctor (check Official Email vs TD account)`,
    );
  }

  return {
    payMonth,
    payMonthLabel: monthLabel(payMonth),
    payCycleFilter,
    generatedAt: new Date().toISOString(),
    dataSource: "live",
    snapshotCapturedAt: null,
    usdToInrRate,
    usdToPkrRate,
    rateAsOf,
    rows: dedupedRows,
    warnings: warnings.slice(0, 6),
  };
}

export async function backfillPayrollSnapshots(monthsBack = 12): Promise<{
  saved: string[];
  skipped: string[];
}> {
  const { listPastPayMonths } = await import("@/lib/payroll-s3.server");
  const saved: string[] = [];
  const skipped: string[] = [];

  for (const month of listPastPayMonths(monthsBack)) {
    const existing = await loadPayrollMonthSnapshot(month);
    if (existing) {
      skipped.push(month);
      continue;
    }
    const report = await buildPayrollReportLive({
      month,
      payCycleFilter: "all",
      activeOnly: false,
    });
    await savePayrollMonthSnapshot(report);
    saved.push(month);
  }

  return { saved, skipped };
}

export { payCycleLabel };
