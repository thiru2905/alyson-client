/**
 * Exchange a Time Doctor OAuth authorization code for tokens.
 *
 * 1. Open in browser (use OAUTH_REDIRECT_URL from .env):
 *    https://webapi.timedoctor.com/oauth/v2/auth?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI
 * 2. After approve, copy `code` from the redirect URL.
 * 3. Run:
 *    dotenv -e .env -- npx tsx scripts/td-oauth-exchange-code.ts YOUR_CODE
 */
import {
  persistTimeDoctorTokens,
  type TimeDoctorOAuthTokens,
} from "../src/lib/time-doctor-token-manager.server";

const code = process.argv[2]?.trim();
if (!code) {
  console.error("Usage: dotenv -e .env -- npx tsx scripts/td-oauth-exchange-code.ts <authorization_code>");
  process.exit(1);
}

const clientId = process.env.OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.OAUTH_CLIENT_SECRET?.trim();
const redirectUri = process.env.OAUTH_REDIRECT_URL?.trim();
if (!clientId || !clientSecret || !redirectUri) {
  console.error("Missing OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, or OAUTH_REDIRECT_URL in .env");
  process.exit(1);
}

const u = new URL("https://webapi.timedoctor.com/oauth/v2/token");
u.searchParams.set("client_id", clientId);
u.searchParams.set("client_secret", clientSecret);
u.searchParams.set("grant_type", "authorization_code");
u.searchParams.set("redirect_uri", redirectUri);
u.searchParams.set("code", code);

const res = await fetch(u.toString(), {
  headers: { Accept: "application/json", "User-Agent": "alyson-hr/1.0" },
});
const text = await res.text();
if (!res.ok) {
  console.error("Exchange failed", res.status, text.slice(0, 500));
  process.exit(1);
}

const json = JSON.parse(text) as {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

const accessToken = (json.access_token ?? "").trim();
const refreshToken = (json.refresh_token ?? "").trim();
if (!accessToken || !refreshToken) {
  console.error("Response missing access_token or refresh_token");
  process.exit(1);
}

const expiresIn =
  typeof json.expires_in === "number" && Number.isFinite(json.expires_in) ? json.expires_in : 432_000;
const now = Date.now();
const tokens: TimeDoctorOAuthTokens = {
  version: 1,
  accessToken,
  refreshToken,
  expiresAtMs: now + expiresIn * 1000,
  updatedAt: new Date(now).toISOString(),
  lastRefreshAt: new Date(now).toISOString(),
};

await persistTimeDoctorTokens(tokens);

console.log("OK — tokens saved to .time-doctor-oauth-tokens.json (and S3 if configured).");
console.log("\nUpdate .env and Vercel with:");
console.log(`API_ACCESS_TOKEN=${accessToken}`);
console.log(`API_REFRESH_TOKEN=${refreshToken}`);
console.log(`API_ACCESS_TOKEN_EXPIRES_AT=${tokens.expiresAtMs}`);
