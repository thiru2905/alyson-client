import { BUNDLED_ORG_CHART_ROSTER_CSV } from "@/lib/bundled-data";
import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";
import { ONBOARDING_COLUMNS, type OnboardingRow } from "@/lib/onboarding-schema";
import { isIndianWorkforce, isPayrollEligibleEmployee } from "@/lib/payroll-schema";
import { parseOrgChartRosterCsv } from "@/lib/org-chart-roster";

function emptyOnboardingRow(): OnboardingRow {
  const row = { _rowId: "" } as OnboardingRow;
  for (const col of ONBOARDING_COLUMNS) row[col] = "";
  return row;
}

function collectOnboardingEmailKeys(rows: OnboardingRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of emailLookupKeys(String(row["Official Email"] ?? ""))) {
      if (k.includes("@")) keys.add(k.toLowerCase());
    }
  }
  return keys;
}

function normPersonName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderOfficialEmail(email: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) return true;
  if (e === "no email found") return true;
  return /^user\d+@(?:revcloud\.com|cintara\.ai)$/.test(e);
}

function findOnboardingRowByName(rows: OnboardingRow[], name: string): OnboardingRow | undefined {
  const target = normPersonName(name);
  if (!target) return undefined;
  return rows.find((r) => normPersonName(String(r.Name ?? "")) === target);
}

function employeeIdForEmail(email: string): string {
  const local = email.split("@")[0]?.replace(/\./g, "_") ?? "employee";
  return `cint_${local}_cintara_ai`;
}

/**
 * Payroll reads onboarding S3; some India/Pune employees exist on org chart only.
 * Append missing Indian workforce rows so they appear on the India pay cycle board.
 */
export function mergePayrollRosterWithOrgChart(onboardingRows: OnboardingRow[]): OnboardingRow[] {
  const merged = [...onboardingRows];
  const seen = collectOnboardingEmailKeys(merged);
  const supplemental: OnboardingRow[] = [];

  for (const entry of parseOrgChartRosterCsv(BUNDLED_ORG_CHART_ROSTER_CSV)) {
    if (!isIndianWorkforce(entry.team, entry.location)) continue;

    const email = canonicalOfficialEmail(entry.email);
    if (!email) continue;

    const preview = emptyOnboardingRow();
    preview.Name = entry.name;
    preview["Official Email"] = email;
    if (!isPayrollEligibleEmployee(preview)) continue;

    const alreadyListed = emailLookupKeys(email).some(
      (k) => k.includes("@") && seen.has(k.toLowerCase()),
    );
    if (alreadyListed) continue;

    const existingByName = findOnboardingRowByName(merged, entry.name);
    if (existingByName) {
      const existingEmail = String(existingByName["Official Email"] ?? "");
      if (isPlaceholderOfficialEmail(existingEmail)) {
        existingByName["Official Email"] = email;
        for (const k of emailLookupKeys(email)) {
          if (k.includes("@")) seen.add(k.toLowerCase());
        }
      }
      continue;
    }

    for (const k of emailLookupKeys(email)) {
      if (k.includes("@")) seen.add(k.toLowerCase());
    }

    const row = emptyOnboardingRow();
    const employeeId = employeeIdForEmail(email);
    row._rowId = employeeId;
    row["Employee ID"] = employeeId;
    row.Name = entry.name;
    row.Location = entry.location;
    row["Personal Email"] = entry.personalEmail ?? "";
    row["Official Email"] = email;
    row.Team = entry.team;
    row.Manager = entry.managerLabel;
    row["Employment Status"] = "Active";
    supplemental.push(row);
  }

  if (!supplemental.length) return merged;
  return [...merged, ...supplemental];
}
