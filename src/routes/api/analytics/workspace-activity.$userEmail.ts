import { createFileRoute } from "@tanstack/react-router";
import { runGetWorkspaceUserActivityDetail } from "@/lib/workspace-activity.server";

export const Route = createFileRoute("/api/analytics/workspace-activity/$userEmail")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const start = url.searchParams.get("start");
        const end = url.searchParams.get("end");
        if (!start || !end) {
          return Response.json({ error: "start and end query params are required" }, { status: 400 });
        }
        const userEmail = decodeURIComponent(params.userEmail);
        try {
          const data = await runGetWorkspaceUserActivityDetail({ userEmail, start, end });
          return Response.json(data);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load workspace user activity";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
