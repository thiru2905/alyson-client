# Bot Join Report Module Documentation

## Purpose

Bot Join Report (`/alyson-notetaker/bot-join-report`) compares **eligible Google Calendar meetings** for a configured user against **Recall bot join records** to surface missed joins, late joins, and successful joins.

## Route

- **File:** `src/routes/alyson-notetaker/bot-join-report.tsx`

## Default Report User

`alysonclient@cintara.ai` (`DEFAULT_BOT_JOIN_REPORT_EMAIL` in `notetaker-bot-join-report.types.ts`)

## Server Functions

| Function | Purpose |
|----------|---------|
| `getBotJoinReport` | Build report for email + date range |

Implementation: `notetaker-bot-join-report.server.ts`

## Matching Logic (post-fix)

1. Load eligible meetings from **report user's Google Calendar** first
2. Collect bot candidates from:
   - Unified scheduled state (all rows matching eligible meetings)
   - Recall list API fallback (`listRecallBotsInJoinRange`)
3. Match bots by **meeting URL + start time** (not `calendarUserEmail`)
4. Join tolerance: up to 30 min before / 15 min after scheduled start
5. Report rows filtered to meetings on the report user's calendar only

## Status Values

| Status | Meaning |
|--------|---------|
| `joined` | Bot joined within tolerance |
| `missed` | No matching bot record |
| `late` | Bot joined after tolerance window |

## Caching

- 10-minute server cache per `(email, start, end)`

## Data Sources

- Google Calendar API (service account / delegated)
- Unified meetings scheduled state (Supabase)
- Recall.ai bot list API

## Access

All authenticated roles (Ops nav)

## File Map

| File | Role |
|------|------|
| `src/routes/alyson-notetaker/bot-join-report.tsx` | Page |
| `src/lib/notetaker-bot-join-report-functions.ts` | Server fn |
| `src/lib/notetaker-bot-join-report.server.ts` | Report builder |
| `src/lib/notetaker-bot-join-report.types.ts` | Types + defaults |
