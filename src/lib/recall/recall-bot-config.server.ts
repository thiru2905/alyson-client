import { recallFetch } from "@/lib/recall/recall-client.server";

/** Alyson HR app hosts — Recall webhooks hit /webhooks/recall here and are proxied to Notetaker. */
export function isAlysonClientWebhookHost(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("alysonhr.com") ||
    u.includes("vercel.app") ||
    u.includes("alyson-client") ||
    u.includes("localhost:3001") ||
    u.includes("127.0.0.1:3001")
  );
}

function looksLikeNotetakerHost(url: string): boolean {
  const u = url.toLowerCase();
  if (isAlysonClientWebhookHost(url)) return false;
  if (u.includes("localhost") || u.includes("127.0.0.1")) return true;
  if (u.includes("onrender.com") || u.includes("notetaker")) return true;
  return false;
}

/** Notetaker service base URL (Recall transcript webhooks ultimately land here). */
export function resolveNotetakerBaseUrl(): string {
  const raw =
    process.env.ALYSON_NOTETAKER_BASE_URL?.trim() ||
    process.env.VITE_ALYSON_NOTETAKER_BASE_URL?.trim() ||
    process.env.TEST_BOTV2_BASE_URL?.trim() ||
    "https://api-uic1.onrender.com";
  return raw.replace(/\/$/, "");
}

/** Public URL Recall uses for transcript.data / transcript.partial_data webhooks. */
export function resolveRecallTranscriptWebhookUrl(): string {
  const explicit = process.env.RECALL_TRANSCRIPT_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  // PUBLIC_WEBHOOK_BASE_URL may be the Alyson HR app — /webhooks/recall proxies to Notetaker.
  const publicBase = process.env.PUBLIC_WEBHOOK_BASE_URL?.trim();
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/webhooks/recall`;

  const notetakerBase = resolveNotetakerBaseUrl();
  if (looksLikeNotetakerHost(notetakerBase)) {
    return `${notetakerBase}/webhooks/recall`;
  }

  return "https://api-uic1.onrender.com/webhooks/recall";
}

/** Re-apply transcript webhooks on an existing Recall bot (scheduled or in-call). */
export async function patchRecallBotRecordingConfig(botId: string): Promise<void> {
  const id = String(botId || "").trim();
  if (!id) return;
  await recallFetch(`/api/v1/bot/${encodeURIComponent(id)}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recallBotRecordingConfig()),
    timeoutMs: 15_000,
  });
}

/** Default Recall bot settings (no join_at — forbidden in Calendar V1 dashboard template). */
export function recallBotRecordingConfig() {
  const transcriptWebhookUrl = resolveRecallTranscriptWebhookUrl();
  const language = process.env.TRANSCRIPT_LANGUAGE?.trim() || "en";

  return {
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {
            mode: "prioritize_low_latency",
            language_code: language,
          },
        },
      },
      realtime_endpoints: [
        {
          type: "webhook",
          url: transcriptWebhookUrl,
          events: ["transcript.data", "transcript.partial_data"],
        },
      ],
    },
    automatic_leave: {
      waiting_room_timeout: 1200,
      noone_joined_timeout: 1200,
      everyone_left_timeout: 2,
    },
  };
}

/** JSON for Recall dashboard → Calendar V1 Bot Configuration (Bot Config field only). */
export function recallCalendarV1DashboardBotConfigJson(): string {
  return JSON.stringify(
    {
      ...recallBotRecordingConfig(),
      metadata: {
        source: "alyson_calendar",
      },
    },
    null,
    2,
  );
}
