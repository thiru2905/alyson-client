import { resolveCintaraActiveForPacing, type CintaraActiveMemberLookup } from "@/lib/cintara-active-members";
import { getCintaraActiveMemberLookup } from "@/lib/cintara-active-members.server";
import type { EmployeeCompensationLedger } from "@/lib/bonus-schema";
import type { EmployeeLeaveLedger } from "@/lib/leave-schema";
import type { OrgChartRosterLookup } from "@/lib/org-chart-roster";
import { getOrgChartRosterLookup } from "@/lib/org-chart-roster.server";
import {
  findWeeklyPacingActiveOverride,
  readWeeklyPacingActiveOverridesFromS3,
  type WeeklyPacingActiveOverridesFile,
} from "@/lib/weekly-pacing-active-s3.server";

export type ResolvedPacingActive = {
  active: boolean;
  /** Value from domain roster / hardcoded rules before S3 override. */
  computedActive: boolean;
  /** True when an S3 override is applied. */
  activeOverridden: boolean;
};

export async function loadWeeklyPacingActiveOverridesForReport(): Promise<WeeklyPacingActiveOverridesFile> {
  return readWeeklyPacingActiveOverridesFromS3();
}

export function resolvePacingActiveWithOverrides(
  overrides: WeeklyPacingActiveOverridesFile,
  activeLookup: CintaraActiveMemberLookup,
  rosterLookup: OrgChartRosterLookup,
  args: { employeeId: string; email: string; name: string },
): ResolvedPacingActive {
  const computedActive = resolveCintaraActiveForPacing(activeLookup, rosterLookup, {
    email: args.email,
    name: args.name,
  });
  const override = findWeeklyPacingActiveOverride(overrides, {
    employeeId: args.employeeId,
    email: args.email,
  });
  if (!override) {
    return { active: computedActive, computedActive, activeOverridden: false };
  }
  return {
    active: override.active,
    computedActive,
    activeOverridden: true,
  };
}

/** Active flag for Leave (and other modules) — same rules as Weekly Pacing, including S3 overrides. */
export async function enrichLeaveLedgersWithPacingActive(
  employees: Record<string, EmployeeLeaveLedger>,
  timeDoctorUserIds: Set<string>,
): Promise<Record<string, EmployeeLeaveLedger>> {
  const overrides = await loadWeeklyPacingActiveOverridesForReport();
  const activeLookup = getCintaraActiveMemberLookup();
  const rosterLookup = getOrgChartRosterLookup();
  const next: Record<string, EmployeeLeaveLedger> = {};

  for (const [id, ledger] of Object.entries(employees)) {
    if (!timeDoctorUserIds.has(id)) {
      next[id] = { ...ledger, active: false };
      continue;
    }
    const resolved = resolvePacingActiveWithOverrides(overrides, activeLookup, rosterLookup, {
      employeeId: id,
      email: ledger.officialEmail,
      name: ledger.employeeName,
    });
    next[id] = { ...ledger, active: resolved.active };
  }

  return next;
}

/** Active flag for Bonus — same Weekly Pacing rules (domain roster + S3 overrides). */
export async function enrichBonusLedgersWithPacingActive(
  employees: Record<string, EmployeeCompensationLedger>,
  onboardingEmployeeIds: Set<string>,
): Promise<Record<string, EmployeeCompensationLedger>> {
  const overrides = await loadWeeklyPacingActiveOverridesForReport();
  const activeLookup = getCintaraActiveMemberLookup();
  const rosterLookup = getOrgChartRosterLookup();

  const { listTimeDoctorUsersLight } = await import("@/lib/time-doctor-functions");
  const tdUsers = await listTimeDoctorUsersLight().catch(() => []);
  const tdIdByEmail = new Map<string, string>();
  for (const u of tdUsers) {
    const email = String(u.email || "").trim().toLowerCase();
    if (email) tdIdByEmail.set(email, u.id);
  }

  const next: Record<string, EmployeeCompensationLedger> = {};

  for (const [id, ledger] of Object.entries(employees)) {
    if (!onboardingEmployeeIds.has(id)) {
      next[id] = { ...ledger, active: false };
      continue;
    }

    const emailKey = ledger.officialEmail.trim().toLowerCase();
    const pacingEmployeeId = (emailKey && tdIdByEmail.get(emailKey)) || id;
    const resolved = resolvePacingActiveWithOverrides(overrides, activeLookup, rosterLookup, {
      employeeId: pacingEmployeeId,
      email: ledger.officialEmail,
      name: ledger.employeeName,
    });
    next[id] = { ...ledger, active: resolved.active };
  }

  return next;
}
