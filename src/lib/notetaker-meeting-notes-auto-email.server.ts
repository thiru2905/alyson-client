import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ensureMeetingNotesInS3 } from "@/lib/notetaker-auto-persist.server";
import {
  isTranscriptIdleStable,
  notesIdleStableMs,
  nextTranscriptIdleFields,
} from "@/lib/notetaker-persistence.server";
import { buildS3Metadata } from "@/lib/s3-metadata.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import { loadBotIndexDoc } from "@/lib/notetaker-sessions-history.server";

export type AutoMeetingNotesEmailResult = {
  botId: string;
  attempted: boolean;
  sent: boolean;
  skipped?: string;
  recipients?: string[];
  error?: string;
  /** How long the transcript has been unchanged (ms), when known. */
  idleMs?: number;
  /** Required idle window before notes (ms). */
  requiredIdleMs?: number;
  notesGenerated?: boolean;
};

export type AutoMeetingNotesEmailSweepResult = {
  scanned: number;
  attempted: number;
  sent: number;
  skipped: number;
  errors: number;
  results: AutoMeetingNotesEmailResult[];
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary}`);
  return v;
}

function s3() {
  return new S3Client({
    region: requireEnvAlias("AWS_REGION", ["S3_REGION"]),
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

function bucketName() {
  return requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
}

function botIndexKey(botId: string) {
  return `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`;
}

/**
 * Persist delivery metadata after a *manual* SES send succeeds.
 * Auto-email is disabled — this is only for the UI send path.
 */
export async function recordMeetingNotesEmailSent(
  botId: string,
  args: { sentAt: string; messageId?: string; recipients: string[]; claimId?: string },
): Promise<void> {
  const id = String(botId || "").trim();
  if (!id) return;

  const index = await loadBotIndexDoc(id);
  if (!index?.prefix) return;

  await s3().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: botIndexKey(id),
      Body: JSON.stringify(
        {
          ...index,
          notesEmailSentAt: args.sentAt,
          notesEmailMessageId: args.messageId ?? null,
          notesEmailRecipients: args.recipients,
        },
        null,
        2,
      ),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: id }),
    }),
  );
}

/** Backfill transcriptUnchangedSince when older bot-index rows lack it. */
async function ensureTranscriptIdleMarker(
  botId: string,
  index: NonNullable<Awaited<ReturnType<typeof loadBotIndexDoc>>>,
): Promise<NonNullable<Awaited<ReturnType<typeof loadBotIndexDoc>>>> {
  if (index.transcriptUnchangedSince && Number.isFinite(Date.parse(index.transcriptUnchangedSince))) {
    return index;
  }
  if (!index.transcriptHash) return index;

  const idle = nextTranscriptIdleFields({
    previousHash: null,
    previousUnchangedSince: null,
    currentHash: index.transcriptHash,
    nowIso:
      index.cronFinalizedAt ||
      index.recallCallEndedAt ||
      index.finalizedAt ||
      new Date().toISOString(),
  });

  await s3().send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: botIndexKey(botId),
      Body: JSON.stringify({ ...index, ...idle }, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: botId }),
    }),
  );

  return { ...index, ...idle };
}

function idleAgeMs(index: { transcriptUnchangedSince?: string | null }): number | undefined {
  const since = Date.parse(String(index.transcriptUnchangedSince || ""));
  if (!Number.isFinite(since)) return undefined;
  return Math.max(0, Date.now() - since);
}

/**
 * Auto SES email is disabled (duplicate-send issues).
 * This path only generates notes after transcript idle ≥15m — send from the UI.
 */
export async function maybeAutoSendMeetingNotesEmail(
  botId: string,
  options?: { force?: boolean; bypassIdleGate?: boolean },
): Promise<AutoMeetingNotesEmailResult> {
  const id = String(botId || "").trim();
  const requiredIdleMs = notesIdleStableMs();
  if (!id) {
    return { botId: "", attempted: false, sent: false, skipped: "missing_bot_id", requiredIdleMs };
  }

  let index = await loadBotIndexDoc(id).catch(() => null);
  if (!index?.prefix) {
    return { botId: id, attempted: false, sent: false, skipped: "no_bot_index", requiredIdleMs };
  }
  if (index.supersededByBotId) {
    return { botId: id, attempted: false, sent: false, skipped: "superseded", requiredIdleMs };
  }
  if (!index.transcriptKey || !index.transcriptHash) {
    return { botId: id, attempted: false, sent: false, skipped: "no_transcript", requiredIdleMs };
  }

  index = await ensureTranscriptIdleMarker(id, index);
  const idleMs = idleAgeMs(index);
  if (!options?.bypassIdleGate && !options?.force && !isTranscriptIdleStable(index)) {
    return {
      botId: id,
      attempted: false,
      sent: false,
      skipped: "transcript_not_idle_15m",
      idleMs,
      requiredIdleMs,
    };
  }

  let notesGenerated = false;
  let notesMd = "";
  if (index.notesKey) {
    try {
      const { getNotesMdFromS3 } = await import("@/lib/notetaker-s3-calendar.server");
      notesMd = (await getNotesMdFromS3({ notesKey: index.notesKey })).trim();
    } catch {
      notesMd = "";
    }
  }
  if (!notesMd) {
    const ensured = await ensureMeetingNotesInS3(id);
    notesMd = String(ensured.notesMd || "").trim();
    notesGenerated = Boolean(notesMd);
  }
  if (!notesMd) {
    return {
      botId: id,
      attempted: false,
      sent: false,
      skipped: "no_notes",
      idleMs,
      requiredIdleMs,
      notesGenerated,
    };
  }

  return {
    botId: id,
    attempted: false,
    sent: false,
    skipped: "auto_email_disabled",
    idleMs,
    requiredIdleMs,
    notesGenerated,
  };
}

/**
 * Auto email sweep disabled — no SES sends from cron.
 */
export async function sweepAutoSendMeetingNotesEmails(): Promise<AutoMeetingNotesEmailSweepResult> {
  return {
    scanned: 0,
    attempted: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };
}
