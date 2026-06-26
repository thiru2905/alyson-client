import type { TeamLeaveEvent } from "@/lib/leave-schema";
import { formatTeamLeaveLabel, leaveTypeLabel } from "@/lib/leave-schema";
import { addDaysIso, isWeekdayIso } from "@/lib/weekly-pacing";

/** Team-level leave block shown on the calendar (synced from S3 `teamLeaves`). */
export type LeaveCalendarEvent = {
  id: string;
  teamEventId: string;
  startDate: string;
  endDate: string;
  /** Team name or "All teams". */
  label: string;
  /** Location (e.g. Pune, Lahore). */
  location: string;
  team: string;
  leaveType: string;
  days: number;
  note?: string;
};

export type LeaveEventTiming = "upcoming" | "active" | "past";

export type LeaveCalendarDay = {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  events: LeaveCalendarEvent[];
};

export function leaveEventTiming(
  startDate: string,
  endDate: string,
  todayIso: string,
): LeaveEventTiming {
  if (endDate < todayIso) return "past";
  if (startDate > todayIso) return "upcoming";
  return "active";
}

export function timingLabel(timing: LeaveEventTiming): string {
  switch (timing) {
    case "upcoming":
      return "Upcoming";
    case "active":
      return "Active";
    case "past":
      return "Past";
  }
}

export function monthLabel(yearMonth: string): string {
  const [y, mo] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [y, mo] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, mo] = yearMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(last).padStart(2, "0")}`,
  };
}

export function eventsOnDay(events: LeaveCalendarEvent[], iso: string): LeaveCalendarEvent[] {
  return events.filter((e) => e.startDate <= iso && e.endDate >= iso);
}

/** Build calendar events from S3 team leave records only (same source as Leave → Employees UI). */
export function buildTeamLeaveCalendarEvents(teamLeaves: TeamLeaveEvent[]): LeaveCalendarEvent[] {
  return teamLeaves
    .map((tl) => ({
      id: `team-${tl.id}`,
      teamEventId: tl.id,
      startDate: tl.startDate,
      endDate: tl.endDate,
      label: formatTeamLeaveLabel(tl.team),
      location: tl.location,
      team: tl.team,
      leaveType: leaveTypeLabel(tl.leaveType),
      days: tl.days,
      note: tl.note,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.location.localeCompare(b.location));
}

/** Monday-start month grid — uses full event list so past/upcoming team leave always renders on the right days. */
export function buildMonthCalendarGrid(
  yearMonth: string,
  events: LeaveCalendarEvent[],
  todayIso: string,
): LeaveCalendarDay[][] {
  const [y, mo] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const firstIso = `${yearMonth}-01`;
  const firstDow = new Date(`${firstIso}T12:00:00Z`).getUTCDay();
  const padStart = firstDow === 0 ? 6 : firstDow - 1;

  const cells: LeaveCalendarDay[] = [];

  for (let i = padStart; i > 0; i--) {
    const iso = addDaysIso(firstIso, -i);
    cells.push({
      iso,
      inMonth: false,
      isToday: iso === todayIso,
      isWeekend: !isWeekdayIso(iso),
      events: eventsOnDay(events, iso),
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${yearMonth}-${String(day).padStart(2, "0")}`;
    cells.push({
      iso,
      inMonth: true,
      isToday: iso === todayIso,
      isWeekend: !isWeekdayIso(iso),
      events: eventsOnDay(events, iso),
    });
  }

  while (cells.length % 7 !== 0) {
    const lastIso = cells[cells.length - 1]!.iso;
    const iso = addDaysIso(lastIso, 1);
    cells.push({
      iso,
      inMonth: false,
      isToday: iso === todayIso,
      isWeekend: !isWeekdayIso(iso),
      events: eventsOnDay(events, iso),
    });
  }

  const weeks: LeaveCalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function listTeamLeaveByTiming(
  events: LeaveCalendarEvent[],
  todayIso: string,
): Record<LeaveEventTiming, LeaveCalendarEvent[]> {
  const buckets: Record<LeaveEventTiming, LeaveCalendarEvent[]> = {
    upcoming: [],
    active: [],
    past: [],
  };
  for (const e of events) {
    buckets[leaveEventTiming(e.startDate, e.endDate, todayIso)].push(e);
  }
  buckets.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  buckets.active.sort((a, b) => a.startDate.localeCompare(b.startDate));
  buckets.past.sort((a, b) => b.startDate.localeCompare(a.startDate));
  return buckets;
}

/** Navigate calendar to the month containing a date. */
export function monthContaining(iso: string): string {
  return iso.slice(0, 7);
}
