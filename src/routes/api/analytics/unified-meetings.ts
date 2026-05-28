import { createFileRoute } from "@tanstack/react-router";
import { getUnifiedMeetings } from "@/lib/unifiedMeetingsService";

export const Route = createFileRoute("/api/analytics/unified-meetings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const { meetings, summary } = await getUnifiedMeetings({
            email: url.searchParams.get("email"),
            botStatus: url.searchParams.get("botStatus"),
            hasMeetLink: url.searchParams.get("hasMeetLink"),
            shouldBotJoin: url.searchParams.get("shouldBotJoin"),
            search: url.searchParams.get("search"),
          });
          return Response.json({ meetings, summary });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load unified meetings";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
