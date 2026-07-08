import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { sendMeetingNotesEmail } from "@/lib/meeting-notes-email.server";
import { ensureMeetingNotesInS3 } from "@/lib/notetaker-auto-persist.server";
import { buildS3Metadata } from "@/lib/s3-metadata.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import { fetchRecallBotLifecycle } from "@/lib/recall/recall-bot-status.server";
import { recallCallEnded } from "@/lib/recall/recall-transcript-backfill.server";
import { loadBotIndexDoc, listAllBotIndexDocs } from "@/lib/notetaker-sessions-history.server";

export type AutoMeetingNotesEmailResult = {
  botId: string;
  attempted: boolean;
  sent: boolean;
  skipped?: string;
  recipients?: string[];
  error?: string;
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

async function meetingLooksEnded(botId: string): Promise<boolean> {
  const index = await loadBotIndexDoc(botId).catch(() => null);
  if (index?.recallCallEndedAt || index?.cronFinalized) return true;

  if (index?.finalizedAt && index?.notesKey) {
    try {
      const lifecycle = await fetchRecallBotLifecycle(botId);
      if (recallCallEnded(lifecycle)) return true;
      const last = lifecycle.finalStatusCode;
      if (last && !["done", "fatal", "call_ended", "unknown", "fetch_failed"].includes(last)) {
        return false;
      }
    } catch {
      // finalized + notes is enough when Recall status is unavailable
    }
    return true;
  }

  try {
    const lifecycle = await fetchRecallBotLifecycle(botId);
    return recallCallEnded(lifecycle);
  } catch {
    return false;
  }
}

/**
 * Listener: once Recall bot leaves / call ends, ensure notes exist and email participants.
 * Always includes thirumalai@cintara.ai via the recipient resolver.
 * Idempotent via notesEmailSentAt on bot-index.
 */
export async function maybeAutoSendMeetingNotesEmail(
  botId: string,
  options?: { force?: boolean },
): Promise<AutoMeetingNotesEmailResult> {
  const id = String(botId || "").trim();
  if (!id) return { botId: "", attempted: false, sent: false, skipped: "missing_bot_id" };

  const index = await loadBotIndexDoc(id).catch(() => null);
  if (!index?.prefix) {
    return { botId: id, attempted: false, sent: false, skipped: "no_bot_index" };
  }
  if (!options?.force && index.notesEmailSentAt) {
    return { botId: id, attempted: false, sent: false, skipped: "already_sent" };
  }
  if (index.supersededByBotId) {
    return { botId: id, attempted: false, sent: false, skipped: "superseded" };
  }

  const ended = await meetingLooksEnded(id);
  if (!ended) {
    return { botId: id, attempted: false, sent: false, skipped: "call_not_ended" };
  }

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
  }
  if (!notesMd) {
    return { botId: id, attempted: false, sent: false, skipped: "no_notes" };
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
    };
  } catch (e) {
    return {
      botId: id,
      attempted: true,
      sent: false,
      error: e instanceof Error ? e.message : String(e),
      skipped: "send_failed",
    };
  }
}

const MAX_AUTO_EMAILS_PER_SWEEP = 12;

/** Cron sweep: email notes for ended meetings that still lack notesEmailSentAt. */
export async function sweepAutoSendMeetingNotesEmails(): Promise<AutoMeetingNotesEmailSweepResult> {
  const docs = await listAllBotIndexDocs();
  const candidates = docs.filter((d) => {
    const botId = String(d.botId || "").trim();
    if (!botId || !d.prefix) return false;
    if (d.notesEmailSentAt) return false;
    if (d.supersededByBotId) return false;
    return Boolean(d.recallCallEndedAt || d.cronFinalized || d.finalizedAt || d.notesKey);
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
