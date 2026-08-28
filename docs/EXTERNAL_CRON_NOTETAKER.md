# External scheduler for Notetaker + calendar auto-schedule

## Always-Scheduled without Connect (primary)

Allowlisted calendar owners (`alysonclient`, `mohita`, `arman`, `aditya`, …) stay **Scheduled**
via **Google Workspace DWD** — each person does **not** need to Connect Google Calendar:

1. **Cron (~5 min)** — `scheduleAllowlistedUnifiedBots` reads those calendars with the service
   account and creates Recall bots (timed 48h retention)
2. **Unified Meetings page load** — same allowlisted schedule endpoint
3. Row **Schedule** is only a manual retry

## Optional: Connect Google Calendar (faster webhooks)

If a mailbox is Connected in Recall Calendar V2, new/updated Google events also fire
`calendar.sync_events` webhooks for near-instant scheduling. This is additive — not required.

## Vercel Hobby: sub-daily crons

Hobby only allows once-per-day native crons. Sub-daily schedules in `vercel.json` block deploys.

Ping every **5 minutes** (same `CRON_SECRET`):

```http
POST https://alyson-client.vercel.app/api/cron/notetaker-transcripts
Authorization: Bearer <CRON_SECRET>
```

Optional:

```http
POST https://alyson-client.vercel.app/api/cron/recall-calendar-sync
Authorization: Bearer <CRON_SECRET>

POST https://alyson-client.vercel.app/api/cron/scheduled-bot-activation
Authorization: Bearer <CRON_SECRET>
```
