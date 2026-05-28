import { createFileRoute } from "@tanstack/react-router";
import { scheduleEligibleUnifiedBots } from "@/lib/unifiedMeetingsService";

export const Route = createFileRoute("/api/analytics/unified-meetings/schedule-bots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const expected = process.env.ALYSON_SCHEDULE_CALENDAR_CRON_SECRET?.trim();
          if (expected) {
            const auth = request.headers.get("authorization") || "";
            if (auth !== `Bearer ${expected}`) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
          }
          const result = await scheduleEligibleUnifiedBots();
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to schedule bots";
          return Response.json({ error: message }, { status: 500 });
        }
      },
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
