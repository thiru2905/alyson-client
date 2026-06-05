export const WEEKLY_HOURS_TARGET = 35;

export type WeeklyPacingStatus = "target_met" | "on_track" | "behind" | "at_risk" | "critical";

export type WeeklyPacingRow = {
  id: string;
  email: string;
  name: string;
  title: string;
  hoursWorked: number;
  hoursRemaining: number;
  /** Hours above the weekly target (0 when under target). */
  hoursOver: number;
  hoursExpected: number;
  paceDelta: number;
  remainingWorkDays: number;
  requiredHoursPerDay: number;
  weekProgressPct: number;
  metTarget: boolean;
  status: WeeklyPacingStatus;
};

export type WeeklyPacingSortField =
  | "name"
  | "hoursWorked"
  | "hoursRemaining"
  | "hoursOver"
  | "hoursExpected"
  | "paceDelta"
  | "remainingWorkDays"
  | "requiredHoursPerDay"
  | "status";

export type WeeklyPacingReport = {
  company: { id: string; name: string };
  targetHours: number;
  timeZone: string;
  timeZoneLabel: string;
  today: string;
  week: { start: string; end: string };
  elapsedWorkDays: number;
  totalWorkDays: number;
  remainingWorkDays: number;
  generatedAt: string;
  rows: WeeklyPacingRow[];
  warnings: string[];
};

function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isWeekdayIso(iso: string): boolean {
  const dow = parseIso(iso).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function enumerateDaysIso(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  for (let day = start; day <= end; day = addDaysIso(day, 1)) {
    out.push(day);
  }
  return out;
}

export function countWeekdaysInclusive(start: string, end: string): number {
  return enumerateDaysIso(start, end).filter(isWeekdayIso).length;
}

export function weekEndIso(weekStart: string): string {
  return addDaysIso(weekStart, 6);
}

export type WeekPacingContext = {
  weekStart: string;
  today: string;
  targetHours?: number;
};

export type WeekPacingMetrics = {
  targetHours: number;
  weekEnd: string;
  elapsedWorkDays: number;
  totalWorkDays: number;
  remainingWorkDays: number;
  weekProgressPct: number;
  hoursExpected: number;
};

export function computeWeekPacingMetrics(ctx: WeekPacingContext): WeekPacingMetrics {
  const targetHours = ctx.targetHours ?? WEEKLY_HOURS_TARGET;
  const weekEnd = weekEndIso(ctx.weekStart);
  const elapsedWorkDays = countWeekdaysInclusive(ctx.weekStart, ctx.today);
  const totalWorkDays = countWeekdaysInclusive(ctx.weekStart, weekEnd);
  const tomorrow = addDaysIso(ctx.today, 1);
  const remainingWorkDays = countWeekdaysInclusive(tomorrow, weekEnd);
  const weekProgressPct =
    totalWorkDays > 0 ? Math.round((elapsedWorkDays / totalWorkDays) * 1000) / 10 : 0;
  const hoursExpected =
    totalWorkDays > 0
      ? Math.round(((targetHours * elapsedWorkDays) / totalWorkDays) * 100) / 100
      : 0;

  return {
    targetHours,
    weekEnd,
    elapsedWorkDays,
    totalWorkDays,
    remainingWorkDays,
    weekProgressPct,
    hoursExpected,
  };
}

export function resolvePacingStatus(args: {
  hoursWorked: number;
  hoursExpected: number;
  hoursRemaining: number;
  remainingWorkDays: number;
  targetHours: number;
}): WeeklyPacingStatus {
  const { hoursWorked, hoursExpected, hoursRemaining, remainingWorkDays, targetHours } = args;
  if (hoursWorked >= targetHours) return "on_track";
  if (remainingWorkDays <= 0 && hoursRemaining > 0) return "critical";
  if (hoursWorked < hoursExpected * 0.65 || (remainingWorkDays <= 1 && hoursRemaining > 8)) {
    return "critical";
  }
  if (hoursWorked < hoursExpected * 0.85) return "at_risk";
  if (hoursWorked < hoursExpected - 0.5) return "behind";
  return "on_track";
}

export function buildPacingRow(args: {
  id: string;
  email: string;
  name: string;
  title: string;
  weeklySeconds: number;
  metrics: WeekPacingMetrics;
}): WeeklyPacingRow | null {
  if (!args.email.trim()) return null;

  const hoursWorked = Math.round((args.weeklySeconds / 3600) * 100) / 100;
  const { targetHours, hoursExpected, remainingWorkDays } = args.metrics;
  const metTarget = hoursWorked >= targetHours;
  const hoursRemaining = metTarget
    ? 0
    : Math.round((targetHours - hoursWorked) * 100) / 100;
  const hoursOver = metTarget
    ? Math.round((hoursWorked - targetHours) * 100) / 100
    : 0;
  const paceDelta = Math.round((hoursWorked - hoursExpected) * 100) / 100;
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
    hoursWorked,
    hoursRemaining,
    hoursOver,
    hoursExpected,
    paceDelta,
    remainingWorkDays,
    requiredHoursPerDay,
    weekProgressPct: args.metrics.weekProgressPct,
    metTarget,
    status: resolvePacingStatus({
      hoursWorked,
      hoursExpected,
      hoursRemaining,
      remainingWorkDays,
      targetHours,
    }),
  };
}

export const PACING_STATUS_LABEL: Record<WeeklyPacingStatus, string> = {
  target_met: "Target met",
  on_track: "On track",
  behind: "Behind",
  at_risk: "At risk",
  critical: "Critical",
};

const STATUS_SORT_ORDER: Record<WeeklyPacingStatus, number> = {
  critical: 0,
  at_risk: 1,
  behind: 2,
  on_track: 3,
  target_met: 4,
};

export function sortPacingRows(
  rows: WeeklyPacingRow[],
  sortBy: WeeklyPacingSortField,
  sortDir: "asc" | "desc",
): WeeklyPacingRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
        break;
      case "status":
        cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
        break;
      default:
        cmp = a[sortBy] - b[sortBy];
    }
    return cmp * dir;
  });
}
