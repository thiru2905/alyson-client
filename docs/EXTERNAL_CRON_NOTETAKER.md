# External scheduler for Notetaker transcript + notes auto-email
#
# Vercel Hobby only allows once-per-day native crons. Sub-daily schedules in
# vercel.json (e.g. */5) block production deploys entirely.
#
# For notes to generate + SES-send ~15m after meetings end, ping this every 5 min
# from cron-job.org / EasyCron / GitHub Actions / etc.:
#
#   POST https://alyson-client.vercel.app/api/cron/notetaker-transcripts
#   Authorization: Bearer <CRON_SECRET or NOTETAKER_TRANSCRIPT_CRON_SECRET>
#
# Optional every 2 min for bot activation:
#   POST https://alyson-client.vercel.app/api/cron/scheduled-bot-activation
#   Authorization: Bearer <CRON_SECRET>
