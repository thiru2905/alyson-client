import { mapMeetingToKnowledgeGraph } from "@/lib/knowledge-graph/kg-deepseek-map.server";
import {
  knowledgeGraphEnabled,
  knowledgeGraphMaxMeetingsPerRun,
  knowledgeGraphTranscriptChars,
} from "@/lib/knowledge-graph/kg-config.server";
import { ensureKnowledgeGraphSchema } from "@/lib/knowledge-graph/kg-schema.server";
import { applyExtractedGraph } from "@/lib/knowledge-graph/kg-write.server";
import type { KgMeetingSyncResult, KgSyncRunResult } from "@/lib/knowledge-graph/kg-types";
import { getNotesMdFromS3, getTranscriptTextFromS3 } from "@/lib/notetaker-s3-calendar.server";
import { listAllBotIndexDocs } from "@/lib/notetaker-sessions-history.server";

type BotIndexLike = {
  botId?: string;
  title?: string;
  prefix?: string;
  transcriptKey?: string;
  notesKey?: string | null;
  transcriptHash?: string;
  notesHash?: string | null;
  meetingDay?: string | null;
  meetingStartedAt?: string | null;
  finalizedAt?: string;
  cronFinalizedAt?: string;
  recallCallEndedAt?: string | null;
  supersededByBotId?: string | null;
  kgSyncedAt?: string;
  kgSyncedTranscriptHash?: string;
  kgSyncedNotesHash?: string;
};

function meetingLooksReady(doc: BotIndexLike): boolean {
  if (!doc.botId || !doc.prefix) return false;
  if (doc.supersededByBotId) return false;
  if (!(doc.transcriptKey || doc.notesKey)) return false;
  return Boolean(doc.recallCallEndedAt || doc.cronFinalizedAt || doc.finalizedAt || doc.notesKey);
}

function alreadySynced(doc: BotIndexLike): boolean {
  if (!doc.kgSyncedAt) return false;
  const sameTranscript =
    !doc.transcriptHash || !doc.kgSyncedTranscriptHash || doc.transcriptHash === doc.kgSyncedTranscriptHash;
  const sameNotes = !doc.notesHash || !doc.kgSyncedNotesHash || doc.notesHash === doc.kgSyncedNotesHash;
  return sameTranscript && sameNotes;
}

