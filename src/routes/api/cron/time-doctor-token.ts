import { createFileRoute } from "@tanstack/react-router";
import { assertDailyReportCronAuth } from "@/lib/resend-mail.server";
import { proactiveRefreshTimeDoctorTokenIfDue } from "@/lib/time-doctor-token-manager.server";
import { formatTimeDoctorAuthError } from "@/lib/time-doctor-auth-errors";

export const Route = createFileRoute("/api/cron/time-doctor-token")({
  server: {
    handlers: {
      GET: async ({ request }) => runTimeDoctorTokenCron(request),
      POST: async ({ request }) => runTimeDoctorTokenCron(request),
    },
  },
});

async function runTimeDoctorTokenCron(request: Request) {
  const authFail = assertDailyReportCronAuth(request);
  if (authFail) return authFail;

  try {
    const result = await proactiveRefreshTimeDoctorTokenIfDue();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = formatTimeDoctorAuthError(e);
    console.error("[cron/time-doctor-token]", message.replace(/TIME_DOCTOR_AUTH_EXPIRED:\s*/i, ""));
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
