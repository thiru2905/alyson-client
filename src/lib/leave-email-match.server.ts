import { canonicalOfficialEmail } from "@/lib/cintara-email";
import type { EmployeePickerEntry } from "@/lib/employee-picker-types";
import { loadEmployeePickerDirectory } from "@/lib/employee-picker-directory.server";
import type { LeaveEmailExtraction } from "@/lib/leave-email-schema";
import type { EmployeeLeaveLedger } from "@/lib/leave-schema";
import {
  looksLikeEmail,
  resolveCanonicalEmail,
  resolveRosterPersonEmail,
} from "@/lib/speaker-identity";
import { getSpeakerIdentityIndex } from "@/lib/speaker-identity.server";

export type LeaveEmailEmployeeMatch = {
  employeeId: string;
  employeeName: string;
  officialEmail: string;
  matchedBy: "email" | "name" | "none";
};

function matchByEmail(
  email: string,
  employees: Record<string, EmployeeLeaveLedger>,
): LeaveEmailEmployeeMatch | null {
  const key = canonicalOfficialEmail(email).toLowerCase();
  for (const ledger of Object.values(employees)) {
    if (canonicalOfficialEmail(ledger.officialEmail).toLowerCase() === key) {
      return {
        employeeId: ledger.employeeId,
        employeeName: ledger.employeeName,
        officialEmail: ledger.officialEmail,
        matchedBy: "email",
      };
    }
  }
  return null;
}

function matchByName(
  name: string,
  roster: EmployeePickerEntry[],
  identity: Awaited<ReturnType<typeof getSpeakerIdentityIndex>>["index"],
  employees: Record<string, EmployeeLeaveLedger>,
): LeaveEmailEmployeeMatch | null {
  const { email } = resolveRosterPersonEmail(name, identity, roster);
  if (!email) return null;
  return matchByEmail(email, employees);
}

export async function matchLeaveEmailToEmployee(args: {
  extraction: LeaveEmailExtraction;
  fromEmail: string;
  fromName?: string;
  employees: Record<string, EmployeeLeaveLedger>;
}): Promise<LeaveEmailEmployeeMatch | null> {
  const { extraction, fromEmail, fromName, employees } = args;
  const [{ index: identity }, roster] = await Promise.all([
    getSpeakerIdentityIndex(),
    loadEmployeePickerDirectory(),
  ]);

  const candidateEmails: string[] = [];
  if (extraction.employee.email && looksLikeEmail(extraction.employee.email)) {
    candidateEmails.push(extraction.employee.email);
  }
  if (looksLikeEmail(fromEmail)) candidateEmails.push(fromEmail);

  for (const email of candidateEmails) {
    const hit = matchByEmail(email, employees);
    if (hit) {
      const ledger = employees[hit.employeeId];
      if (ledger) return { ...hit, employeeId: ledger.employeeId, employeeName: ledger.employeeName };
    }
  }

  const name = extraction.employee.name?.trim();
  if (name) {
    const hit = matchByName(name, roster.employees, identity, employees);
    if (hit) return hit;
  }

  if (fromName?.trim()) {
    const hit = matchByName(fromName.trim(), roster.employees, identity, employees);
    if (hit) return hit;
  }

  return null;
}

/** True when this employee already has leave overlapping the requested range (manual or prior email). */
export function findOverlappingLeaveEvent(
  ledger: EmployeeLeaveLedger,
  startDate: string,
  endDate: string,
): { id: string; startDate: string; endDate: string; days: number } | null {
  const hit = ledger.leaveEvents.find((e) => e.startDate <= endDate && e.endDate >= startDate);
  return hit ? { id: hit.id, startDate: hit.startDate, endDate: hit.endDate, days: hit.days } : null;
}

/** @deprecated Prefer {@link findOverlappingLeaveEvent} — kept for exact triple-match callers. */
export function findDuplicateLeaveEvent(
  ledger: EmployeeLeaveLedger,
  startDate: string,
  endDate: string,
  days: number,
): boolean {
  const overlap = findOverlappingLeaveEvent(ledger, startDate, endDate);
  if (overlap) return true;
  return ledger.leaveEvents.some(
    (e) => e.startDate === startDate && e.endDate === endDate && e.days === days,
  );
}
