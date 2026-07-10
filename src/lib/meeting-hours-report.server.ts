import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import { calendarDayInTimeZone } from "@/lib/notetaker-meeting-title.server";
import {
  googleCalendarDwdConfigured,
  listCalendarEventsForUser,
  parseEligibleCalendarMeeting,
} from "@/lib/meeting-calendar-read.server";
import { enumerateDaysIso } from "@/lib/weekly-pacing";

const REPORT_TIME_ZONE = "Asia/Kolkata";
const SCAN_CONCURRENCY = 6;
const REPORT_CACHE_TTL_MS = 10 * 60_000;

export type MeetingHoursDayCell = {
  day: string;
  meetingCount: number;
  hours: number;
};

export type MeetingHoursEmployeeRow = {
  email: string;
  name: string;
  days: MeetingHoursDayCell[];
  totalMeetings: number;
  totalHours: number;
  /** Total meeting hours ÷ number of days in the selected range. */
  avgHoursPerDay: number;
};

export type MeetingHoursReport = {
  range: { start: string; end: string };
  days: string[];
  timeZone: string;
  employees: MeetingHoursEmployeeRow[];
  totals: {
    meetings: number;
    hours: number;
    avgHoursPerEmployee: number;
  };
  warnings: string[];
  generatedAt: string;
  calendarConfigured: boolean;
};

const reportCache = new Map<string, { at: number; report: MeetingHoursReport }>();

function cacheKey(start: string, end: string): string {
  return `${start}|${end}`;
}

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyDayMap(days: string[]): Map<string, MeetingHoursDayCell> {
  return new Map(days.map((day) => [day, { day, meetingCount: 0, hours: 0 }]));
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function isCintaraEmployeeEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@cintara.ai");
}

/** Per-user calendar auth failures (inactive / no mailbox) — skip silently in UI. */
function isExpectedCalendarAccessError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("invalid_grant") ||
    msg.includes("invalid email or user id") ||
    msg.includes("user not found") ||
    msg.includes("not authorized") ||
    msg.includes("account has been deleted") ||
    msg.includes("domain cannot use api") ||
    msg.includes("access denied")
  );
}

export async function buildMeetingHoursReport(args: {
  start: string;
  end: string;
  forceRefresh?: boolean;
}): Promise<MeetingHoursReport> {
  const start = args.start.trim();
  const end = args.end.trim();
  if (start > end) throw new Error("Start date must be on or before end date");

  const key = cacheKey(start, end);
  if (!args.forceRefresh) {
    const hit = reportCache.get(key);
    if (hit && Date.now() - hit.at < REPORT_CACHE_TTL_MS) return hit.report;
  }

  const days = enumerateDaysIso(start, end);
  const warnings: string[] = [];
  const calendarConfigured = googleCalendarDwdConfigured();

  if (!calendarConfigured) {
    return {
      range: { start, end },
      days,
      timeZone: REPORT_TIME_ZONE,
      employees: [],
      totals: { meetings: 0, hours: 0, avgHoursPerEmployee: 0 },
      warnings: [
        "Google Calendar domain-wide delegation is not configured — set GOOGLE_WORKSPACE_ADMIN_SUBJECT_EMAIL and service account credentials.",
      ],
      generatedAt: new Date().toISOString(),
      calendarConfigured: false,
    };
  }

  const directory = await loadEmployeePickerDirectory();
  const employees = directory.employees
    .filter((e) => isCintaraEmployeeEmail(e.email))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!employees.length) {
    warnings.push("No @cintara.ai employees found in the directory.");
  }

  const timeMin = `${start}T00:00:00.000Z`;
  const timeMax = `${end}T23:59:59.999Z`;

  const rows = await mapPool(employees, SCAN_CONCURRENCY, async (employee) => {
    const dayMap = emptyDayMap(days);
    let totalMeetings = 0;
    let totalHours = 0;

    try {
      const events = await listCalendarEventsForUser(employee.email, timeMin, timeMax);
      for (const event of events) {
        const meeting = parseEligibleCalendarMeeting(event);
        if (!meeting) continue;

        const day =
          calendarDayInTimeZone(meeting.startTime, REPORT_TIME_ZONE) ||
          meeting.startTime.slice(0, 10);
        if (!dayMap.has(day)) continue;

        const cell = dayMap.get(day)!;
        cell.meetingCount += 1;
        cell.hours = roundHours(cell.hours + meeting.durationHours);
        totalMeetings += 1;
        totalHours = roundHours(totalHours + meeting.durationHours);
      }
    } catch (e) {
      if (!isExpectedCalendarAccessError(e)) {
        warnings.push(`${employee.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const dayCells = days.map((day) => dayMap.get(day)!);
    return {
      email: employee.email,
      name: employee.name,
      days: dayCells,
      totalMeetings,
      totalHours,
      avgHoursPerDay: days.length ? roundHours(totalHours / days.length) : 0,
    } satisfies MeetingHoursEmployeeRow;
  });

  const activeRows = [...rows];
  activeRows.sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name));

  const totalMeetings = activeRows.reduce((s, r) => s + r.totalMeetings, 0);
  const totalHours = roundHours(activeRows.reduce((s, r) => s + r.totalHours, 0));
  const avgHoursPerEmployee =
    activeRows.length > 0 ? roundHours(totalHours / activeRows.length) : 0;

  const report: MeetingHoursReport = {
    range: { start, end },
    days,
    timeZone: REPORT_TIME_ZONE,
    employees: activeRows,
    totals: {
      meetings: totalMeetings,
      hours: totalHours,
      avgHoursPerEmployee,
    },
    warnings: warnings.slice(0, 12),
    generatedAt: new Date().toISOString(),
    calendarConfigured: true,
  };

  reportCache.set(key, { at: Date.now(), report });
  return report;
}
