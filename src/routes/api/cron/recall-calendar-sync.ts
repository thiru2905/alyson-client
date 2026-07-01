import { createFileRoute } from "@tanstack/react-router";
import { assertDailyReportCronAuth } from "@/lib/resend-mail.server";
import {
  recallCalendarSyncCronEnabled,
  runRecallCalendarAutoSyncCron,
} from "@/lib/recall/recall-calendar-sync-cron.server";

export const Route = createFileRoute("/api/cron/recall-calendar-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => runCron(request),
      POST: async ({ request }) => runCron(request),
    },
  },
});

async function runCron(request: Request) {
  const authFail = assertDailyReportCronAuth(request);
  if (authFail) return authFail;

  if (!recallCalendarSyncCronEnabled()) {
    return Response.json({ ok: true, skipped: true, reason: "RECALL_CALENDAR_SYNC_CRON_ENABLED=false" });
  }

  try {
    const result = await runRecallCalendarAutoSyncCron();
    console.info("[cron/recall-calendar-sync]", JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recall calendar sync cron failed";
    console.error("[cron/recall-calendar-sync]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
