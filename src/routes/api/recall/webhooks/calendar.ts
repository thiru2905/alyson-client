import { createFileRoute } from "@tanstack/react-router";
import { verifyRecallCalendarWebhook } from "@/lib/recall/google-calendar-oauth.server";
import { handleRecallCalendarWebhook } from "@/lib/recall/recall-calendar-service.server";
import type { RecallCalendarWebhookPayload } from "@/lib/recall/recall-calendar-types";

export const Route = createFileRoute("/api/recall/webhooks/calendar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        if (!verifyRecallCalendarWebhook(rawBody, request.headers)) {
          return Response.json({ ok: false, error: "Invalid webhook signature" }, { status: 401 });
        }

        let payload: RecallCalendarWebhookPayload;
        try {
          payload = JSON.parse(rawBody) as RecallCalendarWebhookPayload;
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
        }

        try {
          const result = await handleRecallCalendarWebhook(payload);
          return Response.json({ ok: true, result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Webhook handler failed";
          console.error("[recall-calendar-webhook]", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
