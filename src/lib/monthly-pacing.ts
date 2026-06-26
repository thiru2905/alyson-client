import {
  PACING_LEAVE_HOURS_PER_DAY,
  WEEKLY_HOURS_TARGET,
  addDaysIso,
  countWeekdaysInclusive,
  enumerateDaysIso,
  isWeekdayIso,
  pacingTodayIso,
  resolvePacingStatus,
  type WeeklyPacingLeaveSummary,
  type WeeklyPacingRow,
} from "@/lib/weekly-pacing";

export type MonthPacingMetrics = {
  targetHours: number;
  monthEnd: string;
  pacingSampleDays: string[];
  elapsedWorkDays: number;
  totalWorkDays: number;
  remainingWorkDays: number;
  monthProgressPct: number;
};

export type MonthlyPacingReport = {
  company: { id: string; name: string };
  targetHours: number;
  timeZone: string;
  timeZoneLabel: string;
  today: string;
  month: { start: string; end: string; label: string };
  pacingSampleDays: string[];
  elapsedWorkDays: number;
  totalWorkDays: number;
  remainingWorkDays: number;
  generatedAt: string;
  rows: WeeklyPacingRow[];
  leaveSummary: WeeklyPacingLeaveSummary;
  warnings: string[];
};

/** `YYYY-MM` from an ISO date or month input. */
export function monthYearFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStartIso(monthYear: string): string {
  return `${monthYear}-01`;
}

export function monthEndIso(monthYear: string): string {
  const [y, m] = monthYear.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthYear}-${String(last).padStart(2, "0")}`;
}

export function monthLabel(monthYear: string): string {
  const [y, m] = monthYear.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isPastMonth(monthYear: string, today = pacingTodayIso()): boolean {
  return monthYear < monthYearFromIso(today);
}

/** Rollup anchor: past months use month-end; current month caps at today. */
export function resolveMonthlyRollupDay(monthYear: string, today = pacingTodayIso()): string {
  const start = monthStartIso(monthYear);
  const end = monthEndIso(monthYear);
  if (isPastMonth(monthYear, today)) return end;
  if (today < start) return start;
  return today <= end ? today : end;
}

/** Elapsed weekdays in the month through rollup day (inclusive). */
export function monthPacingSampleDays(monthStart: string, rollupDay: string, monthEnd: string): string[] {
  const sampleEnd = rollupDay <= monthEnd ? rollupDay : monthEnd;
  if (sampleEnd < monthStart) return [];
  return enumerateDaysIso(monthStart, sampleEnd).filter(isWeekdayIso);
}

export function computeMonthPacingMetrics(args: {
  monthYear: string;
  rollupDay: string;
}): MonthPacingMetrics {
  const monthStart = monthStartIso(args.monthYear);
  const monthEnd = monthEndIso(args.monthYear);
  const totalWorkDays = countWeekdaysInclusive(monthStart, monthEnd);
  const targetHours = totalWorkDays * PACING_LEAVE_HOURS_PER_DAY;
  const sampleDays = monthPacingSampleDays(monthStart, args.rollupDay, monthEnd);
  const elapsedWorkDays = countWeekdaysInclusive(monthStart, args.rollupDay);
  const tomorrow = addDaysIso(args.rollupDay, 1);
  const remainingWorkDays =
    args.rollupDay >= monthEnd ? 0 : countWeekdaysInclusive(tomorrow, monthEnd);
  const monthProgressPct =
    totalWorkDays > 0 ? Math.round((elapsedWorkDays / totalWorkDays) * 1000) / 10 : 0;

  return {
    targetHours,
    monthEnd,
    pacingSampleDays: sampleDays,
    elapsedWorkDays,
    totalWorkDays,
    remainingWorkDays,
    monthProgressPct,
  };
}

function computeMonthPaceFromDailyHours(args: {
  dailyHours: number[];
  targetHours: number;
  hoursWorked: number;
  remainingWorkDays: number;
}): {
  avgDailyPace: number;
  projectedPace: number;
  paceDelta: number;
} {
  const { dailyHours, targetHours, hoursWorked, remainingWorkDays } = args;
  const sampleCount = dailyHours.length;
  const hoursThroughSample = dailyHours.reduce((s, h) => s + h, 0);
  const avgDailyPace =
    sampleCount > 0
      ? Math.round((hoursThroughSample / sampleCount) * 100) / 100
      : 0;

  const projectedPace =
    remainingWorkDays > 0
      ? Math.round((hoursWorked + avgDailyPace * remainingWorkDays) * 100) / 100
      : Math.round(hoursWorked * 100) / 100;
  const paceDelta = Math.round((projectedPace - targetHours) * 100) / 100;

  return { avgDailyPace, projectedPace, paceDelta };
}

export function buildMonthlyPacingRow(args: {
  id: string;
  email: string;
  name: string;
  title: string;
  periodSeconds: number;
  dailyHours: number[];
  metrics: MonthPacingMetrics;
  rollupDay: string;
  leaveDays?: number;
  leaveDaysPersonal?: number;
  leaveDaysTeam?: number;
}): WeeklyPacingRow | null {
  if (!args.email.trim()) return null;

  const hoursWorkedLogged = Math.round((args.periodSeconds / 3600) * 100) / 100;
  const leaveDays = args.leaveDays ?? 0;
  const leaveDaysPersonal = args.leaveDaysPersonal ?? 0;
  const leaveDaysTeam = args.leaveDaysTeam ?? 0;
  const leaveHoursCredit =
    Math.round(leaveDays * PACING_LEAVE_HOURS_PER_DAY * 100) / 100;
  const hoursWorked = Math.round((hoursWorkedLogged + leaveHoursCredit) * 100) / 100;
  const { targetHours, remainingWorkDays } = args.metrics;
  const metTarget = hoursWorked >= targetHours;

  const { avgDailyPace, projectedPace, paceDelta } = computeMonthPaceFromDailyHours({
    dailyHours: args.dailyHours,
    targetHours,
    hoursWorked,
    remainingWorkDays,
  });

  const hoursRemaining = metTarget
    ? 0
    : Math.round((targetHours - hoursWorked) * 100) / 100;
  const hoursOver = metTarget
    ? Math.round((hoursWorked - targetHours) * 100) / 100
    : 0;
  const requiredHoursPerDay = metTarget
    ? 0
    : remainingWorkDays > 0
      ? Math.round((hoursRemaining / remainingWorkDays) * 100) / 100
      : hoursRemaining;

  return {
    id: args.id,
    email: args.email,
    name: args.name,
    title: args.title,
    location: null,
    team: null,
    managerName: null,
    managerEmail: null,
    hoursWorkedLogged,
    leaveDays,
    leaveDaysPersonal,
    leaveDaysTeam,
    leaveHoursCredit,
    hoursWorked,
    avgDailyPace,
    hoursRemaining,
    hoursOver,
    projectedPace,
    hoursExpected: projectedPace,
    paceDelta,
    remainingWorkDays,
    requiredHoursPerDay,
    weekProgressPct: args.metrics.monthProgressPct,
    metTarget,
    active: false,
    status: resolvePacingStatus({
      hoursWorked,
      projectedPace,
      hoursRemaining,
      remainingWorkDays,
      targetHours,
    }),
  };
}

/** Monthly target = workdays × 7h (equivalent to {WEEKLY_HOURS_TARGET}h/week). */
export const MONTHLY_HOURS_PER_WORKDAY = PACING_LEAVE_HOURS_PER_DAY;
export const WEEKLY_EQUIVALENT_TARGET = WEEKLY_HOURS_TARGET;
