import { createFileRoute } from "@tanstack/react-router";
import { getEmployeeScoringDetail } from "@/lib/employee-scoring-detail-functions";

export const Route = createFileRoute("/api/analytics/employee-scoring/$userEmail")({
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
          const data = await getEmployeeScoringDetail({
            data: { userEmail, start, end },
          });
          return Response.json(data);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load employee scoring detail";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
