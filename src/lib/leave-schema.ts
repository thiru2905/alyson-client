/** Leave types recorded in the S3 ledger. */
export type LeaveType = "annual" | "sick" | "personal" | "unpaid" | "other";

export const LEAVE_TYPE_OPTIONS: Array<{ value: LeaveType; label: string }> = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];

export function leaveTypeLabel(t: LeaveType): string {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

/** Half-day leave credit (×8h pacing → +4h). Full day = 1 → +8h. */
export const HALF_DAY_LEAVE_DAYS = 0.5;

/** Append-only leave record for an employee. */
export type LeaveRecordEvent = {
  id: string;
  leaveType: LeaveType;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  /** ISO date YYYY-MM-DD */
  endDate: string;
  /**
   * Leave day credit for balances / pacing.
   * Full day = 1 per weekday; half day = 0.5 (+4h pacing vs +8h full).
   */
  days: number;
  /** When true, recorded as a single half day (days should be 0.5). */
  halfDay?: boolean;
  note?: string;
  createdAt: string;
  createdBy?: string | null;
};

export type EmployeeLeaveLedger = {
  employeeId: string;
  employeeName: string;
  officialEmail: string;
  jobTitle: string;
  team: string;
  location: string;
  /** False when employee is not on the current Time Doctor roster (history retained). */
  active: boolean;
  leaveEvents: LeaveRecordEvent[];
  updatedAt: string;
};

/** Team-wide leave for a location + team — credits all matching active employees in Weekly Pacing. */
export type TeamLeaveEvent = {
  id: string;
  location: string;
  team: string;
  leaveType: LeaveType;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  /** ISO date YYYY-MM-DD */
  endDate: string;
  days: number;
  note?: string;
  createdAt: string;
  createdBy?: string | null;
};

export type LeaveOperation =
  | "bootstrap"
  | "sync"
  | "append_leave"
  | "void_leave"
  | "append_team_leave"
  | "void_team_leave";

export type LeaveLogEntry = {
  ts: string;
  op: LeaveOperation;
  actor: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  details?: string;
  event?: LeaveRecordEvent;
  teamEvent?: TeamLeaveEvent;
  employeeCount?: number;
};

export type LeaveDataFile = {
  version: 1;
  updatedAt: string;
  syncedFromOnboardingAt: string | null;
  employees: Record<string, EmployeeLeaveLedger>;
  /** Location + team leave blocks (auto +7h/day in Weekly Pacing for matching employees). */
  teamLeaves?: TeamLeaveEvent[];
};

/** Maximum lifetime leave days per employee (all types combined). */
export const LIFETIME_LEAVE_DAYS_LIMIT = 10;

export function newLeaveEventId(): string {
  return `leave_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newTeamLeaveEventId(): string {
  return `team_leave_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Stored on team leave events when every team at the location is included. */
export const TEAM_LEAVE_ALL_TEAMS = "__all_teams__";

/** Normalize team/location labels for matching (same rules as leave analytics). */
export function normLeaveFacet(value: string, fallback: string): string {
  const v = String(value || "").trim();
  return v || fallback;
}

export function isAllTeamsLeave(team: string): boolean {
  return team === TEAM_LEAVE_ALL_TEAMS;
}

export function formatTeamLeaveLabel(team: string): string {
  return isAllTeamsLeave(team) ? "All teams" : team;
}

export function matchesTeamLocation(
  employeeLocation: string,
  employeeTeam: string,
  leaveLocation: string,
  leaveTeam: string,
): boolean {
  const locMatch =
    normLeaveFacet(employeeLocation, "Unknown") === normLeaveFacet(leaveLocation, "Unknown");
  if (!locMatch) return false;
  if (isAllTeamsLeave(leaveTeam)) return true;
  return (
    normLeaveFacet(employeeTeam, "Unassigned") === normLeaveFacet(leaveTeam, "Unassigned")
  );
}

export type LeaveDateRange = {
  startDate: string;
  endDate: string;
  /** Half-day leave credits 0.5 day / +4h pacing instead of 1 / +8h. */
  halfDay?: boolean;
};

/**
 * Count weekday leave credit across overlapping ranges within a report window.
 * Overlapping leave on the same date takes the max fraction (full day wins over half).
 */
export function countLeaveWorkdaysUnion(
  ranges: LeaveDateRange[],
  rangeStart: string,
  rangeEnd: string,
): number {
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return 0;
  const byDay = new Map<string, number>();
  for (const e of ranges) {
    const start = e.startDate > rangeStart ? e.startDate : rangeStart;
    const end = e.endDate < rangeEnd ? e.endDate : rangeEnd;
    if (start > end) continue;
    const fraction = e.halfDay ? HALF_DAY_LEAVE_DAYS : 1;
    const cur = new Date(`${start}T12:00:00Z`);
    const endD = new Date(`${end}T12:00:00Z`);
    while (cur.getTime() <= endD.getTime()) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        const iso = cur.toISOString().slice(0, 10);
        byDay.set(iso, Math.max(byDay.get(iso) ?? 0, fraction));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  let total = 0;
  for (const v of byDay.values()) total += v;
  return Math.round(total * 100) / 100;
}

export function leaveDaysInclusive(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T12:00:00Z`);
  const b = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  if (b < a) return 0;

  let count = 0;
  const cur = new Date(a);
  while (cur.getTime() <= b.getTime()) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Weekday leave days from events overlapping an inclusive date range (union — no double-count). */
export function countLeaveWorkdaysInRange(
  events: LeaveRecordEvent[],
  rangeStart: string,
  rangeEnd: string,
): number {
  return countLeaveWorkdaysUnion(events, rangeStart, rangeEnd);
}

export function countTeamLeaveWorkdaysInRange(
  events: TeamLeaveEvent[],
  rangeStart: string,
  rangeEnd: string,
): number {
  return countLeaveWorkdaysUnion(events, rangeStart, rangeEnd);
}

export function sumLeaveDays(events: LeaveRecordEvent[]): number {
  return events.reduce((sum, e) => sum + (Number.isFinite(e.days) ? e.days : 0), 0);
}

export function sumLeaveDaysInYear(events: LeaveRecordEvent[], year: number): number {
  return events
    .filter((e) => e.startDate.startsWith(String(year)))
    .reduce((sum, e) => sum + (Number.isFinite(e.days) ? e.days : 0), 0);
}

export function remainingLifetimeLeaveDays(events: LeaveRecordEvent[]): number {
  return Math.max(0, LIFETIME_LEAVE_DAYS_LIMIT - sumLeaveDays(events));
}

export function validateLifetimeLeaveLimit(
  events: LeaveRecordEvent[],
  additionalDays: number,
): { ok: true } | { ok: false; message: string } {
  const used = sumLeaveDays(events);
  const remaining = LIFETIME_LEAVE_DAYS_LIMIT - used;
  if (additionalDays <= remaining) return { ok: true };
  return {
    ok: false,
    message: `Lifetime leave limit is ${LIFETIME_LEAVE_DAYS_LIMIT} days. ${used} used, ${remaining} remaining — cannot add ${additionalDays} day(s).`,
  };
}
