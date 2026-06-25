import { resolveCintaraActiveForPacing, type CintaraActiveMemberLookup } from "@/lib/cintara-active-members";
import type { OrgChartRosterLookup } from "@/lib/org-chart-roster";
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
