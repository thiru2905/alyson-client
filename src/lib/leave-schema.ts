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
  /** False when employee was removed from onboarding roster (history retained). */
  active: boolean;
  leaveEvents: LeaveRecordEvent[];
  updatedAt: string;
};

export type LeaveOperation = "bootstrap" | "sync" | "append_leave" | "void_leave";

export type LeaveLogEntry = {
  ts: string;
  op: LeaveOperation;
  actor: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  details?: string;
  event?: LeaveRecordEvent;
  employeeCount?: number;
};

export type LeaveDataFile = {
  version: 1;
  updatedAt: string;
  syncedFromOnboardingAt: string | null;
  employees: Record<string, EmployeeLeaveLedger>;
};

/** Maximum lifetime leave days per employee (all types combined). */
export const LIFETIME_LEAVE_DAYS_LIMIT = 10;

export function newLeaveEventId(): string {
  return `leave_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function leaveDaysInclusive(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T12:00:00Z`);
  const b = new Date(`${endDate}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Math.max(1, diff);
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
