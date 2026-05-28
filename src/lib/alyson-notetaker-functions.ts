import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { persistSession } from "@/lib/notetaker-datastore.server";
import {
  listPersistedSessionsFromS3,
  mergeNotetakerSessions,
} from "@/lib/notetaker-sessions-history.server";
import { putNotetakerSessionsIndexToS3 } from "@/lib/notetaker-sessions-s3.server";

const BotIdInput = z.object({ botId: z.string().min(1) });
const CreateBotInput = z.object({
  meeting_url: z.string().min(1),
  bot_name: z.string().min(1),
  title: z.string().optional(),
  // Optional: JPEG base64 (no data: prefix) to show as bot video tile.
  avatar_jpeg_b64: z.string().min(1).max(1_835_008).optional(),
});
const NotesInput = z.object({ botId: z.string().min(1), prompt: z.string().optional() });

type UnifiedScheduledState = {
  scheduled?: Array<{
    recallBotId?: string;
    title?: string;
    meetingUrl?: string;
    scheduledAt?: string;
    startTime?: string;
    endTime?: string;
  }>;
};

function baseUrl() {
  const raw =
    process.env.ALYSON_NOTETAKER_BASE_URL ||
    process.env.VITE_ALYSON_NOTETAKER_BASE_URL ||
    // backward compat
    process.env.TEST_BOTV2_BASE_URL ||
    process.env.VITE_TEST_BOTV2_BASE_URL ||
    "http://localhost:3003";
  return String(raw).replace(/\/$/, "");
}

