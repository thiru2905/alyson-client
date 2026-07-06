import type { LeaveRecordEvent } from "@/lib/leave-schema";
import { LIFETIME_LEAVE_DAYS_LIMIT, sumLeaveDays } from "@/lib/leave-schema";

/** Cumulative lifetime days used after applying events in chronological order up to and including `eventId`. */
export function cumulativeLeaveDaysThroughEvent(
  events: LeaveRecordEvent[],
  eventId: string,
): number {
  const sorted = [...events].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt),
  );
  let total = 0;
  for (const e of sorted) {
    total += Number.isFinite(e.days) ? e.days : 0;
    if (e.id === eventId) break;
  }
  return total;
}

/** True when this event pushes the employee over the lifetime allowance (salary deduction risk). */
export function isLeaveEventOverLimit(events: LeaveRecordEvent[], eventId: string): boolean {
  const sorted = [...events].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt),
  );
  let total = 0;
  for (const e of sorted) {
    total += Number.isFinite(e.days) ? e.days : 0;
    if (e.id === eventId) return total > LIFETIME_LEAVE_DAYS_LIMIT;
  }
  return false;
}

/** Preview before recording: would `additionalDays` push cumulative total over the limit? */
export function wouldExceedLifetimeLeaveLimit(
  events: LeaveRecordEvent[],
  additionalDays: number,
): boolean {
  return sumLeaveDays(events) + additionalDays > LIFETIME_LEAVE_DAYS_LIMIT;
}

export function lifetimeLeaveUsed(events: LeaveRecordEvent[]): number {
  return sumLeaveDays(events);
}

export function lifetimeLeaveRemaining(events: LeaveRecordEvent[]): number {
  return Math.max(0, LIFETIME_LEAVE_DAYS_LIMIT - sumLeaveDays(events));
}
