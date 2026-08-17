import { createFileRoute } from "@tanstack/react-router";
import { scheduleUnifiedMeetingsByIds } from "@/lib/unifiedMeetingsService";

const CRON_DISABLED = {
  error: "Company-wide cron bot scheduling is disabled",
  hint: "Use Schedule all from Unified Meetings, or schedule one meeting at a time from the row action.",
};

export const Route = createFileRoute("/api/analytics/unified-meetings/schedule-bots")({
  server: {
    handlers: {
      // Vercel Cron GET stays disabled — do not re-add vercel.json crons without product sign-off.
      GET: async () => Response.json(CRON_DISABLED, { status: 410 }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as { meetingIds?: unknown } | null;
          const meetingIds = Array.isArray(body?.meetingIds)
            ? body.meetingIds.map((id) => String(id || "").trim()).filter(Boolean)
            : [];
          if (!meetingIds.length) {
            return Response.json(
              { error: "No meetings to schedule", hint: "Pass meetingIds from Unified Meetings → Schedule all." },
              { status: 400 },
            );
          }
          const result = await scheduleUnifiedMeetingsByIds(meetingIds);
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to schedule bots";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
