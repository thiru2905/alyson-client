import { createFileRoute } from "@tanstack/react-router";
import { assertDailyReportCronAuth } from "@/lib/resend-mail.server";
import {
  activateDueScheduledBotSessions,
  scheduledBotActivationCronEnabled,
} from "@/lib/notetaker-scheduled-bot-activation.server";

export const Route = createFileRoute("/api/cron/scheduled-bot-activation")({
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

  if (!scheduledBotActivationCronEnabled()) {
    return Response.json({ ok: true, skipped: true, reason: "SCHEDULED_BOT_ACTIVATION_CRON_ENABLED=false" });
  }

  try {
    const result = await activateDueScheduledBotSessions();
    console.info("[cron/scheduled-bot-activation]", JSON.stringify(result));
    return Response.json({ ok: result.errors.length === 0, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scheduled bot activation cron failed";
    console.error("[cron/scheduled-bot-activation]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
