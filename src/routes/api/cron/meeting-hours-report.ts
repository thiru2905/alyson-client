import { createFileRoute } from "@tanstack/react-router";
import {
  assertMeetingHoursReportCronAuth,
  meetingHoursReportCronEnabled,
} from "@/lib/meeting-hours-cron-auth.server";
import { buildAndSendMeetingHoursReportEmail } from "@/lib/meeting-hours-email.server";

export const Route = createFileRoute("/api/cron/meeting-hours-report")({
  server: {
    handlers: {
      GET: async ({ request }) => runMeetingHoursReport(request),
      POST: async ({ request }) => runMeetingHoursReport(request),
    },
  },
});

async function runMeetingHoursReport(request: Request) {
  const authFail = assertMeetingHoursReportCronAuth(request);
  if (authFail) return authFail;

  if (!meetingHoursReportCronEnabled()) {
    return Response.json({ ok: true, skipped: true, reason: "Meeting hours report cron disabled" });
  }

  try {
    const result = await buildAndSendMeetingHoursReportEmail({ forceRefresh: true });
    console.info("[cron/meeting-hours-report]", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Meeting hours report email failed";
    console.error("[cron/meeting-hours-report]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
