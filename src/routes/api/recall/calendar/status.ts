import { createFileRoute } from "@tanstack/react-router";
import {
  disconnectRecallCalendar,
  getRecallCalendarStatus,
  registerRecallCalendarFromEnvIfNeeded,
  syncRecallCalendarNow,
} from "@/lib/recall/recall-calendar-service.server";

export const Route = createFileRoute("/api/recall/calendar/status")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const status = await getRecallCalendarStatus();
          return Response.json({ ok: true, ...status });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to load calendar status";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            action?: string;
            calendarId?: string;
            eventIds?: string[];
            scheduleAll?: boolean;
            maxNewBots?: number;
          };
          if (body.action === "bootstrap") {
            const r = await registerRecallCalendarFromEnvIfNeeded();
            if (!r) return Response.json({ ok: false, error: "Missing GOOGLE_OAUTH_REFRESH_TOKEN" }, { status: 400 });
            return Response.json({ ok: true, ...r });
          }
          if (body.action === "sync" && body.calendarId) {
            const sync = await syncRecallCalendarNow(body.calendarId, {
              eventIds: body.eventIds,
              scheduleAll: body.scheduleAll,
              maxNewBots: body.maxNewBots,
              refreshBotConfig: Boolean(body.eventIds?.length),
            });
            return Response.json({ ok: true, sync });
          }
          if (body.action === "disconnect" && body.calendarId) {
            const r = await disconnectRecallCalendar(body.calendarId);
            return Response.json({ ok: true, ...r });
          }
          return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Calendar action failed";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
