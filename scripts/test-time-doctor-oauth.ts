/**
 * Verify Time Doctor OAuth auto-refresh + API access.
 *
 * Usage:
 *   dotenv -e .env -- npx tsx scripts/test-time-doctor-oauth.ts
 *   dotenv -e .env -- npx tsx scripts/test-time-doctor-oauth.ts --force-refresh
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getValidAccessToken,
  readStoredTimeDoctorTokens,
  refreshTimeDoctorAccessToken,
  proactiveRefreshTimeDoctorTokenIfDue,
  TIME_DOCTOR_TOKENS_S3_KEY,
  TIME_DOCTOR_TOKENS_S3_BUCKET,
} from "../src/lib/time-doctor-token-manager.server";
import { TIME_DOCTOR_AUTH_ERROR_PREFIX } from "../src/lib/time-doctor-auth-errors";
import { timeDoctorPacingGetCompany } from "../src/lib/time-doctor-functions";

const LOCAL_TOKEN_FILE = path.join(process.cwd(), ".time-doctor-oauth-tokens.json");
const forceRefresh = process.argv.includes("--force-refresh");

function maskToken(token: string): string {
  if (!token) return "(empty)";
  if (token.length <= 12) return "***";
  return `${token.slice(0, 8)}…${token.slice(-4)} (${token.length} chars)`;
}

function fmtExpiry(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "unknown";
  const d = new Date(ms);
  const minsLeft = Math.round((ms - Date.now()) / 60_000);
  return `${d.toISOString()} (${minsLeft} min left)`;
}

async function main() {
  console.log("Time Doctor OAuth smoke test\n");

  const before = await readStoredTimeDoctorTokens();
  console.log("1) Stored tokens (before)");
  if (!before) {
    console.log("   No persisted file yet — will seed from .env on first refresh.\n");
  } else {
    console.log(`   access:  ${maskToken(before.accessToken)}`);
    console.log(`   refresh: ${maskToken(before.refreshToken)}`);
    console.log(`   expires: ${fmtExpiry(before.expiresAtMs)}`);
    console.log(`   updated: ${before.updatedAt}`);
    if (before.lastRefreshAt) console.log(`   lastRefresh: ${before.lastRefreshAt}`);
    console.log();
  }

  if (forceRefresh) {
    console.log("2) Forcing refreshAccessToken()…");
    await refreshTimeDoctorAccessToken();
    console.log("   OK — new tokens persisted.\n");
  } else {
    console.log("2) getValidAccessToken() (refreshes only if missing / expiring within 5 min)…");
    const token = await getValidAccessToken();
    console.log(`   OK — ${maskToken(token)}\n`);
  }

  const after = await readStoredTimeDoctorTokens();
  console.log("3) Stored tokens (after)");
  if (after) {
    console.log(`   access:  ${maskToken(after.accessToken)}`);
    console.log(`   expires: ${fmtExpiry(after.expiresAtMs)}`);
    const rotated = before && before.accessToken !== after.accessToken;
    console.log(`   access token rotated: ${rotated ? "yes" : "no (still valid)"}`);
  }
  console.log();

  console.log("4) Live API — GET /companies");
  const company = await timeDoctorPacingGetCompany();
  console.log(`   OK — company id=${company.id} name=${company.name}`);
  if (company.timeZoneLabel) console.log(`   timezone: ${company.timeZoneLabel}`);
  console.log();

  console.log("5) Proactive cron helper");
  try {
    const proactive = await proactiveRefreshTimeDoctorTokenIfDue();
    console.log(`   refreshed=${proactive.refreshed} reason=${proactive.reason}`);
  } catch (e) {
    console.log(`   WARN — proactive refresh failed (access token may still work until expiry)`);
    console.log(`   ${e instanceof Error ? e.message.replace(TIME_DOCTOR_AUTH_ERROR_PREFIX, "").trim() : e}`);
  }
  console.log();

  let localFile = false;
  try {
    await fs.access(LOCAL_TOKEN_FILE);
    localFile = true;
  } catch {
    /* no local file */
  }
  console.log("6) Persistence");
  console.log(`   local file: ${localFile ? LOCAL_TOKEN_FILE : "(none — S3 only or not persisted yet)"}`);
  console.log(`   S3 target:  s3://${TIME_DOCTOR_TOKENS_S3_BUCKET}/${TIME_DOCTOR_TOKENS_S3_KEY}`);
  console.log("\nAll checks passed.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("\nFAILED:", msg);
  if (forceRefresh && msg.includes("invalid_grant")) {
    console.error(
      "\nYour API_REFRESH_TOKEN is expired or revoked. Re-authorize in Time Doctor, then run:\n" +
        "  dotenv -e .env -- npx tsx scripts/td-oauth-exchange-code.ts <authorization_code>\n" +
        "See scripts/td-oauth-exchange-code.ts for the browser auth URL.",
    );
  }
  process.exit(1);
});
