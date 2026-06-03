import { createFileRoute } from "@tanstack/react-router";
import { buildAndSendDailyStakeholderReports } from "@/lib/daily-stakeholder-reports.server";
import { assertDailyReportCronAuth } from "@/lib/resend-mail.server";

export const Route = createFileRoute("/api/cron/daily-reports")({
  server: {
    handlers: {
      GET: async ({ request }) => runDailyReports(request),
      POST: async ({ request }) => runDailyReports(request),
    },
  },
});

async function runDailyReports(request: Request) {
  const authFail = assertDailyReportCronAuth(request);
  if (authFail) return authFail;

  try {
    const result = await buildAndSendDailyStakeholderReports();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send daily reports";
    console.error("[cron/daily-reports]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
