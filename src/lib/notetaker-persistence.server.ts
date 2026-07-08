import { createHash } from "node:crypto";
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { NotetakerSession, NotetakerTranscriptLine } from "@/lib/alyson-notetaker-functions";
import { withResolvedMeetingTitle } from "@/lib/notetaker-session-title.server";
import { parseLeadingDdMmYyyy } from "@/lib/notetaker-meeting-schedule.server";
import {
  assertPersistPrefixIntegrity,
  computeAuthenticMeetingDay,
} from "@/lib/notetaker-meeting-integrity.server";
import { loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";
import { buildS3Metadata } from "@/lib/s3-metadata.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";

export type NotetakerBotIndexDoc = {
  version: number;
  botId: string;
  title?: string;
  prefix: string;
  transcriptKey?: string;
  notesKey?: string | null;
  finalizedAt?: string;
  lineCount?: number;
  wordCount?: number;
  transcriptHash?: string;
  notesHash?: string | null;
  /** Two consecutive cron runs with the same hash → stop polling this bot (after call ended). */
  cronLastHash?: string;
  cronStablePasses?: number;
  cronFinalized?: boolean;
  cronFinalizedAt?: string;
  recallCallEndedAt?: string | null;
  /** Recall delete_media succeeded — safe to stop polling Recall storage for this bot. */
  recallMediaDeletedAt?: string;
  /** Authentic calendar day (integrity / listing). */
  meetingDay?: string | null;
  meetingStartedAt?: string | null;
  integrityCheckedAt?: string | null;
  supersededByBotId?: string | null;
  supersededAt?: string | null;
};

/** Consecutive 5-min cron runs with identical hash after Recall call_ended (~15–20 min stable). */
export function cronStablePassesRequired(): number {
  const n = Number(process.env.NOTETAKER_CRON_STABLE_PASSES_REQUIRED ?? "2");
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 6) : 2;
}

export function nextCronStabilityState(args: {
  cronLastHash?: string;
  cronStablePasses?: number;
  currentHash: string;
  callEnded?: boolean;
}) {
  if (!args.callEnded) {
    return {
      cronLastHash: args.currentHash,
      cronStablePasses: 0,
      cronFinalized: false,
      cronFinalizedAt: undefined as string | undefined,
    };
  }

  const matched = Boolean(args.cronLastHash) && args.cronLastHash === args.currentHash;
  const cronStablePasses = matched ? (args.cronStablePasses ?? 0) + 1 : 1;
  const cronFinalized = cronStablePasses >= cronStablePassesRequired();
  return {
    cronLastHash: args.currentHash,
    cronStablePasses,
    cronFinalized,
    cronFinalizedAt: cronFinalized ? new Date().toISOString() : undefined,
  };
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export type PersistMeetingResult = {
  botId: string;
  transcriptKey: string;
  notesKey: string | null;
  finalizedAt: string;
  wroteTranscript: boolean;
  wroteNotes: boolean;
  skippedDuplicate: boolean;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (required for persistence)`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary} (required for persistence)`);
  return v;
}

function sanitizeMeetingName(title: string) {
  return String(title || "Meeting")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "meeting";
}

function utcStamp(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}-${mi}-${ss}` };
}

function buildS3Prefix(session: NotetakerSession) {
  const name = sanitizeMeetingName(session.title || "Meeting");
  const titleDay = parseLeadingDdMmYyyy(session.title || "");
  const startedAt = session.createdAt || new Date().toISOString();
  const { date: createdDate, time } = utcStamp(startedAt);
  const date = titleDay || createdDate;
  return `${name}_${date}_${time}`;
}

function s3() {
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

async function ensureBucketExists(bucket: string) {
  const client = s3();
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // fall through to create
  }

  const cmd =
    region === "us-east-1"
      ? new CreateBucketCommand({ Bucket: bucket })
      : new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: region as never } });

  await client.send(cmd);
}

export function composeTranscript(lines: NotetakerTranscriptLine[]) {
  const sorted = [...lines].sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  const transcriptText = sorted
    .map((L) => {
      const who = (L.participant?.name || "Speaker").trim();
      const text = String(L.text || "").trim();
      if (!text) return "";
      return `${who}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
  return {
    transcriptText,
    lineCount: sorted.length,
    firstLineAt: sorted[0]?.received_at ?? null,
    lastLineAt: sorted[sorted.length - 1]?.received_at ?? null,
    wordCount: transcriptText ? transcriptText.split(/\s+/).filter(Boolean).length : 0,
  };
}

