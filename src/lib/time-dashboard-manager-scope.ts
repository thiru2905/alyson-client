import { canonicalOfficialEmail } from "@/lib/cintara-email";
import { BUNDLED_ORG_CHART_ROSTER_CSV } from "@/lib/bundled-data";
import {
  getManagerTeamForEmail,
  rowAllowedForManagerScope,
  type ManagerTeam,
} from "@/lib/manager-access-roster";
import {
  buildOrgChartRosterLookup,
  parseOrgChartRosterCsv,
  type OrgChartRosterLookup,
} from "@/lib/org-chart-roster";
import type { TimeDashboardAccessResult } from "@/lib/time-dashboard-access.schema";

/** Dev/test: treat viewer email as another manager for Time Dashboard team scope only. */
export const TIME_DASHBOARD_MANAGER_TEST_ALIASES: Record<string, string> = {
  "mthirumalai2905@gmail.com": "aditya@cintara.ai",
};

const defaultRosterLookup = buildOrgChartRosterLookup(
  parseOrgChartRosterCsv(BUNDLED_ORG_CHART_ROSTER_CSV),
);

function viewerEmailKey(email: string | null | undefined): string | null {
  return (
    canonicalOfficialEmail(String(email || ""))?.trim().toLowerCase() ||
    String(email || "").trim().toLowerCase() ||
    null
  );
}

export function resolveTimeDashboardScopeManagerEmail(
  viewerEmail: string | null | undefined,
  testMode: boolean,
): string | null {
  const viewer = viewerEmailKey(viewerEmail);
  if (!viewer) return null;
  if (testMode && TIME_DASHBOARD_MANAGER_TEST_ALIASES[viewer]) {
    return viewerEmailKey(TIME_DASHBOARD_MANAGER_TEST_ALIASES[viewer]);
  }
  return viewer;
}

export function resolveTimeDashboardTeamScope(
  viewerEmail: string | null | undefined,
  testMode: boolean,
  lookup: OrgChartRosterLookup = defaultRosterLookup,
): { viewerEmail: string; managerEmail: string; team: ManagerTeam } | null {
  const viewer = viewerEmailKey(viewerEmail);
  if (!viewer) return null;

  const managerEmail = resolveTimeDashboardScopeManagerEmail(viewer, testMode);
  if (!managerEmail) return null;

  const team = getManagerTeamForEmail(managerEmail, lookup);
  if (!team || team.directReports.length === 0) return null;

  return { viewerEmail: viewer, managerEmail, team };
}

export function employeeVisibleToTimeDashboardViewer(
  row: { email: string; name?: string },
  access: TimeDashboardAccessResult | undefined,
  lookup: OrgChartRosterLookup = defaultRosterLookup,
): boolean {
  if (!access || access.level === "none") return false;
  if (access.level === "full") return true;
  const managerEmail = access.scopeManagerEmail ?? access.email;
  return rowAllowedForManagerScope(row, managerEmail, lookup);
}

export function filterRowsForTimeDashboardAccess<T extends { email: string; name?: string }>(
  rows: T[],
  access: TimeDashboardAccessResult | undefined,
  lookup: OrgChartRosterLookup = defaultRosterLookup,
): T[] {
  if (!access || access.level === "full") return rows;
  if (access.level === "none") return [];
  return rows.filter((row) => employeeVisibleToTimeDashboardViewer(row, access, lookup));
}

export function timeDashboardManagerEmailParam(
  access: TimeDashboardAccessResult | undefined,
): string | undefined {
  if (access?.level !== "team") return undefined;
  return access.scopeManagerEmail ?? access.email;
}
