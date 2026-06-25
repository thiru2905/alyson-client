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

/** Append-only leave record for an employee. */
export type LeaveRecordEvent = {
  id: string;
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

/** Normalize team/location labels for matching (same rules as leave analytics). */
export function normLeaveFacet(value: string, fallback: string): string {
  const v = String(value || "").trim();
  return v || fallback;
}

export function matchesTeamLocation(
  employeeLocation: string,
  employeeTeam: string,
  leaveLocation: string,
  leaveTeam: string,
): boolean {
  return (
    normLeaveFacet(employeeLocation, "Unknown") === normLeaveFacet(leaveLocation, "Unknown") &&
    normLeaveFacet(employeeTeam, "Unassigned") === normLeaveFacet(leaveTeam, "Unassigned")
  );
}

export type LeaveDateRange = { startDate: string; endDate: string };

/** Count unique weekday leave days across overlapping ranges within a report window. */
export function countLeaveWorkdaysUnion(
  ranges: LeaveDateRange[],
  rangeStart: string,
  rangeEnd: string,
): number {
  const days = new Set<string>();
  for (const e of ranges) {
    const start = e.startDate > rangeStart ? e.startDate : rangeStart;
    const end = e.endDate < rangeEnd ? e.endDate : rangeEnd;
    if (start > end) continue;
    const cur = new Date(`${start}T12:00:00Z`);
    const endD = new Date(`${end}T12:00:00Z`);
    while (cur.getTime() <= endD.getTime()) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) days.add(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return days.size;
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
