import { canonicalOfficialEmail } from "@/lib/cintara-email";
import {
  attachManagerToPacingRow,
  findRosterEntry,
  resolveManagerForEmployeeEmail,
  type OrgChartRosterEntry,
  type OrgChartRosterLookup,
} from "@/lib/org-chart-roster";

export type ManagerDirectReport = {
  email: string;
  name: string;
  team: string | null;
  location: string | null;
};

export type ManagerTeam = {
  managerEmail: string;
  managerName: string;
  directReports: ManagerDirectReport[];
};

function officialEmailKey(email: string): string | null {
  return canonicalOfficialEmail(email)?.trim().toLowerCase() || null;
}

/** Unique roster entries by official email (skips personal-email alias rows). */
export function listUniqueRosterEntries(lookup: OrgChartRosterLookup): OrgChartRosterEntry[] {
  const seen = new Set<string>();
  const out: OrgChartRosterEntry[] = [];
  for (const entry of lookup.byEmail.values()) {
    const official = officialEmailKey(entry.email);
    if (!official || seen.has(official)) continue;
    seen.add(official);
    out.push({ ...entry, email: official });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Managers and direct reports — same managerEmail rules as weekly pacing reports. */
export function buildManagerTeamIndex(lookup: OrgChartRosterLookup): Map<string, ManagerTeam> {
  const index = new Map<string, ManagerTeam>();

  for (const entry of listUniqueRosterEntries(lookup)) {
    const mgr = resolveManagerForEmployeeEmail(entry.email, lookup);
    const mgrEmail = mgr.managerEmail ? officialEmailKey(mgr.managerEmail) : null;
    if (!mgrEmail) continue;

    let team = index.get(mgrEmail);
    if (!team) {
      const mgrEntry = findRosterEntry(mgrEmail, lookup);
      team = {
        managerEmail: mgrEmail,
        managerName: mgr.managerName || mgrEntry?.name || mgrEmail,
        directReports: [],
      };
      index.set(mgrEmail, team);
    }

    team.directReports.push({
      email: entry.email,
      name: entry.name,
      team: entry.team?.trim() || null,
      location: entry.location?.trim() || null,
    });
  }

  for (const team of index.values()) {
    team.directReports.sort((a, b) => a.name.localeCompare(b.name));
  }

  return index;
}

export function getManagerTeamForEmail(
  email: string | null | undefined,
  lookup: OrgChartRosterLookup,
): ManagerTeam | null {
  const key = officialEmailKey(String(email || ""));
  if (!key) return null;
  return buildManagerTeamIndex(lookup).get(key) ?? null;
}

export function isManagerRosterEmail(
  email: string | null | undefined,
  lookup: OrgChartRosterLookup,
): boolean {
  const team = getManagerTeamForEmail(email, lookup);
  return Boolean(team && team.directReports.length > 0);
}

export function listManagerTeams(lookup: OrgChartRosterLookup): ManagerTeam[] {
  return [...buildManagerTeamIndex(lookup).values()].sort((a, b) =>
    a.managerName.localeCompare(b.managerName),
  );
}

/** Match Time Doctor / pacing row to manager scope (manager email or direct report). */
export function rowAllowedForManagerScope(
  row: { email: string; name?: string },
  managerEmail: string,
  lookup: OrgChartRosterLookup,
): boolean {
  const viewer = officialEmailKey(managerEmail);
  if (!viewer) return false;

  const employeeEmail = officialEmailKey(row.email);
  if (employeeEmail === viewer) return true;

  const attached = attachManagerToPacingRow(row, lookup);
  const rowManager = attached.managerEmail ? officialEmailKey(attached.managerEmail) : null;
  return rowManager === viewer;
}