export async function persistMeetingToS3({
  session,
  lines,
  notes,
  existingIndex,
}: {
  session: NotetakerSession;
  lines: NotetakerTranscriptLine[];
  notes: { notesMd: string; model?: string } | null;
  /** Reuse stable S3 keys when updating an in-progress or growing transcript. */
  existingIndex?: NotetakerBotIndexDoc | null;
}) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  await ensureBucketExists(bucket);
  session = await withResolvedMeetingTitle(session);

  let prefix =
    existingIndex?.prefix && String(existingIndex.prefix).trim()
      ? String(existingIndex.prefix)
      : buildS3Prefix(session);

  // Persist-time integrity: if we are creating a NEW folder and title DDMMYYYY
  // disagrees with createdAt day, force the title day into the prefix.
  if (!existingIndex?.prefix) {
    const check = assertPersistPrefixIntegrity({
      title: session.title || "Meeting",
      prefix,
      createdAt: session.createdAt,
    });
    if (!check.ok) prefix = check.prefix;
  }

  const authentic = computeAuthenticMeetingDay({
    title: session.title,
    prefix,
    eventAt: session.createdAt,
  });

  const transcriptKey =
    existingIndex?.transcriptKey ||
    `alyson-notetaker/transcripts/${prefix}/transcript.txt`;
  const notesKey =
    existingIndex?.notesKey ||
    `alyson-notetaker/meetingnotes/${prefix}/notes.md`;
  const botIndexKey = `alyson-notetaker/bot-index/${encodeURIComponent(session.botId)}.json`;

  const endedAt = new Date().toISOString();
  const transcript = composeTranscript(lines);
  const transcriptText = transcript.transcriptText || "";
  const transcriptHash = contentHash(transcriptText);
  const notesMd = notes?.notesMd?.trim() || "";
  const notesHash = notesMd ? contentHash(notesMd) : null;

  const transcriptUnchanged =
    Boolean(existingIndex?.transcriptHash) && existingIndex!.transcriptHash === transcriptHash;
  const notesUnchanged =
    !notesMd || (Boolean(existingIndex?.notesHash) && existingIndex!.notesHash === notesHash);

  if (transcriptUnchanged && notesUnchanged) {
    return {
      botId: session.botId,
      transcriptKey,
      notesKey: existingIndex?.notesKey ?? null,
      finalizedAt: existingIndex?.finalizedAt || endedAt,
      wroteTranscript: false,
      wroteNotes: false,
      skippedDuplicate: true,
    };
  }

  const metadata = buildS3Metadata({
    "session-id": session.botId,
    "bot-id": session.botId,
    "meeting-title": session.title || "Meeting",
    "started-at": session.createdAt || "",
    "ended-at": endedAt,
  });

  let wroteTranscript = false;
  let wroteNotes = false;

  if (!transcriptUnchanged) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: transcriptKey,
        Body: transcriptText,
        ContentType: "text/plain; charset=utf-8",
        Tagging: s3CostAllocationTagging("notetaker", "transcript"),
        Metadata: metadata,
      }),
    );
    wroteTranscript = true;
  }

  if (notesMd && !notesUnchanged) {
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: notesKey,
        Body: notesMd,
        ContentType: "text/markdown; charset=utf-8",
        Tagging: s3CostAllocationTagging("notetaker", "notes"),
        Metadata: metadata,
      }),
    );
    wroteNotes = true;
  }

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: botIndexKey,
      Body: JSON.stringify(
        {
          version: 1,
          botId: session.botId,
          title: session.title,
          prefix,
          transcriptKey,
          notesKey: notesMd ? notesKey : existingIndex?.notesKey ?? null,
          finalizedAt: endedAt,
          lineCount: transcript.lineCount,
          wordCount: transcript.wordCount,
          transcriptHash,
          notesHash: notesHash ?? existingIndex?.notesHash ?? null,
          cronLastHash: existingIndex?.cronLastHash,
          cronStablePasses: existingIndex?.cronStablePasses,
          cronFinalized: existingIndex?.cronFinalized,
          cronFinalizedAt: existingIndex?.cronFinalizedAt,
          recallMediaDeletedAt: existingIndex?.recallMediaDeletedAt,
          recallCallEndedAt: existingIndex?.recallCallEndedAt ?? null,
          meetingDay: authentic.meetingDay,
          meetingStartedAt: authentic.meetingStartedAt || session.createdAt || null,
          integrityCheckedAt: endedAt,
          supersededByBotId: existingIndex?.supersededByBotId ?? null,
          supersededAt: existingIndex?.supersededAt ?? null,
        },
        null,
        2,
      ),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
      Metadata: buildS3Metadata({
        kind: "alyson-notetaker-bot-index",
        botid: String(session.botId),
      }),
    }),
  );

  if (transcriptText.trim()) {
    const { deleteRecallMediaAfterS3Persist } = await import("@/lib/notetaker-recall-media-cleanup.server");
    void deleteRecallMediaAfterS3Persist({
      botId: session.botId,
      transcriptKey,
      existingRecallMediaDeletedAt: existingIndex?.recallMediaDeletedAt,
      persistedAt: endedAt,
    }).catch(() => {
      // cron cleanup retries; persist must not fail on Recall delete
    });
  }

  return {
    botId: session.botId,
    transcriptKey,
    notesKey: notesMd ? notesKey : existingIndex?.notesKey ?? null,
    finalizedAt: endedAt,
    wroteTranscript,
    wroteNotes,
    skippedDuplicate: false,
  };
}

