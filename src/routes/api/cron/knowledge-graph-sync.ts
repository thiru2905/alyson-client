import { createFileRoute } from "@tanstack/react-router";
import { assertNotetakerTranscriptCronAuth } from "@/lib/notetaker-cron-auth.server";

export const Route = createFileRoute("/api/cron/knowledge-graph-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const authFail = assertNotetakerTranscriptCronAuth(request);
  if (authFail) return authFail;

  const { knowledgeGraphEnabled } = await import("@/lib/knowledge-graph/kg-config.server");
  if (!knowledgeGraphEnabled()) {
    return Response.json({
      ok: true,
      enabled: false,
      message: "KNOWLEDGE_GRAPH_ENABLED=false — no sync ran",
    });
  }

  try {
    const { runKnowledgeGraphMeetingSync } = await import(
      "@/lib/knowledge-graph/kg-sync-meetings.server"
    );
    const result = await runKnowledgeGraphMeetingSync();
    console.info(
      "[cron/knowledge-graph-sync]",
      JSON.stringify({
        synced: result.synced,
        skipped: result.skipped,
        errors: result.errors,
      }),
    );
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/knowledge-graph-sync]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
