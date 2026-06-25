import { emailLookupKeys } from "@/lib/cintara-email";
import { getLeaveFromS3 } from "@/lib/leave-s3.server";
import {
  countLeaveWorkdaysInRange,
  type EmployeeLeaveLedger,
  type LeaveDataFile,
} from "@/lib/leave-schema";
import { PACING_LEAVE_HOURS_PER_DAY } from "@/lib/weekly-pacing";

export { PACING_LEAVE_HOURS_PER_DAY };

export type LeaveDaysLookup = {
  byEmployeeId: Map<string, number>;
  byEmail: Map<string, number>;
};

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function buildLeaveDaysLookup(
  employees: Record<string, EmployeeLeaveLedger>,
  rangeStart: string,
  rangeEnd: string,
): LeaveDaysLookup {
  const byEmployeeId = new Map<string, number>();
  const byEmail = new Map<string, number>();

  for (const ledger of Object.values(employees)) {
    const days = countLeaveWorkdaysInRange(ledger.leaveEvents, rangeStart, rangeEnd);
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
  lookup: LeaveDaysLookup,
  args: { employeeId: string; email: string },
): number {
  const byId = lookup.byEmployeeId.get(args.employeeId);
  if (byId != null) return byId;
  for (const key of emailLookupKeys(args.email)) {
    const d = lookup.byEmail.get(key);
    if (d != null) return d;
  }
  return lookup.byEmail.get(normEmail(args.email)) ?? 0;
}

export function pacingLeaveHoursCredit(leaveDays: number): number {
  return Math.round(leaveDays * PACING_LEAVE_HOURS_PER_DAY * 100) / 100;
}

export async function loadLeaveDaysForPacingWeek(
  weekStart: string,
  weekEnd: string,
): Promise<LeaveDaysLookup> {
  try {
    const { file } = await getLeaveFromS3();
    return buildLeaveDaysLookup(file?.employees ?? {}, weekStart, weekEnd);
  } catch {
    return { byEmployeeId: new Map(), byEmail: new Map() };
  }
}

export async function loadLeaveDataFile(): Promise<LeaveDataFile | null> {
  try {
    const { file } = await getLeaveFromS3();
    return file;
  } catch {
    return null;
  }
}