/** Write notes.md for a meeting folder prefix (no bot-index required). */
export async function writeNotesMdForMeetingPrefix(prefix: string, notesMd: string, botId?: string) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  await ensureBucketExists(bucket);
  const notesKey = `alyson-notetaker/meetingnotes/${prefix}/notes.md`;
  const body = notesMd.trim();
  if (!body) throw new Error("Empty notes");
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: notesKey,
      Body: body,
      ContentType: "text/markdown; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "notes"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-notes", prefix }),
    }),
  );

  if (botId) {
    const existing = await loadBotIndexDoc(botId);
    if (existing?.prefix) {
      const botIndexKey = `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`;
      const notesHash = contentHash(body);
      await s3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: botIndexKey,
          Body: JSON.stringify({ ...existing, notesKey, notesHash }, null, 2),
          ContentType: "application/json; charset=utf-8",
          Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
          Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: String(botId) }),
        }),
      );
    }
  }

  return { notesKey };
}

/** Record cron stability on bot-index (no transcript rewrite). */
export async function patchBotIndexCronStability(
  botId: string,
  currentHash: string,
  options?: { callEnded?: boolean; recallCallEndedAt?: string | null; existing?: NotetakerBotIndexDoc | null },
): Promise<{ cronFinalized: boolean; cronStablePasses: number; newlyFinalized: boolean }> {
  const index = options?.existing ?? (await loadBotIndexDoc(botId));
  if (!index?.prefix) {
    return { cronFinalized: false, cronStablePasses: 0, newlyFinalized: false };
  }

  const wasFinalized = Boolean(index.cronFinalized);
  const next = nextCronStabilityState({
    cronLastHash: index.cronLastHash,
    cronStablePasses: index.cronStablePasses,
    currentHash,
    callEnded: options?.callEnded,
  });

  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const botIndexKey = `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`;

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: botIndexKey,
      Body: JSON.stringify(
        {
          ...index,
          ...next,
          recallCallEndedAt: options?.recallCallEndedAt ?? index.recallCallEndedAt ?? null,
          cronFinalizedAt: next.cronFinalized
            ? index.cronFinalizedAt || next.cronFinalizedAt
            : undefined,
        },
        null,
        2,
      ),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: String(botId) }),
    }),
  );

  return {
    cronFinalized: next.cronFinalized,
    cronStablePasses: next.cronStablePasses,
    newlyFinalized: next.cronFinalized && !wasFinalized,
  };
}

/** Mark Recall-side media as deleted on the bot-index (after delete_media succeeds). */
export async function patchBotIndexRecallMediaDeleted(
  botId: string,
  args: { deletedAt: string },
): Promise<void> {
  const index = await loadBotIndexDoc(botId);
  if (!index?.prefix) return;

  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const botIndexKey = `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`;

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: botIndexKey,
      Body: JSON.stringify(
        {
          ...index,
          recallMediaDeletedAt: args.deletedAt,
        },
        null,
        2,
      ),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: String(botId) }),
    }),
  );
}

