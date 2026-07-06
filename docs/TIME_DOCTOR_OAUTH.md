# Time Doctor OAuth — access token only

Access tokens expire after **~5 days**. The app uses **`API_ACCESS_TOKEN`** from environment only (no auto-refresh, no S3 token cache).

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `API_BASE_URL` | `https://webapi.timedoctor.com/v1.1` |
| `API_ACCESS_TOKEN` | Current Time Doctor access token |

Optional (for obtaining a new token via browser OAuth once):

| Variable | Purpose |
|----------|---------|
| `OAUTH_CLIENT_ID` | OAuth app client id |
| `OAUTH_CLIENT_SECRET` | OAuth app client secret |
| `OAUTH_REDIRECT_URL` | Redirect URI registered with Time Doctor |
| `API_REFRESH_TOKEN` | **Not used by the app** — only needed when running `scripts/td-oauth-exchange-code.ts` |

## When the dashboard shows “Session expired”

1. Get a new access token from Time Doctor (OAuth exchange or Time Doctor admin).
2. Update **`API_ACCESS_TOKEN`** in `.env` and Vercel Production.
3. Redeploy / restart dev server.

```bash
npx dotenv-cli -e .env -- npx tsx scripts/test-time-doctor-oauth.ts
```

## OAuth exchange (one-time, to get a new access token)

```bash
npx dotenv-cli -e .env -- npx tsx scripts/td-oauth-exchange-code.ts <authorization_code>
```

Copy the printed `API_ACCESS_TOKEN` into `.env` and Vercel.

## Disabled (commented in code)

Auto-refresh via `API_REFRESH_TOKEN`, S3 `integrations/time-doctor/oauth-tokens.json`, and cron `/api/cron/time-doctor-token` are **not used**. See `src/lib/time-doctor-token-manager.server.ts`.
