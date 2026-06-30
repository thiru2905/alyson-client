import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  formatTimeDoctorAuthError,
  TIME_DOCTOR_AUTH_ERROR_PREFIX,
  TIME_DOCTOR_REAUTH_MESSAGE,
} from "@/lib/time-doctor-auth-errors";

export type TimeDoctorOAuthTokens = {
  version: 1;
  accessToken: string;
  refreshToken: string;
  /** Unix ms when access token is no longer valid. */
  expiresAtMs: number;
  updatedAt: string;
  lastRefreshAt?: string;
};

const TOKEN_FILE_VERSION = 1 as const;
const EXPIRY_SKEW_MS = 5 * 60 * 1000;
/** Refresh proactively when access token is within this window of expiry. */
export const TIME_DOCTOR_PROACTIVE_REFRESH_INTERVAL_MS = 4 * 24 * 60 * 60 * 1000;

export const TIME_DOCTOR_TOKENS_S3_BUCKET =
  process.env.TIME_DOCTOR_TOKENS_S3_BUCKET?.trim() || "alyson-hr-orgchart";
export const TIME_DOCTOR_TOKENS_S3_KEY =
  process.env.TIME_DOCTOR_TOKENS_S3_KEY?.trim() || "integrations/time-doctor/oauth-tokens.json";

const LOCAL_TOKEN_FILE =
  process.env.TIME_DOCTOR_TOKENS_FILE?.trim() ||
  path.join(process.cwd(), ".time-doctor-oauth-tokens.json");

export class TimeDoctorAuthError extends Error {
  readonly code = "TIME_DOCTOR_AUTH_EXPIRED" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TimeDoctorAuthError";
  }
}

type TimeDoctorOAuthEnv = {
  API_BASE_URL: string;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  API_REFRESH_TOKEN: string;
  API_ACCESS_TOKEN: string;
};

let memoryTokens: TimeDoctorOAuthTokens | null = null;
let refreshInFlight: Promise<string> | null = null;

