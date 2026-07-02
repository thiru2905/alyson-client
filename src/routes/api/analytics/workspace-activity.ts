import { createFileRoute } from "@tanstack/react-router";
import { runGetWorkspaceActivity } from "@/lib/workspace-activity.server";

export const Route = createFileRoute("/api/analytics/workspace-activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const start = url.searchParams.get("start") || undefined;
        const end = url.searchParams.get("end") || undefined;
        const accurateMeetings = url.searchParams.get("accurateMeetings") !== "0";
        try {
          const data = await runGetWorkspaceActivity({ start, end, accurateMeetings });
          return Response.json(data);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load workspace activity";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
