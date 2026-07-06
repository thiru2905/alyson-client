import { createFileRoute } from "@tanstack/react-router";
import { assertNotetakerTranscriptCronAuth } from "@/lib/notetaker-cron-auth.server";
import { leaveEmailSyncEnabled } from "@/lib/leave-email-schema";
import { runLeaveEmailSync } from "@/lib/leave-email-sync.server";

export const Route = createFileRoute("/api/cron/leave-email-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => runCron(request),
      POST: async ({ request }) => runCron(request),
    },
  },
});

async function runCron(request: Request) {
  const authFail = assertNotetakerTranscriptCronAuth(request);
  if (authFail) return authFail;

  if (!leaveEmailSyncEnabled()) {
    return Response.json({ ok: true, enabled: false, skipped: true });
  }

  try {
    const result = await runLeaveEmailSync({ lookbackDays: 14, maxMessages: 40 });
    console.info("[cron/leave-email-sync]", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Leave email sync failed";
    console.error("[cron/leave-email-sync]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
