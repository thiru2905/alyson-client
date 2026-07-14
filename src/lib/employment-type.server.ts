import { getOnboardingFromS3 } from "@/lib/onboarding-s3.server";
import {
  buildEmploymentTypeLookup,
  type EmploymentTypeLookup,
} from "@/lib/employment-type";

let cached: { at: number; lookup: EmploymentTypeLookup } | null = null;
const CACHE_TTL_MS = 60_000;

/** Employment types from the onboarding S3 roster (email / name keyed). */
export async function loadEmploymentTypeLookup(force = false): Promise<EmploymentTypeLookup> {
  const now = Date.now();
  if (!force && cached && now - cached.at < CACHE_TTL_MS) return cached.lookup;

  const { rows } = await getOnboardingFromS3();
  const lookup = buildEmploymentTypeLookup(
    rows.map((r) => ({
      email: r["Official Email"] || r["Personal Email"] || "",
      name: r.Name || "",
      employmentType: r["Employment Type"] || "",
    })),
  );
  cached = { at: now, lookup };
  return lookup;
}
