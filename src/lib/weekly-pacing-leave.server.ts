import { emailLookupKeys } from "@/lib/cintara-email";
import { getLeaveFromS3 } from "@/lib/leave-s3.server";
import {
  countLeaveWorkdaysUnion,
  matchesTeamLocation,
  type EmployeeLeaveLedger,
  type LeaveDataFile,
  type TeamLeaveEvent,
} from "@/lib/leave-schema";
import { PACING_LEAVE_HOURS_PER_DAY } from "@/lib/weekly-pacing";

export { PACING_LEAVE_HOURS_PER_DAY };

export type LeaveDaysLookup = {
  byEmployeeId: Map<string, number>;
  byEmail: Map<string, number>;
};

export type PacingLeaveContext = {
  lookup: LeaveDaysLookup;
  teamLeaves: TeamLeaveEvent[];
  rangeStart: string;
  rangeEnd: string;
};

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function teamLeavesForEmployee(
  teamLeaves: TeamLeaveEvent[],
  location: string,
  team: string,
): TeamLeaveEvent[] {
  return teamLeaves.filter((tl) => matchesTeamLocation(location, team, tl.location, tl.team));
}

function leaveDaysForLedger(
  ledger: EmployeeLeaveLedger,
  teamLeaves: TeamLeaveEvent[],
  rangeStart: string,
  rangeEnd: string,
): number {
  const applicableTeam = teamLeavesForEmployee(teamLeaves, ledger.location, ledger.team);
  const ranges = [
    ...ledger.leaveEvents.map((e) => ({ startDate: e.startDate, endDate: e.endDate })),
    ...applicableTeam.map((e) => ({ startDate: e.startDate, endDate: e.endDate })),
  ];
  return countLeaveWorkdaysUnion(ranges, rangeStart, rangeEnd);
}

export function buildLeaveDaysLookup(
  employees: Record<string, EmployeeLeaveLedger>,
  rangeStart: string,
  rangeEnd: string,
  teamLeaves: TeamLeaveEvent[] = [],
): LeaveDaysLookup {
  const byEmployeeId = new Map<string, number>();
  const byEmail = new Map<string, number>();

  for (const ledger of Object.values(employees)) {
    const days = leaveDaysForLedger(ledger, teamLeaves, rangeStart, rangeEnd);
    if (days <= 0) continue;
    byEmployeeId.set(ledger.employeeId, days);
    for (const key of emailLookupKeys(ledger.officialEmail)) {
      byEmail.set(key, days);
    }
    const email = normEmail(ledger.officialEmail);
    if (email) byEmail.set(email, days);
  }

  return { byEmployeeId, byEmail };
}

export function resolveLeaveDaysForEmployee(
  ctx: PacingLeaveContext,
  args: {
    employeeId: string;
    email: string;
    team?: string | null;
    location?: string | null;
  },
): number {
  const fromId = ctx.lookup.byEmployeeId.get(args.employeeId);
  if (fromId != null) return fromId;
  for (const key of emailLookupKeys(args.email)) {
    const d = ctx.lookup.byEmail.get(key);
    if (d != null) return d;
  }
  const fromEmail = ctx.lookup.byEmail.get(normEmail(args.email));
  if (fromEmail != null) return fromEmail;

  const team = args.team?.trim() ?? "";
  const location = args.location?.trim() ?? "";
  if (!team && !location) return 0;

  const applicable = teamLeavesForEmployee(ctx.teamLeaves, location, team);
  return countLeaveWorkdaysUnion(applicable, ctx.rangeStart, ctx.rangeEnd);
}

export function pacingLeaveHoursCredit(leaveDays: number): number {
  return Math.round(leaveDays * PACING_LEAVE_HOURS_PER_DAY * 100) / 100;
}

export function buildPacingLeaveContext(
  file: LeaveDataFile | null,
  rangeStart: string,
  rangeEnd: string,
): PacingLeaveContext {
  const teamLeaves = file?.teamLeaves ?? [];
  const lookup = buildLeaveDaysLookup(file?.employees ?? {}, rangeStart, rangeEnd, teamLeaves);
  return { lookup, teamLeaves, rangeStart, rangeEnd };
}

export async function loadPacingLeaveContext(
  rangeStart: string,
  rangeEnd: string,
): Promise<PacingLeaveContext> {
  try {
    const { file } = await getLeaveFromS3();
    return buildPacingLeaveContext(file, rangeStart, rangeEnd);
  } catch {
    return buildPacingLeaveContext(null, rangeStart, rangeEnd);
  }
}

/** @deprecated Use loadPacingLeaveContext */
export async function loadLeaveDaysForPacingWeek(
  weekStart: string,
  weekEnd: string,
): Promise<LeaveDaysLookup> {
  const ctx = await loadPacingLeaveContext(weekStart, weekEnd);
  return ctx.lookup;
}

export async function loadLeaveDataFile(): Promise<LeaveDataFile | null> {
  try {
    const { file } = await getLeaveFromS3();
    return file;
  } catch {
    return null;
  }
}
