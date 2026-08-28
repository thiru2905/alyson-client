# External scheduler for Notetaker + calendar auto-schedule

## Event-driven bot scheduling (primary)

For allowlisted calendars (alysonclient, mohita, arman, aditya, …) after **Connect Google Calendar**:

1. User creates/updates a meeting in Google Calendar
2. Google → Recall → `POST /api/recall/webhooks/calendar` (`calendar.sync_events`)
3. Alyson fetches only events changed since `last_updated_ts` and schedules Recall bots immediately

Cron is a **safety net**, not the main path. Webhook URL must be registered in the Recall dashboard
(shown on Unified Meetings).

## Cost save

Bots use Recall-direct create with **timed 48h** retention + 2-day media cleanup.

## Vercel Hobby: sub-daily crons

Hobby only allows once-per-day native crons. Sub-daily schedules in `vercel.json` block deploys.

Ping these every **5 minutes** from cron-job.org / EasyCron / GitHub Actions (same `CRON_SECRET`):

### 1. Transcripts + notes + calendar safety-net sync (recommended)

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

Each allowlisted person must **Connect Google Calendar** once on Unified Meetings (OAuth).
After that, new meetings schedule bots via webhook without clicking Sync.
