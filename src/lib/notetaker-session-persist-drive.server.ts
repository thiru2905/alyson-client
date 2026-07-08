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
import {
  fetchRecallBotLifecycle,
  type RecallBotLifecycle,
} from "@/lib/recall/recall-bot-status.server";
import {
  backfillTranscriptFromRecall,
  mergeRecallTranscriptIfRicher,
  recallCallEnded,
} from "@/lib/recall/recall-transcript-backfill.server";
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

const IN_CALL_SESSION_STATUSES = new Set([
  "recording",
  "in_call",
  "in_call_recording",
  "in_call_not_recording",
  "joined",
  "joining",
  "joining_call",
  "waiting_room",
  "in_waiting_room",
  "active",
  "live",
]);

const sessionRecallCheckAt = new Map<string, number>();

function sessionRecallCheckIntervalMs(): number {
  const n = Number(process.env.NOTETAKER_SESSION_RECALL_CHECK_MS ?? String(3 * 60_000));
  return Number.isFinite(n) && n >= 30_000 ? Math.min(Math.floor(n), 15 * 60_000) : 3 * 60_000;
}

function shouldFetchRecallForSession(botId: string): boolean {
  const last = sessionRecallCheckAt.get(botId) ?? 0;
  if (Date.now() - last < sessionRecallCheckIntervalMs()) return false;
  sessionRecallCheckAt.set(botId, Date.now());
  return true;
}

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

function statusLooksInCall(status: string): boolean {
  const st = String(status || "").toLowerCase();
  if (IN_CALL_SESSION_STATUSES.has(st)) return true;
  return (
    st.includes("recording") ||
    st.includes("in_call") ||
    st.includes("waiting_room") ||
    st.includes("joining")
  );
}

function statusLooksEnded(status: string): boolean {
  const st = String(status || "").toLowerCase();
  if (ENDED_SESSION_STATUSES.has(st)) return true;
  return (
    st.includes("ended") ||
    st.includes("left") ||
    st.includes("done") ||
    st.includes("completed") ||
    st.includes("disconnected") ||
    st.includes("finished") ||
    st === "persisted"
  );
}

export type InferMeetingEndedOptions = {
  lifecycle?: RecallBotLifecycle | null;
  allowRecallFetch?: boolean;
  botIndex?: Awaited<ReturnType<typeof loadBotIndexDoc>> | null;
};

/**
 * Meeting is over — upstream ended status, S3 bot-index markers, or Recall call_ended/done.
 * Avoids Retrieve Bot on every UI poll / cron pass (Recall limit ~300 GET/min).
 */
export async function inferMeetingEnded(
  session: NotetakerSession,
  lines: NotetakerTranscriptLine[],
  botId?: string,
  options?: InferMeetingEndedOptions,
): Promise<{ ended: boolean; recallCallEndedAt: string | null }> {
  const st = String(session.status || "").toLowerCase();
  if (statusLooksEnded(st)) {
    return { ended: true, recallCallEndedAt: null };
  }
  if (statusLooksInCall(st)) {
    return { ended: false, recallCallEndedAt: null };
  }

  const id = String(botId || session.botId || "").trim();
  if (id) {
    const index = options?.botIndex !== undefined ? options.botIndex : await loadBotIndexDoc(id);
    if (index?.recallCallEndedAt || index?.cronFinalized) {
      return {
        ended: true,
        recallCallEndedAt: index.recallCallEndedAt ?? index.cronFinalizedAt ?? null,
      };
    }
  }

  const createdAt = Date.parse(String(session.createdAt || ""));
  if (Number.isFinite(createdAt) && Date.now() - createdAt > 6 * 60 * 60_000 && lines.length > 0) {
    return { ended: true, recallCallEndedAt: null };
  }

  if (options?.allowRecallFetch === false || !id) {
    return { ended: false, recallCallEndedAt: null };
  }
  if (!shouldFetchRecallForSession(id)) {
    return { ended: false, recallCallEndedAt: null };
  }

  const lifecycle = options?.lifecycle ?? (await fetchRecallBotLifecycle(id));
  if (recallCallEnded(lifecycle)) {
    return { ended: true, recallCallEndedAt: lifecycle.callEndedAt || lifecycle.doneAt };
  }

  return { ended: false, recallCallEndedAt: null };
}

/** Skip cron/list polling only when S3 already has the same transcript and cron marked stable after call ended. */
export async function shouldSkipPersistPolling(botId: string, upstreamHash?: string): Promise<boolean> {
  const index = await loadBotIndexDoc(botId);
  if (!index?.transcriptKey || !index.transcriptHash) return false;
  if (!index.cronFinalized) return false;
  if (!index.recallCallEndedAt && !index.cronFinalizedAt) return false;
  if (upstreamHash && index.transcriptHash !== upstreamHash) return false;

  try {
    const text = (await getTranscriptTextFromS3({ transcriptKey: index.transcriptKey })).trim();
    return text.length > 0;
  } catch {
    return false;
  }
}

