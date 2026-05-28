import { createFileRoute } from "@tanstack/react-router";
import { scheduleUnifiedMeetingById } from "@/lib/unifiedMeetingsService";

export const Route = createFileRoute("/api/analytics/unified-meetings/$meetingId/schedule")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const result = await scheduleUnifiedMeetingById(params.meetingId);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to schedule meeting";
          return Response.json({ ok: false, message }, { status: 500 });
        }
      },
    },
  },
});
