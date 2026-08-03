import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sendMeetingNotesEmail } from "@/lib/meeting-notes-email.server";
import { ensureMeetingNotesInS3 } from "@/lib/notetaker-auto-persist.server";
import {
  isTranscriptIdleStable,
  notesIdleStableMs,
  nextTranscriptIdleFields,
} from "@/lib/notetaker-persistence.server";
import { buildS3Metadata } from "@/lib/s3-metadata.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import { loadBotIndexDoc, listAllBotIndexDocs } from "@/lib/notetaker-sessions-history.server";

export type AutoMeetingNotesEmailResult = {
  botId: string;
  attempted: boolean;
  sent: boolean;
  skipped?: string;
  recipients?: string[];
  error?: string;
  /** How long the transcript has been unchanged (ms), when known. */
  idleMs?: number;
  /** Required idle window before notes+email (ms). */
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

async function markNotesEmailSent(
  botId: string,
  args: { sentAt: string; messageId?: string; recipients: string[] },
): Promise<void> {
  const index = await loadBotIndexDoc(botId);
  if (!index?.prefix) return;

  await s3().send(
    new PutObjectCommand({
      Bucket: requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]),
      Key: `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`,
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
      Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: botId }),
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
    // Prefer known finalize/end markers so we don't restart the 15m clock from "now".
    nowIso:
      index.cronFinalizedAt ||
      index.recallCallEndedAt ||
      index.finalizedAt ||
      new Date().toISOString(),
  });

  await s3().send(
    new PutObjectCommand({
      Bucket: requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]),
      Key: `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`,
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
 * Pipeline:
 * 1) Live transcript hash unchanged for ≥15 min (NOTETAKER_NOTES_IDLE_STABLE_MS)
 * 2) Generate notes from the full transcript context (if missing)
 * 3) Email participants via SES (idempotent via notesEmailSentAt)
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
  if (!options?.force && index.notesEmailSentAt) {
    return { botId: id, attempted: false, sent: false, skipped: "already_sent", requiredIdleMs };
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

  try {
    const sent = await sendMeetingNotesEmail({
      botId: id,
      notesMd,
      title: index.title,
    });
    await markNotesEmailSent(id, {
      sentAt: new Date().toISOString(),
      messageId: sent.messageId,
      recipients: sent.recipients,
    });
    return {
      botId: id,
      attempted: true,
      sent: true,
      recipients: sent.recipients,
      idleMs,
      requiredIdleMs,
      notesGenerated,
    };
  } catch (e) {
    return {
      botId: id,
      attempted: true,
      sent: false,
      error: e instanceof Error ? e.message : String(e),
      skipped: "send_failed",
      idleMs,
      requiredIdleMs,
      notesGenerated,
    };
  }
}

const MAX_AUTO_EMAILS_PER_SWEEP = 12;

/**
 * Cron sweep: only meetings whose transcript has been idle ≥15m and still lack notesEmailSentAt.
 */
export async function sweepAutoSendMeetingNotesEmails(): Promise<AutoMeetingNotesEmailSweepResult> {
  const docs = await listAllBotIndexDocs();
  const candidates = docs.filter((d) => {
    const botId = String(d.botId || "").trim();
    if (!botId || !d.prefix) return false;
    if (d.notesEmailSentAt) return false;
    if (d.supersededByBotId) return false;
    if (!d.transcriptKey || !d.transcriptHash) return false;
    // Prefer rows that already look idle, or that have end markers (clock may still be ticking).
    return (
      isTranscriptIdleStable(d) ||
      Boolean(d.recallCallEndedAt || d.cronFinalized || d.finalizedAt || d.transcriptUnchangedSince)
    );
  });

  const result: AutoMeetingNotesEmailSweepResult = {
    scanned: candidates.length,
    attempted: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  for (const doc of candidates.slice(0, MAX_AUTO_EMAILS_PER_SWEEP)) {
    const row = await maybeAutoSendMeetingNotesEmail(String(doc.botId));
    result.results.push(row);
    if (row.attempted) result.attempted += 1;
    if (row.sent) result.sent += 1;
    else if (row.error) result.errors += 1;
    else result.skipped += 1;
  }

  return result;
}
