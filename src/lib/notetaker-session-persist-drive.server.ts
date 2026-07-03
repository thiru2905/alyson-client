import type {
  NotetakerSession,
  NotetakerSessionPayload,
  NotetakerTranscriptLine,
} from "@/lib/alyson-notetaker-functions";
import {
  autoPersistEndedMeetingToS3,
  ensureMeetingNotesInS3,
  maybeCheckpointTranscriptToS3,
} from "@/lib/notetaker-auto-persist.server";
import { composeTranscript, contentHash, patchBotIndexCronStability } from "@/lib/notetaker-persistence.server";
import { ENDED_SESSION_STATUSES } from "@/lib/notetaker-session-status.server";
import { withResolvedMeetingTitle } from "@/lib/notetaker-session-title.server";
import { isMeetingPersistedInS3, loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";
import { getTranscriptTextFromS3 } from "@/lib/notetaker-s3-calendar.server";
import { notetakerUpstream } from "@/lib/notetaker-upstream.server";

export type PersistDriveResult =
  | "written"
  | "unchanged"
  | "empty"
  | "unavailable"
  | "skipped_complete"
  | "error";

function normalizeSessionPayload(res: unknown, botId: string): NotetakerSessionPayload | null {
  if (!res || typeof res !== "object") return null;
  const o = res as Partial<NotetakerSessionPayload>;
  if (!o.session?.botId) return null;
  return {
    session: o.session,
    lines: Array.isArray(o.lines) ? o.lines : [],
    participantCount: Number(o.participantCount ?? 0),
    startedLabel: String(o.startedLabel ?? o.session.createdAt ?? ""),
    hasRecallConfig: Boolean(o.hasRecallConfig ?? true),
    hasGroqConfig: Boolean(o.hasGroqConfig ?? true),
    notesMd: o.notesMd,
    notesModel: o.notesModel,
  };
}

/** Meeting is over — use upstream status or transcript idle time, not list metadata alone. */
export function inferMeetingEnded(session: NotetakerSession, lines: NotetakerTranscriptLine[]): boolean {
  const st = String(session.status || "").toLowerCase();
  if (ENDED_SESSION_STATUSES.has(st)) return true;
  if (
    st.includes("ended") ||
    st.includes("left") ||
    st.includes("done") ||
    st.includes("completed") ||
    st.includes("disconnected") ||
    st.includes("finished") ||
    st === "persisted"
  ) {
    return true;
  }

  const lastLine = lines[lines.length - 1];
  const lastAt = Date.parse(String(lastLine?.received_at || ""));
  if (Number.isFinite(lastAt) && Date.now() - lastAt > 8 * 60_000) return true;

  const createdAt = Date.parse(String(session.createdAt || ""));
  if (Number.isFinite(createdAt) && Date.now() - createdAt > 3 * 60 * 60_000 && lines.length > 0) {
    return true;
  }

  return false;
}

/** Skip cron/list polling only when S3 already has the same transcript and cron marked stable. */
export async function shouldSkipPersistPolling(botId: string, upstreamHash?: string): Promise<boolean> {
  const index = await loadBotIndexDoc(botId);
  if (!index?.transcriptKey || !index.transcriptHash) return false;
  if (!index.cronFinalized) return false;
  if (upstreamHash && index.transcriptHash !== upstreamHash) return false;

  try {
    const text = (await getTranscriptTextFromS3({ transcriptKey: index.transcriptKey })).trim();
    return text.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch upstream transcript for one bot and write to S3 when content exists.
 * Used by cron, sessions-list background sync, and unified bot sweep.
 */
export async function driveSessionPersistToS3(
  botId: string,
  options?: { bypassThrottle?: boolean; forceNotes?: boolean },
): Promise<PersistDriveResult> {
  const id = String(botId || "").trim();
  if (!id) return "error";

  let payload: NotetakerSessionPayload | null = null;
  try {
    const res = await notetakerUpstream(`/api/session/${encodeURIComponent(id)}`);
    payload = normalizeSessionPayload(res, id);
  } catch {
    return "unavailable";
  }

  if (!payload?.lines?.length) return "empty";

  const upstreamHash = contentHash(composeTranscript(payload.lines).transcriptText);
  if (await shouldSkipPersistPolling(id, upstreamHash)) return "skipped_complete";

  const session = await withResolvedMeetingTitle(payload.session);
  const ended = inferMeetingEnded(session, payload.lines);

  try {
    const { touchUnifiedScheduledFromSession } = await import("@/lib/unified-scheduled-lifecycle.server");
    await touchUnifiedScheduledFromSession({
      botId: id,
      upstreamStatus: session.status,
      lineCount: payload.lines.length,
      ended,
    });
  } catch {
    // best-effort lifecycle touch
  }

  try {
    if (ended) {
      let result = await autoPersistEndedMeetingToS3({
        session,
        lines: payload.lines,
        existingNotesMd: payload.notesMd,
        existingNotesModel: payload.notesModel,
        forceNotes: options?.forceNotes,
      });
      if (result.skipped === "unchanged" || result.skipped === "notes_generation_failed") {
        const backfill = await ensureMeetingNotesInS3(id);
        if (backfill.ok && backfill.notesMd?.trim()) {
          result = { persisted: true, notesMd: backfill.notesMd };
        }
      }
      await patchBotIndexCronStability(id, upstreamHash).catch(() => {});
      if (result.persisted) return "written";
      if (result.skipped === "unchanged") return "unchanged";
      return "unchanged";
    }

    const action = await maybeCheckpointTranscriptToS3(session, payload.lines, {
      bypassThrottle: options?.bypassThrottle ?? true,
    });
    await patchBotIndexCronStability(id, upstreamHash).catch(() => {});
    if (action === "written") return "written";
    return "unchanged";
  } catch {
    return "error";
  }
}

export async function drivePersistForBotIds(
  botIds: Iterable<string>,
  options?: { bypassThrottle?: boolean },
): Promise<{ written: number; unchanged: number; empty: number; unavailable: number; skipped: number; errors: number }> {
  const stats = { written: 0, unchanged: 0, empty: 0, unavailable: 0, skipped: 0, errors: 0 };
  const ids = [...new Set([...botIds].map((id) => String(id || "").trim()).filter(Boolean))];

  await Promise.allSettled(
    ids.map(async (botId) => {
      const result = await driveSessionPersistToS3(botId, options);
      if (result === "written") stats.written += 1;
      else if (result === "unchanged") stats.unchanged += 1;
      else if (result === "empty") stats.empty += 1;
      else if (result === "unavailable") stats.unavailable += 1;
      else if (result === "skipped_complete") stats.skipped += 1;
      else stats.errors += 1;
    }),
  );

  return stats;
}

/** True when upstream may still have lines but S3 is missing or empty. */
export async function botNeedsS3Transcript(botId: string): Promise<boolean> {
  if (!(await isMeetingPersistedInS3(botId))) return true;
  const index = await loadBotIndexDoc(botId);
  if (!index?.transcriptKey) return true;
  try {
    const text = (await getTranscriptTextFromS3({ transcriptKey: index.transcriptKey })).trim();
    return text.length === 0;
  } catch {
    return true;
  }
}
