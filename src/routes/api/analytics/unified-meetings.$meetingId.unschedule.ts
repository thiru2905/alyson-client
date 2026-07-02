import { createFileRoute } from "@tanstack/react-router";
import { unscheduleUnifiedMeetingById } from "@/lib/unifiedMeetingsService";

export const Route = createFileRoute("/api/analytics/unified-meetings/$meetingId/unschedule")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        try {
          const result = await unscheduleUnifiedMeetingById(params.meetingId);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to unschedule meeting";
          return Response.json({ ok: false, message }, { status: 500 });
        }
      },
      POST: async ({ params }) => {
        try {
          const result = await unscheduleUnifiedMeetingById(params.meetingId);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to unschedule meeting";
          return Response.json({ ok: false, message }, { status: 500 });
        }
      },
    },
  },
});
