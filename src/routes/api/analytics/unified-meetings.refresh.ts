import { createFileRoute } from "@tanstack/react-router";
import { refreshUnifiedMeetings } from "@/lib/unifiedMeetingsService";

export const Route = createFileRoute("/api/analytics/unified-meetings/refresh")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const summary = await refreshUnifiedMeetings();
          return Response.json(summary);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to refresh unified meetings";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
