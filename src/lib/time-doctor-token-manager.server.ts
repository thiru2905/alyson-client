import {
  formatTimeDoctorAuthError,
  TIME_DOCTOR_AUTH_ERROR_PREFIX,
  TIME_DOCTOR_REAUTH_MESSAGE,
} from "@/lib/time-doctor-auth-errors";

export type TimeDoctorOAuthTokens = {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  updatedAt: string;
  lastRefreshAt?: string;
};

/** @deprecated Refresh flow disabled — kept for script/type compatibility. */
export const TIME_DOCTOR_PROACTIVE_REFRESH_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000;

/** @deprecated Refresh flow disabled — kept for script/type compatibility. */
export const TIME_DOCTOR_TOKENS_S3_BUCKET =
  process.env.TIME_DOCTOR_TOKENS_S3_BUCKET?.trim() || "alyson-hr-orgchart";

/** @deprecated Refresh flow disabled — kept for script/type compatibility. */
export const TIME_DOCTOR_TOKENS_S3_KEY =
  process.env.TIME_DOCTOR_TOKENS_S3_KEY?.trim() || "integrations/time-doctor/oauth-tokens.json";

export class TimeDoctorAuthError extends Error {
  readonly code = "TIME_DOCTOR_AUTH_EXPIRED" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TimeDoctorAuthError";
  }
}

type TimeDoctorOAuthEnv = {
  API_BASE_URL: string;
  API_ACCESS_TOKEN: string;
};

/**
 * Time Doctor auth: **access token only** from environment.
 * Set `API_ACCESS_TOKEN` in `.env` / Vercel when the token expires (~5 days).
 */
export function timeDoctorOAuthEnv(): TimeDoctorOAuthEnv {
  const API_BASE_URL = (process.env.API_BASE_URL ?? "").trim();
  const API_ACCESS_TOKEN = (process.env.API_ACCESS_TOKEN ?? "").trim();

  if (!API_BASE_URL) {
    throw new Error("Missing env API_BASE_URL (e.g. https://webapi.timedoctor.com/v1.1).");
  }
  if (!API_ACCESS_TOKEN) {
    throw new Error("Missing env API_ACCESS_TOKEN. Paste a current Time Doctor access token.");
  }

  return { API_BASE_URL, API_ACCESS_TOKEN };
}

/** Refresh-token flow is disabled — always false. */
export function canConfigureTimeDoctorRefresh(): boolean {
  return false;
}

/** Returns API_ACCESS_TOKEN from environment (no S3 cache, no refresh). */
export async function getValidAccessToken(_options?: {
  accessOnly?: boolean;
}): Promise<string> {
  const { API_ACCESS_TOKEN } = timeDoctorOAuthEnv();
  return API_ACCESS_TOKEN;
}

/** @deprecated Use a new API_ACCESS_TOKEN in env instead. */
export async function refreshTimeDoctorAccessToken(): Promise<string> {
  return getValidAccessToken();
}

/** @deprecated Refresh cron disabled — access token only. */
export async function proactiveRefreshTimeDoctorTokenIfDue(): Promise<{
  refreshed: boolean;
  reason: string;
}> {
  return { refreshed: false, reason: "access_token_only" };
}

/** @deprecated S3 token cache not used — returns null. */
export async function readStoredTimeDoctorTokens(): Promise<TimeDoctorOAuthTokens | null> {
  return null;
}

/** @deprecated S3 token cache not used — no-op. */
export async function persistTimeDoctorTokens(_tokens: TimeDoctorOAuthTokens): Promise<void> {
  // access-token-only mode
}

/** @deprecated S3 token cache not used. */
export async function reseedTimeDoctorTokensFromEnv(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new TimeDoctorAuthError(`${TIME_DOCTOR_AUTH_ERROR_PREFIX} ${TIME_DOCTOR_REAUTH_MESSAGE}`);
  }
  return token;
}

/*
 * =============================================================================
 * DISABLED: OAuth refresh-token + S3 persistence (not used — access token only)
 * =============================================================================
 *
 * Previously: read tokens from S3/local file, auto-refresh via API_REFRESH_TOKEN,
 * proactive cron every 4 days. Re-enable only if you want that complexity back.
 *
 * Required env was: API_REFRESH_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
 * API_ACCESS_TOKEN, API_ACCESS_TOKEN_EXPIRES_AT
 * Storage: s3://alyson-hr-orgchart/integrations/time-doctor/oauth-tokens.json
 *
 * --- exchangeRefreshToken(refreshToken) ---
 * POST/GET https://webapi.timedoctor.com/oauth/v2/token
 * grant_type=refresh_token, client_id, client_secret, refresh_token
 *
 * --- getValidAccessToken (old) ---
 * 1. Load from S3 / .time-doctor-oauth-tokens.json
 * 2. If expiring within 5 min → refreshTimeDoctorAccessToken()
 * 3. Fallback to env API_ACCESS_TOKEN
 *
 * --- proactiveRefreshTimeDoctorTokenIfDue (old) ---
 * Cron /api/cron/time-doctor-token daily — refresh if 4+ days or near expiry
 *
 * See git history on this file for full implementation.
 * =============================================================================
 */