async function tryRecallBackfillForEndedBot(botId: string): Promise<PersistDriveResult> {
  const backfill = await backfillTranscriptFromRecall(botId);
  if (backfill.ok && backfill.persisted) return "written";
  return "empty";
}

/**
 * Fetch upstream transcript for one bot and write to S3 when content exists.
 * Used by cron, sessions-list background sync, and unified bot sweep.
 */
export async function driveSessionPersistToS3(
  botId: string,
  options?: { bypassThrottle?: boolean; forceNotes?: boolean; skipRecallFetch?: boolean },
): Promise<PersistDriveResult> {
  const id = String(botId || "").trim();
  if (!id) return "error";

  const botIndex = await loadBotIndexDoc(id);
  if (
    options?.skipRecallFetch &&
    botIndex?.cronFinalized &&
    botIndex.transcriptKey &&
    botIndex.transcriptHash
  ) {
    try {
      const text = (await getTranscriptTextFromS3({ transcriptKey: botIndex.transcriptKey })).trim();
      if (text.length > 0) return "skipped_complete";
    } catch {
      // continue with normal persist path
    }
  }

  let payload: NotetakerSessionPayload | null = null;
  try {
    const res = await notetakerUpstream(`/api/session/${encodeURIComponent(id)}`);
    payload = normalizeSessionPayload(res, id);
  } catch {
    payload = null;
  }

  const skipRecall = options?.skipRecallFetch === true;
  let lifecycle: RecallBotLifecycle | null = null;

  if (!payload?.lines?.length) {
    if (skipRecall) return payload ? "empty" : "unavailable";
    if (botIndex?.cronFinalized) return payload ? "empty" : "unavailable";
    lifecycle = await fetchRecallBotLifecycle(id);
    if (recallCallEnded(lifecycle)) {
      return tryRecallBackfillForEndedBot(id);
    }
    return payload ? "empty" : "unavailable";
  }

  let lines = payload.lines;
  const session = await withResolvedMeetingTitle(payload.session);
  if (!lifecycle && !skipRecall && !botIndex?.cronFinalized && !statusLooksEnded(session.status || "")) {
    lifecycle = await fetchRecallBotLifecycle(id);
  }
  const { ended, recallCallEndedAt } = await inferMeetingEnded(session, lines, id, {
    lifecycle,
    botIndex,
    allowRecallFetch: !skipRecall && !botIndex?.cronFinalized,
  });

  if (ended && !skipRecall && !botIndex?.cronFinalized) {
    lines = await mergeRecallTranscriptIfRicher({ botId: id, session, upstreamLines: lines });
  }

  const upstreamHash = contentHash(composeTranscript(lines).transcriptText);
  if (await shouldSkipPersistPolling(id, upstreamHash)) return "skipped_complete";

  try {
    const { touchUnifiedScheduledFromSession } = await import("@/lib/unified-scheduled-lifecycle.server");
    await touchUnifiedScheduledFromSession({
      botId: id,
      upstreamStatus: session.status,
      lineCount: lines.length,
      ended,
    });
  } catch {
    // best-effort lifecycle touch
  }

  try {
    if (ended) {
      let result = await autoPersistEndedMeetingToS3({
        session,
        lines,
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
      if (!result.persisted && recallCallEndedAt && !skipRecall) {
        const recallOnly = await backfillTranscriptFromRecall(id);
        if (recallOnly.ok) result = { persisted: true };
      }
      if (recallCallEndedAt) {
        await patchBotIndexCronStability(id, upstreamHash, {
          callEnded: true,
          recallCallEndedAt,
        }).catch(() => {});
      }
      if (result.persisted) return "written";
      if (result.skipped === "unchanged") return "unchanged";
      return "unchanged";
    }

    await maybeCheckpointTranscriptToS3(session, lines, {
      bypassThrottle: options?.bypassThrottle ?? true,
    });
    return "unchanged";
  } catch {
    return "error";
  }
}

export async function drivePersistForBotIds(
  botIds: Iterable<string>,
  options?: { bypassThrottle?: boolean; skipRecallFetch?: boolean },
): Promise<{ written: number; unchanged: number; empty: number; unavailable: number; skipped: number; errors: number }> {
  const stats = { written: 0, unchanged: 0, empty: 0, unavailable: 0, skipped: 0, errors: 0 };
  const ids = [...new Set([...botIds].map((botId) => String(botId || "").trim()).filter(Boolean))];

  for (const botId of ids) {
    const result = await driveSessionPersistToS3(botId, options);
    if (result === "written") stats.written += 1;
    else if (result === "unchanged") stats.unchanged += 1;
    else if (result === "empty") stats.empty += 1;
    else if (result === "unavailable") stats.unavailable += 1;
    else if (result === "skipped_complete") stats.skipped += 1;
    else stats.errors += 1;
  }

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
