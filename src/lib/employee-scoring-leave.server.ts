import { emailLookupKeys } from "@/lib/cintara-email";
import type { EmployeeScoreInput } from "@/lib/employee-scoring-rules";
import {
  loadPacingLeaveContext,
  pacingLeaveHoursCredit,
  type PacingLeaveContext,
} from "@/lib/weekly-pacing-leave.server";

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function leaveDaysForEmail(ctx: PacingLeaveContext, email: string): number {
  for (const key of emailLookupKeys(email)) {
    const d = ctx.lookup.byEmail.get(key);
    if (d != null && d > 0) return d;
  }
  return ctx.lookup.byEmail.get(normalizeEmail(email)) ?? 0;
}

/** Apply +7h per approved leave workday to scored work hours (matches pacing). */
export function applyLeaveCreditToScoreInputs(
  inputs: EmployeeScoreInput[],
  ctx: PacingLeaveContext,
): EmployeeScoreInput[] {
  return inputs.map((row) => {
    const emails = [row.userEmail, ...(row.linkedEmails ?? [])];
    let leaveDays = 0;
    for (const e of emails) {
      leaveDays = Math.max(leaveDays, leaveDaysForEmail(ctx, e));
    }

    const leaveHoursCredit = pacingLeaveHoursCredit(leaveDays);
    const workSecondsLogged = row.workSeconds;
    if (leaveHoursCredit <= 0) {
      return { ...row, workSecondsLogged, leaveDays: 0, leaveHoursCredit: 0 };
    }

    return {
      ...row,
      workSecondsLogged,
      leaveDays,
      leaveHoursCredit,
      workSeconds: workSecondsLogged + Math.round(leaveHoursCredit * 3600),
    };
  });
}

export async function loadLeaveContextForScoring(rangeStart: string, rangeEnd: string) {
  return loadPacingLeaveContext(rangeStart, rangeEnd);
}
