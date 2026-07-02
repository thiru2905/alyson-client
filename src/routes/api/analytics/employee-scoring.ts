import { createFileRoute } from "@tanstack/react-router";
import { getEmployeeScoring } from "@/lib/employee-scoring-functions";

export const Route = createFileRoute("/api/analytics/employee-scoring")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const start = url.searchParams.get("start") || undefined;
        const end = url.searchParams.get("end") || undefined;
        try {
          const data = await getEmployeeScoring({ data: { start, end } });
          return Response.json(data);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load employee scoring";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