async function upstream(path: string, init?: RequestInit) {
  const url = `${baseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  const r = await fetch(url, init);
  const contentType = r.headers.get("content-type") || "";
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  if (contentType.includes("text/html") || (text && text.trim().startsWith("<!DOCTYPE html"))) {
    throw new Error(
      `Notetaker API returned HTML (wrong base URL or server not running). ` +
        `Check ALYSON_NOTETAKER_BASE_URL/VITE_ALYSON_NOTETAKER_BASE_URL (currently: ${baseUrl()}).`,
    );
  }
  if (!r.ok) {
    const msg = json?.error ? String(json.error) : text || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return json;
}

async function listUnifiedScheduledSessions(): Promise<NotetakerSession[]> {
  const stateFile = path.resolve(process.cwd(), "alyson_scheduled_state.json");
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw) as UnifiedScheduledState;
    const rows = Array.isArray(parsed?.scheduled) ? parsed.scheduled : [];
    const now = Date.now();
    return rows
      .map((r) => {
        const botId = String(r?.recallBotId || "").trim();
        if (!botId) return null;
        const startMs = new Date(String(r?.startTime || "")).getTime();
        const endMsRaw = new Date(String(r?.endTime || "")).getTime();
        const endMs = Number.isFinite(endMsRaw) ? endMsRaw : (Number.isFinite(startMs) ? startMs + 90 * 60 * 1000 : NaN);
        const windowStart = Number.isFinite(startMs) ? startMs - 10 * 60 * 1000 : NaN;
        const windowEnd = Number.isFinite(endMs) ? endMs + 30 * 60 * 1000 : NaN;
        if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || now < windowStart || now > windowEnd) {
          return null;
        }
        return {
          botId,
          title: String(r?.title || "Unified meeting"),
          meetingUrl: r?.meetingUrl ? String(r.meetingUrl) : undefined,
          createdAt: String(r?.scheduledAt || r?.startTime || new Date().toISOString()),
          status: "scheduled",
        } satisfies NotetakerSession;
      })
      .filter((v): v is NotetakerSession => Boolean(v));
  } catch {
    return [];
  }
}

async function hasTranscriptLines(botId: string): Promise<boolean> {
  try {
    const data = (await upstream(`/api/session/${encodeURIComponent(botId)}`)) as { lines?: unknown[] };
    return Array.isArray(data?.lines) && data.lines.length > 0;
  } catch {
    return false;
  }
}

async function filterSessionsWithTranscript(
  sessions: NotetakerSession[],
  options: { forceKeepBotIds?: Set<string> } = {},
): Promise<NotetakerSession[]> {
  const forceKeepBotIds = options.forceKeepBotIds ?? new Set<string>();
  if (!sessions.length) return sessions;
  const checks = await Promise.all(
    sessions.map(async (s) => ({
      session: s,
      keep:
        forceKeepBotIds.has(String(s.botId || "")) ||
        String(s.status || "").toLowerCase() === "persisted" ||
        (await hasTranscriptLines(String(s.botId || ""))),
    })),
  );
  return checks.filter((x) => x.keep).map((x) => x.session);
}

export type NotetakerSession = {
  botId: string;
  title: string;
  meetingUrl?: string;
  botName?: string;
  createdAt: string;
  status?: string;
};

export type NotetakerTranscriptLine = {
  received_at: string;
  event: string;
  text?: string;
  participant?: { id?: string; name?: string } | null;
  initials?: string;
  clock?: string;
};

export type NotetakerSessionPayload = {
  session: NotetakerSession;
  lines: NotetakerTranscriptLine[];
  participantCount: number;
  startedLabel: string;
  hasRecallConfig: boolean;
  hasGroqConfig: boolean;
  notesMd?: string | null;
  notesModel?: string;
  persistedInS3?: boolean;
  /** Set when this request auto-wrote the meeting to S3 */
  autoPersistedToS3?: boolean;
};

export const listNotetakerSessions = createServerFn({ method: "GET" }).handler(async () => {
  const source = String(process.env.NOTETAKER_SESSIONS_SOURCE || "").trim().toLowerCase();
  const unifiedScheduledSessions = await listUnifiedScheduledSessions();

  let s3Sessions: NotetakerSession[] = [];
  try {
    s3Sessions = await listPersistedSessionsFromS3();
  } catch {
    // S3 optional when credentials missing
  }

  // S3-only mode (for deployments that don't want to depend on upstream availability)
  if (source === "s3") {
    const filteredS3 = await filterSessionsWithTranscript(s3Sessions);
    return {
      sessions: filteredS3,
      hasRecallConfig: true,
      hasGroqConfig: true,
    };
  }

  try {
    const data = (await upstream("/api/sessions")) as {
      sessions: NotetakerSession[];
      hasRecallConfig: boolean;
      hasGroqConfig: boolean;
    };

    // Keep active-window unified-scheduled bots visible in Notetaker sessions
    // so automated calls appear exactly like manual flow.
    const merged = mergeNotetakerSessions(data.sessions ?? [], unifiedScheduledSessions, s3Sessions);
    // Keep upstream live sessions + active unified-scheduled sessions even if
    // transcript lines have not arrived yet.
    const forceKeepBotIds = new Set([
      ...(data.sessions ?? []).map((s) => String(s.botId || "")),
      ...unifiedScheduledSessions.map((s) => String(s.botId || "")),
    ]);
    const filtered = await filterSessionsWithTranscript(merged, { forceKeepBotIds });

    // Best-effort: persist merged catalog so history stays in sync.
    try {
      await putNotetakerSessionsIndexToS3({ sessions: filtered });
    } catch {
      // ignore S3 failures for the live sessions call
    }

    return { ...data, sessions: filtered };
  } catch (e) {
    if (s3Sessions.length > 0) {
      const filteredS3 = await filterSessionsWithTranscript(s3Sessions);
      return {
        sessions: filteredS3,
        hasRecallConfig: true,
        hasGroqConfig: true,
      };
    }
    throw e;
  }
});

export { getNotetakerSession } from "@/lib/notetaker-get-session-functions";

export const finalizeNotetakerSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BotIdInput.parse(data))
  .handler(async ({ data }) => {
    const res = (await upstream(`/api/session/${encodeURIComponent(data.botId)}`)) as {
      session: NotetakerSession;
      lines: NotetakerTranscriptLine[];
    };
    let notes: { notes: string; model?: string } | null = null;
    try {
      notes = (await upstream(`/api/session/${encodeURIComponent(data.botId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "" }),
      })) as any;
    } catch {
      // ignore
    }
    const persisted = await persistSession({ session: res.session, lines: res.lines ?? [], notes });
    return { persisted };
  });

export const createNotetakerRecallBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateBotInput.parse(data))
  .handler(async ({ data }) => {
    const payload: any = { meeting_url: data.meeting_url, bot_name: data.bot_name, title: data.title ?? "Live meeting" };
    if (data.avatar_jpeg_b64) {
      payload.automatic_video_output = {
        in_call_recording: { kind: "jpeg", b64_data: data.avatar_jpeg_b64 },
        in_call_not_recording: { kind: "jpeg", b64_data: data.avatar_jpeg_b64 },
      };
    }
    const res = await upstream("/api/create-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res;
  });

export const generateNotetakerNotes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => NotesInput.parse(data))
  .handler(async ({ data }) => {
    const res = await upstream(`/api/session/${encodeURIComponent(data.botId)}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: data.prompt ?? "" }),
    });
    return res as { notes: string; model: string };
  });

