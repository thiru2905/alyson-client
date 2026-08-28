# External scheduler for Notetaker + calendar auto-schedule

Vercel Hobby only allows once-per-day native crons. Sub-daily schedules in
`vercel.json` (e.g. `*/5`) block production deploys entirely.

Ping these every **5 minutes** from cron-job.org / EasyCron / GitHub Actions / etc.
Use the same secret as production `CRON_SECRET` (or `NOTETAKER_TRANSCRIPT_CRON_SECRET`).

## 1. Transcripts + notes auto-email + calendar bot schedule (recommended)

This one endpoint also runs Recall calendar auto-sync for allowlisted calendars
(`alysonclient`, `mohita`, `arman`, `aditya`, …) and media cleanup (2-day retention).

```http
POST https://alyson-client.vercel.app/api/cron/notetaker-transcripts
Authorization: Bearer <CRON_SECRET>
```

## 2. Calendar sync only (optional)

If you only need bot scheduling without the full transcript sweep:

```http
POST https://alyson-client.vercel.app/api/cron/recall-calendar-sync
Authorization: Bearer <CRON_SECRET>
```

## 3. Bot activation (optional, ~every 2 min)

```http
POST https://alyson-client.vercel.app/api/cron/scheduled-bot-activation
Authorization: Bearer <CRON_SECRET>
```

## Cost save (already in app)

Scheduled bots are created via Recall-direct with **timed 48h** recording retention
(commit `46462f6` / media cleanup `be3cbe9`). Do not re-enable Notetaker-first create
for scheduled bots — that left retention as `forever` and drove billable hour_hours.

## One-time setup per person

Each allowlisted person must **Connect Google Calendar** once on Unified Meetings
(OAuth). After that, webhooks + the 5‑min cron schedule bots without clicking Sync.
