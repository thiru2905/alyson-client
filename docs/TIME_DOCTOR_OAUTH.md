# Time Doctor OAuth 2.0 — automatic token refresh

Access tokens expire after **~5 days** (`expires_in` ≈ 432000). The app refreshes them automatically using your **refresh token** and persists the new tokens so Vercel cold starts do not require manual `.env` updates.

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `API_BASE_URL` | `https://webapi.timedoctor.com/v1.1` |
| `OAUTH_CLIENT_ID` | OAuth app client id |
| `OAUTH_CLIENT_SECRET` | OAuth app client secret |
| `API_REFRESH_TOKEN` | Long-lived refresh token (seed; may rotate after refresh) |
| `API_ACCESS_TOKEN` | Optional seed access token |
| `API_ACCESS_TOKEN_EXPIRES_AT` | Optional ISO date or unix ms for seed expiry |
| `TIME_DOCTOR_TIMEZONE` | Optional; default from company timezone |
| `TIME_DOCTOR_TOKENS_S3_BUCKET` / `TIME_DOCTOR_TOKENS_S3_KEY` | Optional S3 path for persisted tokens |

**Never commit tokens or client secrets to source control. Keep them in `.env` and Vercel env only — not in `env.production.example`.**

## How it works

Module: `src/lib/time-doctor-token-manager.server.ts`

1. **`getValidAccessToken()`** — used by every Time Doctor API call (`upstreamFetch` in `time-doctor-functions.ts`).
   - Loads tokens from persistent storage.
   - If access token is missing or expires within **5 minutes**, calls **`refreshTimeDoctorAccessToken()`**.
2. **`refreshTimeDoctorAccessToken()`** — `POST https://webapi.timedoctor.com/oauth/v2/token` with `application/x-www-form-urlencoded` body (`grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`).
   - On success: saves `access_token`, `refresh_token`, `expires_at` (from `expires_in`).
   - On failure: throws a user-safe error (no token values in logs).
3. **Persistent storage** (in order):
   - **Production:** S3 `s3://alyson-hr-orgchart/integrations/time-doctor/oauth-tokens.json` (override with `TIME_DOCTOR_TOKENS_S3_BUCKET` / `TIME_DOCTOR_TOKENS_S3_KEY`).
   - **Local dev:** `.time-doctor-oauth-tokens.json` (gitignored; override with `TIME_DOCTOR_TOKENS_FILE`).
   - **First boot:** seeds from env vars, then persists after the first refresh.

## Proactive refresh (cron)

Vercel cron: **`GET /api/cron/time-doctor-token`** daily at 04:00 UTC (`vercel.json`).

- Auth: `Authorization: Bearer $CRON_SECRET` (or `DAILY_REPORT_CRON_SECRET`).
- Refreshes when last refresh was **≥ 4 days** ago or access token expires within **24 hours**.

## UI errors

If refresh fails (revoked refresh token, network error), Time Dashboard and pacing pages show:

> **Session expired – please re-authenticate with Time Doctor (update the OAuth refresh token in environment settings).**

Re-issue OAuth tokens in Time Doctor and update **`API_REFRESH_TOKEN`** (and optional seed **`API_ACCESS_TOKEN`**) in Vercel / local `.env`. The next successful refresh updates S3 automatically.

## AWS permissions

The same `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` used for leave and org chart must allow `s3:GetObject` and `s3:PutObject` on the tokens key.

## Local development

1. Set `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `API_REFRESH_TOKEN` in `.env`.
2. Run the app; tokens are written to `.time-doctor-oauth-tokens.json`.
3. You do **not** need to paste a new access token every 5 days if refresh credentials stay valid.

## Note on serverless

In-memory cache avoids S3 reads on every API call within a warm instance. **S3 (or the local token file) is the source of truth** across deploys and cold starts—not `API_ACCESS_TOKEN` in Vercel env after the first refresh.
