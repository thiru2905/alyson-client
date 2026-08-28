import { createFileRoute } from "@tanstack/react-router";
import { scheduleAllowlistedUnifiedBots } from "@/lib/unifiedMeetingsService";
import { assertDailyReportCronAuth } from "@/lib/resend-mail.server";

/**
 * Allowlisted auto-schedule (alysonclient, mohita, arman, aditya, …).
 * Company-wide scheduling stays off. Cron + manual POST both use the same allowlist filter.
 */
export const Route = createFileRoute("/api/analytics/unified-meetings/schedule-bots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authFail = assertDailyReportCronAuth(request);
        if (authFail) return authFail;
        try {
          const result = await scheduleAllowlistedUnifiedBots({ maxNewBots: 120 });
          return Response.json({ ok: true, mode: "allowlisted", ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to schedule bots";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        // UI / ops: same allowlisted path (no secret required for signed-in app traffic).
        // Prefer Authorization when called from external cron.
        const hasAuth =
          Boolean(request.headers.get("authorization")?.trim()) ||
          Boolean(request.headers.get("x-cron-secret")?.trim());
        if (hasAuth) {
          const authFail = assertDailyReportCronAuth(request);
          if (authFail) return authFail;
        }
        try {
          const result = await scheduleAllowlistedUnifiedBots({ maxNewBots: 120 });
          return Response.json({ ok: true, mode: "allowlisted", ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Failed to schedule bots";
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
