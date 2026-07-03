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

function normalizePublicBaseUrl(raw: string): string {
  const u = raw.replace(/\/$/, "");
  return u.startsWith("http") ? u : `https://${u}`;
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

/** Direct Notetaker endpoint Recall should POST transcript events to. */
export function resolveRecallNotetakerTranscriptWebhookUrl(): string {
  return `${resolveNotetakerBaseUrl()}/webhooks/recall/transcript`;
}

/**
 * Public URL Recall uses for transcript.data / transcript.partial_data webhooks.
 * Prefer Alyson app `/webhooks/recall` (proxies to Notetaker). Fallback: Notetaker `/webhooks/recall/transcript`.
 * Wrong: `/webhooks/recall` on Render — returns 404 (Recall logs show this failure).
 */
export function resolveRecallTranscriptWebhookUrl(): string {
  const explicit = process.env.RECALL_TRANSCRIPT_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const appBase =
    process.env.ALYSON_APP_BASE_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "";
  if (appBase) {
    return `${normalizePublicBaseUrl(appBase)}/webhooks/recall`;
  }

  const publicBase = process.env.PUBLIC_WEBHOOK_BASE_URL?.trim();
  if (publicBase && isAlysonClientWebhookHost(publicBase)) {
    return `${normalizePublicBaseUrl(publicBase)}/webhooks/recall`;
  }

  return resolveRecallNotetakerTranscriptWebhookUrl();
}

/** Hours Recall keeps recording media (min 1). Alyson copies to S3 — keep this low. */
export function recallRecordingRetentionHours(): number {
  const raw = process.env.RECALL_RECORDING_RETENTION_HOURS?.trim();
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.round(n), 168);
}

/** Re-apply transcript webhooks on an existing Recall bot (scheduled or in-call). */
export async function patchRecallBotRecordingConfig(botId: string): Promise<void> {
  const id = String(botId || "").trim();
  if (!id) return;
  try {
    await recallFetch(`/api/v1/bot/${encodeURIComponent(id)}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recallBotRecordingConfig()),
      timeoutMs: 15_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const body = (e as { body?: unknown }).body;
    const nonField =
      body &&
      typeof body === "object" &&
      Array.isArray((body as { non_field_errors?: unknown }).non_field_errors)
        ? (body as { non_field_errors: string[] }).non_field_errors.join(" ")
        : "";
    if (msg.includes("Cannot update scheduled bot") || nonField.includes("Cannot update scheduled bot")) {
      return;
    }
    throw e;
  }
}

/** Default Recall bot settings (no join_at — forbidden in Calendar V1 dashboard template). */
export function recallBotRecordingConfig() {
  const transcriptWebhookUrl = resolveRecallTranscriptWebhookUrl();
  const language = process.env.TRANSCRIPT_LANGUAGE?.trim() || "en";
  const retentionHours = recallRecordingRetentionHours();

  return {
    recording_config: {
      /** Short TTL on Recall — we persist to S3; avoids "Recording Retention Usage" after 7d free window. */
      retention: {
        type: "timed",
        hours: retentionHours,
      },
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
