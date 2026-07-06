/**
 * Verify Time Doctor API access using API_ACCESS_TOKEN from .env only.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/test-time-doctor-oauth.ts
 */
import { getValidAccessToken } from "../src/lib/time-doctor-token-manager.server";
import { timeDoctorPacingGetCompany } from "../src/lib/time-doctor-functions";

function maskToken(token: string): string {
  if (!token) return "(empty)";
  if (token.length <= 12) return "***";
  return `${token.slice(0, 8)}…${token.slice(-4)} (${token.length} chars)`;
}

async function main() {
  console.log("Time Doctor access-token smoke test\n");

  console.log("1) API_ACCESS_TOKEN from .env");
  const token = await getValidAccessToken();
  console.log(`   OK — ${maskToken(token)}\n`);

  console.log("2) Live API — GET /companies");
  const company = await timeDoctorPacingGetCompany();
  console.log(`   OK — company id=${company.id} name=${company.name}`);
  if (company.timeZoneLabel) console.log(`   timezone: ${company.timeZoneLabel}`);
  console.log("\nAll checks passed.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("\nFAILED:", msg.replace(/TIME_DOCTOR_AUTH_EXPIRED:\s*/i, "").trim());
  console.error("\nUpdate API_ACCESS_TOKEN in .env (and Vercel if production).");
  process.exit(1);
});
