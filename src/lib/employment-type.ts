import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";

/** Canonical employment types for Weekly / Monthly Pacing filters. */
export const EMPLOYMENT_TYPE_OPTIONS = [
  "Part-time",
  "Full-time",
  "Notice",
  "Contract",
  "Freelance",
  "PIP",
  "Trial",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPE_OPTIONS)[number];

const EMPLOYMENT_TYPE_ALIAS: Record<string, EmploymentType> = {
  "part-time": "Part-time",
  parttime: "Part-time",
  "part time": "Part-time",
  pt: "Part-time",
  "full-time": "Full-time",
  fulltime: "Full-time",
  "full time": "Full-time",
  ft: "Full-time",
  notice: "Notice",
  "notice period": "Notice",
  onnotice: "Notice",
  "on notice": "Notice",
  contract: "Contract",
  contractor: "Contract",
  contractual: "Contract",
  freelance: "Freelance",
  freelancer: "Freelance",
  pip: "PIP",
  "performance improvement plan": "PIP",
  trial: "Trial",
  probation: "Trial",
  "trial period": "Trial",
};

function normKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map free-text onboarding values onto the canonical employment-type list. */
export function normalizeEmploymentType(raw: string | null | undefined): EmploymentType | null {
  const key = normKey(raw ?? "");
  if (!key) return null;
  if (EMPLOYMENT_TYPE_ALIAS[key]) return EMPLOYMENT_TYPE_ALIAS[key]!;
  for (const opt of EMPLOYMENT_TYPE_OPTIONS) {
    if (normKey(opt) === key) return opt;
  }
  return null;
}

export function formatEmploymentTypeLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "Not set";
  return normalizeEmploymentType(value) ?? value.trim();
}

export type EmploymentTypeLookup = {
  byEmail: Map<string, EmploymentType>;
  byLocalPart: Map<string, EmploymentType>;
  byNormalizedName: Map<string, EmploymentType>;
};

export function buildEmploymentTypeLookup(
  rows: Array<{ email?: string; name?: string; employmentType?: string | null }>,
): EmploymentTypeLookup {
  const byEmail = new Map<string, EmploymentType>();
  const byLocalPart = new Map<string, EmploymentType>();
  const byNormalizedName = new Map<string, EmploymentType>();

  for (const row of rows) {
    const type = normalizeEmploymentType(row.employmentType);
    if (!type) continue;
    const email = String(row.email || "").trim();
    if (email) {
      for (const key of emailLookupKeys(canonicalOfficialEmail(email))) {
        if (key.includes("@")) byEmail.set(key, type);
        else byLocalPart.set(key, type);
      }
    }
    const nn = normName(row.name ?? "");
    if (nn) byNormalizedName.set(nn, type);
  }

  return { byEmail, byLocalPart, byNormalizedName };
}

export function resolveEmploymentType(
  email: string,
  name: string,
  lookup: EmploymentTypeLookup,
): EmploymentType | null {
  for (const key of emailLookupKeys(canonicalOfficialEmail(email))) {
    const hit = key.includes("@") ? lookup.byEmail.get(key) : lookup.byLocalPart.get(key);
    if (hit) return hit;
  }
  const nn = normName(name);
  if (nn) return lookup.byNormalizedName.get(nn) ?? null;
  return null;
}

export function attachEmploymentTypeToPacingRow<T extends { email: string; name?: string }>(
  row: T,
  lookup: EmploymentTypeLookup,
): T & { employmentType: EmploymentType | null } {
  return {
    ...row,
    employmentType: resolveEmploymentType(row.email, row.name ?? "", lookup),
  };
}
