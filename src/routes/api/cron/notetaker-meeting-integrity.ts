import { createFileRoute } from "@tanstack/react-router";
import { assertNotetakerTranscriptCronAuth } from "@/lib/notetaker-cron-auth.server";
import { runNotetakerMeetingIntegrityCheck } from "@/lib/notetaker-meeting-integrity.server";

export const Route = createFileRoute("/api/cron/notetaker-meeting-integrity")({
  server: {
    handlers: {
      GET: async ({ request }) => runIntegrity(request),
      POST: async ({ request }) => runIntegrity(request),
    },
  },
});

async function runIntegrity(request: Request) {
  const authFail = assertNotetakerTranscriptCronAuth(request);
  if (authFail) return authFail;

  try {
    const url = new URL(request.url);
    const repair = url.searchParams.get("repair") !== "false";
    const result = await runNotetakerMeetingIntegrityCheck({ repair });
    console.info("[cron/notetaker-meeting-integrity]", JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Meeting integrity check failed";
    console.error("[cron/notetaker-meeting-integrity]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
