# External scheduler for Notetaker + calendar auto-schedule

## Completely consistent: list === schedule

Unified Meetings shows the **next 24 hours** for allowlisted calendars only
(`alysonclient`, `mohita`, `arman`, `aditya`, …).

Every Meet-link meeting in that list is auto-Scheduled via Google Workspace **DWD**
(no Calendar Connect required):

1. Cron (~5 min) — `scheduleAllowlistedUnifiedBots` (same scan as the UI)
2. Page load — same endpoint
3. Row **Schedule** — manual retry only

One bot per meeting instance (deduped by Meet URL + start).

## Optional: Connect Google Calendar

Faster webhook path only — not required for coverage.

## Vercel Hobby: sub-daily crons

```http
POST https://alyson-client.vercel.app/api/cron/notetaker-transcripts
Authorization: Bearer <CRON_SECRET>
```