function requireEnv(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function optionalEnvAlias(primary: string, aliases: string[]): string | null {
  const v = process.env[primary]?.trim() || aliases.map((a) => process.env[a]?.trim()).find(Boolean);
  return v || null;
}

function s3Configured(): boolean {
  return Boolean(
    optionalEnvAlias("AWS_REGION", ["S3_REGION"]) &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

function s3Client(): S3Client {
  const region = optionalEnvAlias("AWS_REGION", ["S3_REGION"]);
  if (!region) throw new Error("Missing AWS_REGION (required for S3)");
  return new S3Client({
    region,
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

async function streamToString(stream: unknown): Promise<string> {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function parseExpiresAtFromEnv(): number | null {
  const raw = process.env.API_ACCESS_TOKEN_EXPIRES_AT?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n > 1e12 ? n : n * 1000;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

export function timeDoctorOAuthEnv(): TimeDoctorOAuthEnv & { API_BASE_URL: string } {
  const API_BASE_URL = (process.env.API_BASE_URL ?? "").trim();
  const API_ACCESS_TOKEN = (process.env.API_ACCESS_TOKEN ?? "").trim();
  const API_REFRESH_TOKEN = (process.env.API_REFRESH_TOKEN ?? "").trim();
  const OAUTH_CLIENT_ID = (process.env.OAUTH_CLIENT_ID ?? "").trim();
  const OAUTH_CLIENT_SECRET = (process.env.OAUTH_CLIENT_SECRET ?? "").trim();

  if (!API_BASE_URL) {
    throw new Error("Missing env API_BASE_URL (e.g. https://webapi.timedoctor.com/v1.1).");
  }

  const canRefresh = !!API_REFRESH_TOKEN && !!OAUTH_CLIENT_ID && !!OAUTH_CLIENT_SECRET;
  if (!API_ACCESS_TOKEN && !canRefresh) {
    throw new Error(
      "Missing env API_ACCESS_TOKEN. Provide an access token or configure refresh (API_REFRESH_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET).",
    );
  }

  return {
    API_BASE_URL,
    API_ACCESS_TOKEN,
    API_REFRESH_TOKEN,
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
  };
}

export function canConfigureTimeDoctorRefresh(): boolean {
  try {
    const env = timeDoctorOAuthEnv();
    return !!(env.API_REFRESH_TOKEN && env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET);
  } catch {
    return false;
  }
}

function normalizeStoredTokens(raw: unknown): TimeDoctorOAuthTokens | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const accessToken = String(o.accessToken ?? o.access_token ?? "").trim();
  const refreshToken = String(o.refreshToken ?? o.refresh_token ?? "").trim();
  const expiresAtMs = Number(o.expiresAtMs ?? o.expires_at_ms ?? 0);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return null;
  }
  return {
    version: TOKEN_FILE_VERSION,
    accessToken,
    refreshToken,
    expiresAtMs,
    updatedAt: String(o.updatedAt ?? o.updated_at ?? new Date().toISOString()),
    lastRefreshAt: o.lastRefreshAt ? String(o.lastRefreshAt) : undefined,
  };
}

function seedTokensFromEnv(): TimeDoctorOAuthTokens | null {
  const env = timeDoctorOAuthEnv();
  const refreshToken = env.API_REFRESH_TOKEN;
  const accessToken = env.API_ACCESS_TOKEN;
  if (!refreshToken && !accessToken) return null;

  const now = new Date().toISOString();
  const expiresAtMs =
    parseExpiresAtFromEnv() ??
    (accessToken ? Date.now() + 432_000 * 1000 : Date.now() + EXPIRY_SKEW_MS);

  return {
    version: TOKEN_FILE_VERSION,
    accessToken: accessToken || "",
    refreshToken: refreshToken || "",
    expiresAtMs,
    updatedAt: now,
    // Env seed is treated as freshly issued — avoids immediate proactive refresh attempts.
    lastRefreshAt: now,
  };
}

async function readTokensFromS3(): Promise<TimeDoctorOAuthTokens | null> {
  if (!s3Configured()) return null;
  try {
    const res = await s3Client().send(
      new GetObjectCommand({
        Bucket: TIME_DOCTOR_TOKENS_S3_BUCKET,
        Key: TIME_DOCTOR_TOKENS_S3_KEY,
      }),
    );
    if (!res.Body) return null;
    const text = await streamToString(res.Body);
    return normalizeStoredTokens(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeTokensToS3(tokens: TimeDoctorOAuthTokens): Promise<void> {
  if (!s3Configured()) return;
  await s3Client().send(
    new PutObjectCommand({
      Bucket: TIME_DOCTOR_TOKENS_S3_BUCKET,
      Key: TIME_DOCTOR_TOKENS_S3_KEY,
      Body: JSON.stringify(tokens, null, 2),
      ContentType: "application/json",
    }),
  );
}

async function readTokensFromLocalFile(): Promise<TimeDoctorOAuthTokens | null> {
  try {
    const text = await fs.readFile(LOCAL_TOKEN_FILE, "utf8");
    return normalizeStoredTokens(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeTokensToLocalFile(tokens: TimeDoctorOAuthTokens): Promise<void> {
  await fs.writeFile(LOCAL_TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
}

export async function readStoredTimeDoctorTokens(): Promise<TimeDoctorOAuthTokens | null> {
  if (memoryTokens) return memoryTokens;

  const fromS3 = await readTokensFromS3();
  if (fromS3) {
    memoryTokens = migrateStoredTokens(fromS3);
    return memoryTokens;
  }

  const fromFile = await readTokensFromLocalFile();
  if (fromFile) {
    memoryTokens = migrateStoredTokens(fromFile);
    return memoryTokens;
  }

  const seeded = seedTokensFromEnv();
  if (seeded) {
    memoryTokens = seeded;
    await persistTimeDoctorTokens(seeded);
  }
  return seeded;
}

export async function persistTimeDoctorTokens(tokens: TimeDoctorOAuthTokens): Promise<void> {
  memoryTokens = tokens;
  const writes: Promise<void>[] = [];
  if (s3Configured()) writes.push(writeTokensToS3(tokens));
  writes.push(writeTokensToLocalFile(tokens).catch(() => undefined));
  await Promise.all(writes);
}

function tokenEndpointFromBaseUrl(baseUrl: string): string {
  const u = new URL(baseUrl);
  return `${u.origin}/oauth/v2/token`;
}

function isAccessTokenValid(tokens: TimeDoctorOAuthTokens, skewMs = EXPIRY_SKEW_MS): boolean {
  return Boolean(tokens.accessToken) && tokens.expiresAtMs > Date.now() + skewMs;
}

function migrateStoredTokens(tokens: TimeDoctorOAuthTokens): TimeDoctorOAuthTokens {
  if (tokens.lastRefreshAt) return tokens;
  return { ...tokens, lastRefreshAt: tokens.updatedAt || new Date().toISOString() };
}

async function exchangeRefreshToken(refreshToken: string): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const env = timeDoctorOAuthEnv();
  const tokenUrl = tokenEndpointFromBaseUrl(env.API_BASE_URL);
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("client_id", env.OAUTH_CLIENT_ID);
  params.set("client_secret", env.OAUTH_CLIENT_SECRET);
  params.set("refresh_token", refreshToken);

  const headers = {
    Accept: "application/json",
    "User-Agent": "alyson-hr/1.0",
  };

  // Time Doctor v1.1 docs use query-string GET for token refresh.
  const getUrl = new URL(tokenUrl);
  for (const [k, v] of params.entries()) getUrl.searchParams.set(k, v);
  let res = await fetch(getUrl.toString(), { method: "GET", headers, cache: "no-store" });
  let text = await res.text().catch(() => "");

  if (!res.ok) {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      cache: "no-store",
    });
    text = await res.text().catch(() => "");
  }

  if (!res.ok) {
    console.error(`[time-doctor-oauth] refresh failed ${res.status}`);
    throw new TimeDoctorAuthError(formatTimeDoctorAuthError(text || res.statusText));
  }

  try {
    return JSON.parse(text) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
  } catch {
    throw new TimeDoctorAuthError(formatTimeDoctorAuthError("Non-JSON refresh response"));
  }
}

function tokensFromRefreshResponse(
  json: { access_token?: string; refresh_token?: string; expires_in?: number },
  previousRefreshToken: string,
): TimeDoctorOAuthTokens {
  const accessToken = (json.access_token ?? "").trim();
  if (!accessToken) throw new Error("OAuth refresh response missing access_token.");

  const refreshToken = (json.refresh_token ?? "").trim() || previousRefreshToken;
  const expiresIn =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
      ? json.expires_in
      : 432_000;
  const now = Date.now();

  return {
    version: TOKEN_FILE_VERSION,
    accessToken,
    refreshToken,
    expiresAtMs: now + Math.max(0, expiresIn) * 1000,
    updatedAt: new Date(now).toISOString(),
    lastRefreshAt: new Date(now).toISOString(),
  };
}

/** Exchange refresh token for a new access token and persist the result. */
export async function refreshTimeDoctorAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const env = timeDoctorOAuthEnv();
    if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET) {
      throw new TimeDoctorAuthError(formatTimeDoctorAuthError("Missing OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET"));
    }

    const stored = (await readStoredTimeDoctorTokens()) ?? seedTokensFromEnv();
    const refreshToken = stored?.refreshToken || env.API_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new TimeDoctorAuthError(formatTimeDoctorAuthError("Missing API_REFRESH_TOKEN"));
    }

    const json = await exchangeRefreshToken(refreshToken);
    const next = tokensFromRefreshResponse(json, refreshToken);
    await persistTimeDoctorTokens(next);
    return next.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** Returns a valid access token, refreshing when missing or near expiry. */
export async function getValidAccessToken(options?: {
  /** When true, never refresh — use stored/env access token only. */
  accessOnly?: boolean;
}): Promise<string> {
  const env = timeDoctorOAuthEnv();
  const stored = await readStoredTimeDoctorTokens();

  if (stored && isAccessTokenValid(stored)) {
    return stored.accessToken;
  }

  const canRefresh =
    !options?.accessOnly &&
    canConfigureTimeDoctorRefresh() &&
    Boolean(stored?.refreshToken || env.API_REFRESH_TOKEN);

  if (canRefresh) {
    try {
      return await refreshTimeDoctorAccessToken();
    } catch (e) {
      const fallback = stored?.accessToken || env.API_ACCESS_TOKEN;
      if (fallback && stored && stored.expiresAtMs > Date.now()) {
        return fallback;
      }
      throw e instanceof TimeDoctorAuthError ? e : new TimeDoctorAuthError(formatTimeDoctorAuthError(e));
    }
  }

  const fallback = stored?.accessToken || env.API_ACCESS_TOKEN;
  if (fallback) return fallback;

  throw new TimeDoctorAuthError(`${TIME_DOCTOR_AUTH_ERROR_PREFIX} ${TIME_DOCTOR_REAUTH_MESSAGE}`);
}

/** Cron helper: refresh if last refresh was more than 4 days ago or token expires within 24h. */
export async function proactiveRefreshTimeDoctorTokenIfDue(): Promise<{
  refreshed: boolean;
  reason: string;
}> {
  if (!canConfigureTimeDoctorRefresh()) {
    return { refreshed: false, reason: "refresh_not_configured" };
  }

  const stored = await readStoredTimeDoctorTokens();
  const now = Date.now();

  if (stored && isAccessTokenValid(stored, 24 * 60 * 60 * 1000)) {
    const lastRefreshMs = stored.lastRefreshAt ? Date.parse(stored.lastRefreshAt) : 0;
    const dueByAge =
      lastRefreshMs > 0 && now - lastRefreshMs >= TIME_DOCTOR_PROACTIVE_REFRESH_INTERVAL_MS;
    if (!dueByAge) {
      return { refreshed: false, reason: "not_due" };
    }
  }

  const lastRefreshMs = stored?.lastRefreshAt ? Date.parse(stored.lastRefreshAt) : 0;
  const dueByAge =
    lastRefreshMs > 0 && now - lastRefreshMs >= TIME_DOCTOR_PROACTIVE_REFRESH_INTERVAL_MS;
  const dueByExpiry =
    !stored?.expiresAtMs || stored.expiresAtMs <= now + 24 * 60 * 60 * 1000;

  if (!dueByAge && !dueByExpiry) {
    return { refreshed: false, reason: "not_due" };
  }

  try {
    await refreshTimeDoctorAccessToken();
    return { refreshed: true, reason: dueByAge ? "interval_elapsed" : "near_expiry" };
  } catch (e) {
    if (stored && isAccessTokenValid(stored, 0)) {
      return { refreshed: false, reason: "refresh_failed_access_still_valid" };
    }
    throw e;
  }
}
