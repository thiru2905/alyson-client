import type { NotetakerSession, NotetakerTranscriptLine } from "@/lib/alyson-notetaker-functions";
import { autoPersistEndedMeetingToS3 } from "@/lib/notetaker-auto-persist.server";
import { composeTranscript, contentHash } from "@/lib/notetaker-persistence.server";
import { withResolvedMeetingTitle } from "@/lib/notetaker-session-title.server";
import { loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";
import { getTranscriptTextFromS3, invalidateNotetakerCalendarS3Cache } from "@/lib/notetaker-s3-calendar.server";
import { fetchRecallBotLifecycle } from "@/lib/recall/recall-bot-status.server";

type RecallWord = {
  text?: string;
  start_timestamp?: { absolute?: string | null; relative?: number | null };
};

export type RecallTranscriptSegment = {
  participant?: { id?: number; name?: string } | null;
  speaker?: string | null;
  words?: RecallWord[];
};

export type RecallBackfillInspect = {
  botId: string;
  canBackfill: boolean;
  reason?: string;
  downloadUrl?: string;
  recallLineCount: number;
  s3LineCount: number;
  callEndedAt: string | null;
};

export type RecallBackfillResult = {
  ok: boolean;
  botId: string;
  reason?: string;
  recallLineCount?: number;
  s3LineCountBefore?: number;
  persisted?: boolean;
};

function backfillEnabled(): boolean {
  return String(process.env.NOTETAKER_RECALL_BACKFILL_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

function speakerName(segment: RecallTranscriptSegment): string {
  const fromParticipant = String(segment.participant?.name || "").trim();
  if (fromParticipant) return fromParticipant;
  const fromSpeaker = String(segment.speaker || "").trim();
  return fromSpeaker || "Speaker";
}

function isoFromWord(word: RecallWord | undefined, fallbackMs: number): string {
  const abs = String(word?.start_timestamp?.absolute || "").trim();
  if (abs) {
    const ms = Date.parse(abs);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date(fallbackMs).toISOString();
}

/** Recall post-meeting artifact → Notetaker transcript lines. */
export function recallSegmentsToTranscriptLines(segments: RecallTranscriptSegment[]): NotetakerTranscriptLine[] {
  const lines: NotetakerTranscriptLine[] = [];
  let fallbackMs = Date.now();

  for (const segment of segments) {
    const name = speakerName(segment);
    const words = Array.isArray(segment.words) ? segment.words : [];
    if (!words.length) continue;

    const text = words
      .map((w) => String(w.text || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) continue;

    const receivedAt = isoFromWord(words[0], fallbackMs);
    fallbackMs = Date.parse(receivedAt) + 1;
    lines.push({
      received_at: receivedAt,
      event: "transcript",
      participant: { name },
      text,
    });
  }

  return lines.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
}

/** Presigned S3 URL — must use plain fetch (no Recall Authorization header). */
export async function downloadRecallTranscriptSegments(downloadUrl: string): Promise<RecallTranscriptSegment[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(downloadUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text.slice(0, 300) || `Recall transcript download failed (${res.status})`);
    }
    const data = text ? JSON.parse(text) : null;
    if (!Array.isArray(data)) {
      throw new Error("Recall transcript download was not a JSON array");
    }
    return data as RecallTranscriptSegment[];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRecallTranscriptDownloadUrl(botId: string): Promise<string | null> {
  const id = String(botId || "").trim();
  if (!id) return null;

  const lifecycle = await fetchRecallBotLifecycle(id);
  return lifecycle.transcriptDownloadUrl ?? null;
}

export function pickLongerTranscriptLines(
  primary: NotetakerTranscriptLine[],
  secondary: NotetakerTranscriptLine[],
): NotetakerTranscriptLine[] {
  const a = composeTranscript(primary).transcriptText;
  const b = composeTranscript(secondary).transcriptText;
  if (b.length > a.length) return secondary;
  return primary;
}

async function s3TranscriptLineCount(botId: string): Promise<number> {
  const index = await loadBotIndexDoc(botId);
  if (!index?.transcriptKey) return 0;
  try {
    const text = (await getTranscriptTextFromS3({ transcriptKey: index.transcriptKey })).trim();
    return text ? text.split("\n").filter(Boolean).length : 0;
  } catch {
    return 0;
  }
}

export async function inspectRecallTranscriptBackfill(botId: string): Promise<RecallBackfillInspect> {
  const id = String(botId || "").trim();
  const lifecycle = await fetchRecallBotLifecycle(id);
  const downloadUrl = lifecycle.transcriptDownloadUrl ?? null;
  const callEnded = Boolean(lifecycle.callEndedAt || lifecycle.doneAt);
  const s3LineCount = await s3TranscriptLineCount(id);

  if (!backfillEnabled()) {
    return { botId: id, canBackfill: false, reason: "disabled", s3LineCount, recallLineCount: 0, callEndedAt: lifecycle.callEndedAt, downloadUrl: downloadUrl ?? undefined };
  }
  if (!downloadUrl) {
    return { botId: id, canBackfill: false, reason: "no_recall_artifact", s3LineCount, recallLineCount: 0, callEndedAt: lifecycle.callEndedAt };
  }
  if (!callEnded) {
    return { botId: id, canBackfill: false, reason: "call_not_ended", s3LineCount, recallLineCount: 0, callEndedAt: lifecycle.callEndedAt, downloadUrl };
  }

  let recallLineCount = 0;
  try {
    const segments = await downloadRecallTranscriptSegments(downloadUrl);
    recallLineCount = recallSegmentsToTranscriptLines(segments).length;
  } catch (e) {
    return {
      botId: id,
      canBackfill: false,
      reason: `download_failed: ${String(e)}`,
      s3LineCount,
      recallLineCount: 0,
      callEndedAt: lifecycle.callEndedAt,
      downloadUrl,
    };
  }

  const canBackfill = recallLineCount > s3LineCount;
  return {
    botId: id,
    canBackfill,
    reason: canBackfill ? undefined : "s3_already_complete",
    downloadUrl,
    recallLineCount,
    s3LineCount,
    callEndedAt: lifecycle.callEndedAt,
  };
}

function sessionFromBotIndex(botId: string, index: Awaited<ReturnType<typeof loadBotIndexDoc>>): NotetakerSession {
  return {
    botId,
    title: String(index?.title || "Meeting").trim() || "Meeting",
    createdAt: String(index?.finalizedAt || new Date().toISOString()),
    status: "persisted",
  };
}

/**
 * Pull the full post-meeting transcript from Recall and rewrite S3 when Recall has more content.
 */
export async function backfillTranscriptFromRecall(botId: string): Promise<RecallBackfillResult> {
  const id = String(botId || "").trim();
  if (!id) return { ok: false, botId: id, reason: "missing_bot_id" };

  const inspect = await inspectRecallTranscriptBackfill(id);
  if (!inspect.canBackfill || !inspect.downloadUrl) {
    return {
      ok: false,
      botId: id,
      reason: inspect.reason || "cannot_backfill",
      s3LineCountBefore: inspect.s3LineCount,
      recallLineCount: inspect.recallLineCount,
    };
  }

  const segments = await downloadRecallTranscriptSegments(inspect.downloadUrl);
  const recallLines = recallSegmentsToTranscriptLines(segments);
  if (!recallLines.length) {
    return { ok: false, botId: id, reason: "empty_recall_transcript", s3LineCountBefore: inspect.s3LineCount };
  }

  const index = await loadBotIndexDoc(id);
  const session = await withResolvedMeetingTitle(sessionFromBotIndex(id, index));
  const result = await autoPersistEndedMeetingToS3({
    session,
    lines: recallLines,
    forceNotes: true,
  });

  if (result.persisted) {
    invalidateNotetakerCalendarS3Cache();
    return {
      ok: true,
      botId: id,
      persisted: true,
      s3LineCountBefore: inspect.s3LineCount,
      recallLineCount: recallLines.length,
    };
  }

  return {
    ok: false,
    botId: id,
    reason: result.skipped || "persist_failed",
    s3LineCountBefore: inspect.s3LineCount,
    recallLineCount: recallLines.length,
  };
}

/** Merge upstream lines with Recall artifact when Recall is longer. */
export async function mergeRecallTranscriptIfRicher(args: {
  botId: string;
  session: NotetakerSession;
  upstreamLines: NotetakerTranscriptLine[];
}): Promise<NotetakerTranscriptLine[]> {
  if (!backfillEnabled()) return args.upstreamLines;

  const inspect = await inspectRecallTranscriptBackfill(args.botId);
  if (!inspect.canBackfill || !inspect.downloadUrl) return args.upstreamLines;

  const segments = await downloadRecallTranscriptSegments(inspect.downloadUrl);
  const recallLines = recallSegmentsToTranscriptLines(segments);
  return pickLongerTranscriptLines(args.upstreamLines, recallLines);
}

export function recallCallEnded(lifecycle: { callEndedAt?: string | null; doneAt?: string | null }): boolean {
  return Boolean(lifecycle.callEndedAt || lifecycle.doneAt);
}

export function transcriptHash(lines: NotetakerTranscriptLine[]): string {
  return contentHash(composeTranscript(lines).transcriptText);
}
