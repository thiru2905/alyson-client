import { createFileRoute } from "@tanstack/react-router";
import { assertMeetingBotCronAuth } from "@/lib/meeting-bot-cron-auth.server";
import { runMeetingBotScheduleCron } from "@/lib/meeting-bot-schedule-cron.server";

export const Route = createFileRoute("/api/cron/meeting-bot-schedule")({
  server: {
    handlers: {
      GET: async ({ request }) => runCron(request),
      POST: async ({ request }) => runCron(request),
    },
  },
});

async function runCron(request: Request) {
  const authFail = assertMeetingBotCronAuth(request);
  if (authFail) return authFail;

  try {
    const result = await runMeetingBotScheduleCron();
    console.info("[cron/meeting-bot-schedule]", JSON.stringify(result));
    if (!result.ok) {
      return Response.json(result, { status: 500 });
    }
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Meeting bot schedule cron failed";
    console.error("[cron/meeting-bot-schedule]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
