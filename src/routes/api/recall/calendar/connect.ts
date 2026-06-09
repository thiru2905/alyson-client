import { createFileRoute } from "@tanstack/react-router";
import { startRecallCalendarConnect } from "@/lib/recall/recall-calendar-service.server";

export const Route = createFileRoute("/api/recall/calendar/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const returnTo = url.searchParams.get("returnTo") || "/alyson-notetaker/unified-meetings";
          const origin = url.origin;
          const oauthUrl = startRecallCalendarConnect(origin, returnTo);
          return Response.redirect(oauthUrl, 302);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to start calendar connect";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