async function markBotIndexKgSynced(doc: BotIndexLike): Promise<void> {
  const botId = String(doc.botId || "").trim();
  if (!botId) return;
  try {
    const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
    const { buildS3Metadata } = await import("@/lib/s3-metadata.server");
    const { s3CostAllocationTagging } = await import("@/lib/s3-cost-tags.server");
    const region = process.env.AWS_REGION || process.env.S3_REGION;
    const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
    if (!region || !bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return;

    const client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`,
        Body: JSON.stringify(
          {
            ...doc,
            kgSyncedAt: new Date().toISOString(),
            kgSyncedTranscriptHash: doc.transcriptHash ?? null,
            kgSyncedNotesHash: doc.notesHash ?? null,
          },
          null,
          2,
        ),
        ContentType: "application/json; charset=utf-8",
        Tagging: s3CostAllocationTagging("notetaker", "bot-index"),
        Metadata: buildS3Metadata({ kind: "alyson-notetaker-bot-index", botid: botId }),
      }),
    );
  } catch {
    // marker is best-effort; Neo4j write already succeeded
  }
}

export async function syncMeetingToKnowledgeGraph(doc: BotIndexLike): Promise<KgMeetingSyncResult> {
  const botId = String(doc.botId || "").trim();
  if (!botId) return { botId: "", upserted: false, skipped: "missing_bot_id", people: 0, projects: 0, tasks: 0, topics: 0, relationships: 0 };

  try {
    if (!meetingLooksReady(doc)) {
      return { botId, upserted: false, skipped: "not_ready", people: 0, projects: 0, tasks: 0, topics: 0, relationships: 0 };
    }
    if (alreadySynced(doc)) {
      return { botId, upserted: false, skipped: "already_synced", people: 0, projects: 0, tasks: 0, topics: 0, relationships: 0 };
    }

    let notesMd = "";
    let transcriptText = "";
    if (doc.notesKey) {
      try {
        notesMd = await getNotesMdFromS3({ notesKey: doc.notesKey });
      } catch {
        notesMd = "";
      }
    }
    if (doc.transcriptKey) {
      try {
        const full = await getTranscriptTextFromS3({ transcriptKey: doc.transcriptKey });
        transcriptText = full.slice(0, knowledgeGraphTranscriptChars());
      } catch {
        transcriptText = "";
      }
    }
    if (!notesMd.trim() && !transcriptText.trim()) {
      return { botId, upserted: false, skipped: "no_content", people: 0, projects: 0, tasks: 0, topics: 0, relationships: 0 };
    }

    const title = String(doc.title || "Meeting").trim() || "Meeting";
    const extracted = await mapMeetingToKnowledgeGraph({ botId, title, notesMd, transcriptText });
    const relationships = await applyExtractedGraph(
      {
        botId,
        title,
        startedAt: doc.meetingStartedAt ?? doc.finalizedAt ?? null,
        meetingDay: doc.meetingDay ?? null,
        prefix: doc.prefix,
        transcriptHash: doc.transcriptHash ?? null,
        notesHash: doc.notesHash ?? null,
      },
      extracted,
    );
    await markBotIndexKgSynced(doc);

    return {
      botId,
      upserted: true,
      people: extracted.people.length,
      projects: extracted.projects.length,
      tasks: extracted.tasks.length,
      topics: extracted.topics.length,
      relationships,
    };
  } catch (e) {
    return {
      botId,
      upserted: false,
      people: 0,
      projects: 0,
      tasks: 0,
      topics: 0,
      relationships: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Sync recent ready meetings from S3 bot-index → DeepSeek map → Neo4j.
 * Feature-flagged; safe no-op when KNOWLEDGE_GRAPH_ENABLED=false.
 */
export async function runKnowledgeGraphMeetingSync(options?: {
  maxMeetings?: number;
  forceSchema?: boolean;
}): Promise<KgSyncRunResult> {
  const ranAt = new Date().toISOString();
  if (!knowledgeGraphEnabled()) {
    return {
      ok: true,
      ranAt,
      enabled: false,
      scanned: 0,
      synced: 0,
      skipped: 0,
      errors: 0,
      results: [],
      warnings: ["KNOWLEDGE_GRAPH_ENABLED=false"],
    };
  }

  const warnings: string[] = [];
  try {
    await ensureKnowledgeGraphSchema();
  } catch (e) {
    return {
      ok: false,
      ranAt,
      enabled: true,
      scanned: 0,
      synced: 0,
      skipped: 0,
      errors: 1,
      results: [],
      warnings: [`schema: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const docs = await listAllBotIndexDocs();
  const candidates = docs
    .filter((d) => meetingLooksReady(d as BotIndexLike))
    .sort((a, b) => {
      const aAt = Date.parse(String(a.kgSyncedAt || a.finalizedAt || a.cronFinalizedAt || 0));
      const bAt = Date.parse(String(b.kgSyncedAt || b.finalizedAt || b.cronFinalizedAt || 0));
      // Prefer never-synced first, then newest finalized.
      const aSynced = Boolean(a.kgSyncedAt);
      const bSynced = Boolean(b.kgSyncedAt);
      if (aSynced !== bSynced) return aSynced ? 1 : -1;
      return (Number.isFinite(bAt) ? bAt : 0) - (Number.isFinite(aAt) ? aAt : 0);
    });

  const max = options?.maxMeetings ?? knowledgeGraphMaxMeetingsPerRun();
  const slice = candidates.slice(0, max);
  const results: KgMeetingSyncResult[] = [];
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of slice) {
    const row = await syncMeetingToKnowledgeGraph(doc as BotIndexLike);
    results.push(row);
    if (row.error) errors += 1;
    else if (row.upserted) synced += 1;
    else skipped += 1;
  }

  if (!docs.length) warnings.push("no bot-index docs found");

  return {
    ok: errors === 0,
    ranAt,
    enabled: true,
    scanned: slice.length,
    synced,
    skipped,
    errors,
    results,
    warnings,
  };
}
