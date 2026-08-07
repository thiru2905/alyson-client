import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { persistSession } from "@/lib/notetaker-datastore.server";
import { buildNotetakerSessionsList } from "@/lib/notetaker-sessions-list.server";
import { notetakerUpstream } from "@/lib/notetaker-upstream.server";

const BotIdInput = z.object({ botId: z.string().min(1) });
const CreateBotInput = z.object({
  meeting_url: z.string().min(1),
  bot_name: z.string().min(1),
  title: z.string().optional(),
  // Optional: JPEG base64 (no data: prefix) to show as bot video tile.
  avatar_jpeg_b64: z.string().min(1).max(1_835_008).optional(),
});
const NotesInput = z.object({ botId: z.string().min(1), prompt: z.string().optional() });

async function upstream(path: string, init?: RequestInit) {
  return notetakerUpstream(path, init);
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

const ListSessionsInput = z.object({
  clerkToken: z.string().min(1),
  emailHint: z.string().min(1).optional(),
});

export const listNotetakerSessions = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ListSessionsInput.parse(data))
  .handler(async ({ data }) => {
    const { resolveMeetingVisibilityViewer, filterSessionsForViewer } = await import(
      "@/lib/meeting-visibility.server"
    );
    const viewer = await resolveMeetingVisibilityViewer(data.clerkToken, data.emailHint);
    const payload = await buildNotetakerSessionsList();
    const sessions = await filterSessionsForViewer(payload.sessions ?? [], viewer);
    return { ...payload, sessions };
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
    const { dispatchBotWithLiveTranscripts } = await import("@/lib/notetaker-bot-dispatch.server");

    // Same “join now” rule as unified meetings — Recall needs a short join_at, not “no join_at”.
    const botJoinAt = new Date(Date.now() + 20_000).toISOString();

    // Full-res 1280×720 JPEG often exceeds upstream timeouts; keep a modest tile or skip.
    const avatar =
      data.avatar_jpeg_b64 && data.avatar_jpeg_b64.length <= 180_000
        ? data.avatar_jpeg_b64
        : undefined;

    const { botId, creationSource } = await dispatchBotWithLiveTranscripts({
      meetingUrl: data.meeting_url.trim(),
      botJoinAt,
      title: data.title?.trim() || "Live meeting",
      botName: data.bot_name.trim(),
      avatarJpegB64: avatar,
      metadata: {
        source: "manual_create",
        meeting_url: data.meeting_url.trim(),
      },
    });

    return { botId, creationSource, joinAt: botJoinAt };
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

