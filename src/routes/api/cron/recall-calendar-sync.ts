import { createFileRoute } from "@tanstack/react-router";
import { assertDailyReportCronAuth } from "@/lib/resend-mail.server";
import {
  recallCalendarSyncCronEnabled,
} from "@/lib/recall/recall-calendar-sync-cron.server";
import { runUnifiedMeetingsBackgroundMaintenance } from "@/lib/unified-meetings-background.server";

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
    return Response.json({ ok: true, skipped: true, reason: "Recall calendar sync cron disabled" });
  }

  try {
    const result = await runUnifiedMeetingsBackgroundMaintenance();
    console.info("[cron/recall-calendar-sync]", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recall calendar sync cron failed";
    console.error("[cron/recall-calendar-sync]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
