import { createFileRoute } from "@tanstack/react-router";
import { scheduleEligibleUnifiedBots } from "@/lib/unifiedMeetingsService";

export const Route = createFileRoute("/api/analytics/unified-meetings/schedule-bots")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await scheduleEligibleUnifiedBots();
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to schedule bots";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
