import { createFileRoute } from "@tanstack/react-router";
import { buildRecallCostReport } from "@/lib/recall-cost-report.server";

export const Route = createFileRoute("/api/analytics/recall-cost")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const start = url.searchParams.get("start");
        const end = url.searchParams.get("end");
        if (!start || !end) {
          return Response.json({ error: "start and end query params are required (YYYY-MM-DD)" }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
          return Response.json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
        }
        try {
          const report = await buildRecallCostReport({ start, end });
          return Response.json({ report });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to build recall cost report";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
