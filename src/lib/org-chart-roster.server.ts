import {
  buildOrgChartRosterLookup,
  mergeOrgChartRosterEntries,
  parseOrgChartRosterCsv,
  type OrgChartRosterEntry,
  type OrgChartRosterLookup,
} from "@/lib/org-chart-roster";
import { BUNDLED_ONBOARDING_ROSTER_CSV, BUNDLED_ORG_CHART_ROSTER_CSV } from "@/lib/bundled-data";
import { canonicalOfficialEmail } from "@/lib/cintara-email";
import { parseOnboardingCsv } from "@/lib/onboarding-csv";

let cachedLookup: OrgChartRosterLookup | null = null;

function onboardingRowsToRosterEntries(): OrgChartRosterEntry[] {
  const entries: OrgChartRosterEntry[] = [];
  for (const row of parseOnboardingCsv(BUNDLED_ONBOARDING_ROSTER_CSV)) {
    const email = canonicalOfficialEmail(String(row["Official Email"] ?? ""));
    if (!email) continue;
    entries.push({
      name: String(row.Name ?? "").trim() || email.split("@")[0] || email,
      email,
      personalEmail: String(row["Personal Email"] ?? "").trim() || undefined,
      location: String(row.Location ?? "").trim(),
      team: String(row.Team ?? "").trim(),
      managerLabel: String(row.Manager ?? "").trim(),
    });
  }
  return entries;
}

export function getOrgChartRosterLookup(): OrgChartRosterLookup {
  if (cachedLookup) return cachedLookup;
  const orgChart = parseOrgChartRosterCsv(BUNDLED_ORG_CHART_ROSTER_CSV);
  const fromOnboarding = onboardingRowsToRosterEntries();
  const merged = mergeOrgChartRosterEntries(orgChart, fromOnboarding);
  cachedLookup = buildOrgChartRosterLookup(merged);
  return cachedLookup;
}
