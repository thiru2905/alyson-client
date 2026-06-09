import { createFileRoute } from "@tanstack/react-router";
import { completeRecallCalendarConnect } from "@/lib/recall/recall-calendar-service.server";

export const Route = createFileRoute("/api/recall/calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) {
          return Response.redirect(
            `/alyson-notetaker/unified-meetings?calendarError=${encodeURIComponent(oauthError)}`,
            302,
          );
        }
        if (!code || !state) {
          return Response.redirect("/alyson-notetaker/unified-meetings?calendarError=missing_code", 302);
        }

        try {
          const result = await completeRecallCalendarConnect(code, state, url.origin);
          const dest = result.returnTo || "/alyson-notetaker/unified-meetings";
          const join = dest.includes("?") ? "&" : "?";
          return Response.redirect(
            `${dest}${join}calendarConnected=1&scheduled=${result.sync.scheduled}`,
            302,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : "Calendar connect failed";
          return Response.redirect(
            `/alyson-notetaker/unified-meetings?calendarError=${encodeURIComponent(message)}`,
            302,
          );
        }
      },
    },
  },
});
