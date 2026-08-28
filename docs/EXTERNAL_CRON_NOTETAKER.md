# External scheduler for Notetaker + calendar auto-schedule

## Always-Scheduled (no Schedule button required)

Allowlisted calendar owners (`alysonclient`, `mohita`, `arman`, `aditya`, …) stay in
**Scheduled** automatically:

1. **Unified Meetings page load** — auto-calls `POST /api/analytics/unified-meetings/schedule-bots`
2. **Cron safety net** (~5 min) — `scheduleAllowlistedUnifiedBots` inside notetaker-transcripts cron
3. **Recall Calendar webhooks** — if that mailbox is Connected, new Google events schedule immediately

Row **Schedule** is only a manual retry. Bots use Recall-direct create with **timed 48h** retention.

## Event-driven (Connect Google Calendar)

For allowlisted calendars after **Connect Google Calendar**:

1. User creates/updates a meeting in Google Calendar
2. Google → Recall → `POST /api/recall/webhooks/calendar` (`calendar.sync_events`)
3. Alyson schedules Recall bots immediately for the changed events

## Vercel Hobby: sub-daily crons

Hobby only allows once-per-day native crons. Sub-daily schedules in `vercel.json` block deploys.

Ping these every **5 minutes** from cron-job.org / EasyCron / GitHub Actions (same `CRON_SECRET`):

### 1. Transcripts + notes + allowlisted schedule (recommended)

```http
POST https://alyson-client.vercel.app/api/cron/notetaker-transcripts
Authorization: Bearer <CRON_SECRET>
```

### 2. Calendar sync only (optional)

```http
POST https://alyson-client.vercel.app/api/cron/recall-calendar-sync
Authorization: Bearer <CRON_SECRET>
```

### 3. Bot activation (optional, ~every 2 min)

```http
POST https://alyson-client.vercel.app/api/cron/scheduled-bot-activation
Authorization: Bearer <CRON_SECRET>
```

## One-time setup per person

Each allowlisted person should **Connect Google Calendar** once on Unified Meetings (OAuth) for
true event-driven scheduling. Even without Connect, DWD + allowlisted auto-schedule keeps bots
Scheduled for those mailboxes.
