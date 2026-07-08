import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import { buildS3Metadata } from "@/lib/s3-metadata.server";
import { isGenericMeetingTitle } from "@/lib/notetaker-session-title.server";
import {
  dedupeMeetingsByBotId,
  dedupeMeetingsByTitleDay,
  filterGenericMeetingClutter,
  isGenericNormalizedTitle,
  normalizeMeetingTitleKey,
  parseS3MeetingPrefix,
  resolveMeetingSchedule,
} from "@/lib/notetaker-meeting-schedule.server";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (required for S3 calendar)`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary} (required for S3 calendar)`);
  return v;
}

function s3() {
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

async function streamToString(stream: any) {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function parsePrefix(prefix: string) {
  const parsed = parseS3MeetingPrefix(prefix);
  return {
    title: parsed.displayName || "meeting",
    date: parsed.folderDate,
    time: parsed.time,
    startedAt: parsed.folderStartedAt,
  };
}

export type S3Meeting = {
  prefix: string;
  botId: string | null;
  day: string; // YYYY-MM-DD (canonical meeting day)
  title: string;
  notesKey: string | null;
  transcriptKey: string | null;
  tasksKey: string | null;
  startedAt: string | null;
  hasNotes: boolean;
  hasTranscript: boolean;
  hasTasks: boolean;
};

type S3MeetingBuildRow = S3Meeting & {
  folderDate: string;
  isCanonical?: boolean;
  daySource?: "title" | "history" | "event" | "folder";
};

type BotIndexDoc = {
  version: number;
  botId: string;
  title?: string;
  prefix: string;
  finalizedAt?: string;
  transcriptKey?: string;
  notesKey?: string | null;
};

let botIndexCache: { at: number; docs: BotIndexDoc[] } | null = null;
const BOT_INDEX_CACHE_MS = 5 * 60_000;

async function listMeetingAssetPrefixes(
  client: S3Client,
  bucket: string,
  base: string,
  fileName: string,
  opts?: { minSize?: number },
): Promise<Set<string>> {
  const minSize = opts?.minSize ?? 0;
  const out = new Set<string>();
  const suffix = `/${fileName}`;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: base,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = String(obj.Key || "");
      if (!key.endsWith(suffix)) continue;
      if ((obj.Size ?? 0) < minSize) continue;
      const prefix = key.slice(base.length, key.length - suffix.length);
      if (prefix) out.add(prefix);
    }
    token = page.NextContinuationToken;
  } while (token);
  return out;
}

async function getBotIndexDocs(client: S3Client, bucket: string): Promise<BotIndexDoc[]> {
  const now = Date.now();
  if (botIndexCache && now - botIndexCache.at < BOT_INDEX_CACHE_MS) {
    return botIndexCache.docs;
  }
  const docs = await listBotIndexDocs(client, bucket);
  botIndexCache = { at: now, docs };
  return docs;
}

export function invalidateNotetakerCalendarS3Cache() {
  botIndexCache = null;
}

async function listBotIndexDocs(client: S3Client, bucket: string): Promise<BotIndexDoc[]> {
  const base = "alyson-notetaker/bot-index/";
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: base,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = String(obj.Key || "");
      if (key.endsWith(".json")) keys.push(key);
    }
    token = page.NextContinuationToken;
  } while (token);

  const out: BotIndexDoc[] = [];
  const batchSize = 16;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const docs = await Promise.all(
      batch.map(async (key) => {
        try {
          const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          if (!r.Body) return null;
          const parsed = JSON.parse(await streamToString(r.Body)) as BotIndexDoc;
          if (parsed?.version === 1 && parsed.botId && parsed.prefix) return parsed;
        } catch {
          // skip corrupt index entries
        }
        return null;
      }),
    );
    for (const doc of docs) {
      if (doc) out.push(doc);
    }
  }

  return out;
}

type SessionCatalogMeta = {
  titleByPrefix: Map<string, string>;
  eventAtByBotId: Map<string, string>;
  titleByBotId: Map<string, string>;
};

/** Titles + real event times from bot-index + sessions catalog. */
async function loadMeetingCatalogMeta(botIndexDocs: BotIndexDoc[]): Promise<SessionCatalogMeta> {
  const titleByPrefix = new Map<string, string>();
  const eventAtByBotId = new Map<string, string>();
  const titleByBotId = new Map<string, string>();

  for (const parsed of botIndexDocs) {
    const prefix = String(parsed.prefix || "").trim();
    const title = String(parsed.title || "").trim();
    const botId = String(parsed.botId || "").trim();
    if (prefix && title && !isGenericMeetingTitle(title)) titleByPrefix.set(prefix, title);
    if (botId && title && !isGenericMeetingTitle(title)) titleByBotId.set(botId, title);
    // Do NOT use finalizedAt here — re-persists stamp it as "now" and mis-date old meetings.
  }

  try {
    const { getNotetakerSessionsIndexFromS3 } = await import("@/lib/notetaker-sessions-s3.server");
    const idx = await getNotetakerSessionsIndexFromS3();
    const byBotId = new Map(botIndexDocs.map((d) => [String(d.botId), d]));

    for (const s of idx.sessions ?? []) {
      const botId = String(s.botId || "").trim();
      const title = String(s.title || "").trim();
      const createdAt = String(s.createdAt || "").trim();
      if (botId && createdAt) {
        eventAtByBotId.set(botId, createdAt);
      }
      if (!botId || !title) continue;
      if (!isGenericMeetingTitle(title)) {
        titleByBotId.set(botId, title);
        const doc = byBotId.get(botId);
        const prefix = String(doc?.prefix || "").trim();
        if (prefix && !titleByPrefix.has(prefix)) titleByPrefix.set(prefix, title);
      }
    }
  } catch {
    // sessions index optional
  }

  return { titleByPrefix, eventAtByBotId, titleByBotId };
}

/**
 * List meetings in range.
 * Uses bot-index prefixes as primary rows, but recovers the real calendar day from
 * older orphan folders with the same title when a re-persist rewrote the prefix to "today".
 */
export async function listMeetingsFromS3({ start, end }: { start: string; end: string }) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();

  const notesBase = "alyson-notetaker/meetingnotes/";
  const transcriptBase = "alyson-notetaker/transcripts/";
  const tasksBase = "alyson-notetaker/meetingtasks/";

  const [notesPrefixes, transcriptPrefixes, tasksPrefixes, botIndexDocs] = await Promise.all([
    listMeetingAssetPrefixes(client, bucket, notesBase, "notes.md", { minSize: 1 }),
    listMeetingAssetPrefixes(client, bucket, transcriptBase, "transcript.txt", { minSize: 1 }),
    listMeetingAssetPrefixes(client, bucket, tasksBase, "tasks.json", { minSize: 1 }),
    getBotIndexDocs(client, bucket),
  ]);

  const catalog = await loadMeetingCatalogMeta(botIndexDocs);
  const canonicalPrefixes = new Set(
    botIndexDocs.map((d) => String(d.prefix || "").trim()).filter(Boolean),
  );
  const botIndexByPrefix = new Map(
    botIndexDocs.map((d) => [String(d.prefix || "").trim(), d] as const).filter(([p]) => p),
  );

  const allAssetPrefixes = Array.from(
    new Set([...notesPrefixes, ...transcriptPrefixes, ...tasksPrefixes]),
  );

  // Earliest folder date per normalized title — recovers day after a bad re-persist.
  const earliestFolderByTitle = new Map<string, string>();
  for (const p of allAssetPrefixes) {
    const parsed = parsePrefix(p);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) continue;
    const titleKey =
      normalizeMeetingTitleKey(parsed.title) ||
      normalizeMeetingTitleKey(catalog.titleByPrefix.get(p) || "") ||
      "";
    if (isGenericNormalizedTitle(titleKey)) continue;
    const prev = earliestFolderByTitle.get(titleKey);
    if (!prev || parsed.date < prev) earliestFolderByTitle.set(titleKey, parsed.date);
  }

  const prefixes = [...canonicalPrefixes].filter(
    (p) => notesPrefixes.has(p) || transcriptPrefixes.has(p) || tasksPrefixes.has(p),
  );

  const rows: S3MeetingBuildRow[] = [];
  for (const p of prefixes) {
    const idx = botIndexByPrefix.get(p);
    const botId = idx?.botId ? String(idx.botId) : null;
    const parsed = parsePrefix(p);
    const title =
      (botId && catalog.titleByBotId.get(botId)) ||
      catalog.titleByPrefix.get(p) ||
      idx?.title ||
      parsed.title ||
      "Meeting";
    const eventAt = (botId && catalog.eventAtByBotId.get(botId)) || null;
    const titleKey = normalizeMeetingTitleKey(title) || "";
    const earliestFolderDay = !isGenericNormalizedTitle(titleKey)
      ? earliestFolderByTitle.get(titleKey) || null
      : null;

    const schedule = resolveMeetingSchedule({
      title,
      prefix: p,
      eventAt,
      earliestFolderDay,
    });

    const day = schedule.day;
    if (!day || day < start || day > end) continue;

    rows.push({
      prefix: p,
      botId,
      day,
      title,
      startedAt: schedule.startedAt,
      notesKey: `${notesBase}${p}/notes.md`,
      transcriptKey: `${transcriptBase}${p}/transcript.txt`,
      tasksKey: `${tasksBase}${p}/tasks.json`,
      hasNotes: notesPrefixes.has(p),
      hasTranscript: transcriptPrefixes.has(p),
      hasTasks: tasksPrefixes.has(p),
      folderDate: schedule.folderDate,
      isCanonical: true,
      daySource: schedule.daySource,
    });
  }

  const deduped = filterGenericMeetingClutter(
    dedupeMeetingsByTitleDay(dedupeMeetingsByBotId(rows)),
  );
  deduped.sort((a, b) => (b.startedAt || b.day).localeCompare(a.startedAt || a.day));
  return deduped.map(({ folderDate: _folderDate, isCanonical: _c, daySource: _d, ...row }) => row);
}

export type NotesCoverageReport = {
  totalMeetings: number;
  withTranscript: number;
  withNotes: number;
  withBoth: number;
  missingNotes: Array<{ prefix: string; botId: string | null; day: string; title: string }>;
};

export type TasksCoverageReport = {
  totalMeetings: number;
  withTranscript: number;
  withNotes: number;
  withBoth: number;
  withTasks: number;
  missingTasks: Array<{
    prefix: string;
    botId: string | null;
    day: string;
    title: string;
    notesKey: string;
    transcriptKey: string;
  }>;
};

/** List transcripts in S3 that have no notes.md (read-only audit). */
export async function auditNotesCoverageFromS3(): Promise<NotesCoverageReport> {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();
  const notesBase = "alyson-notetaker/meetingnotes/";
  const transcriptBase = "alyson-notetaker/transcripts/";

  const [notesPrefixes, transcriptPrefixes] = await Promise.all([
    listMeetingAssetPrefixes(client, bucket, notesBase, "notes.md", { minSize: 1 }),
    listMeetingAssetPrefixes(client, bucket, transcriptBase, "transcript.txt", { minSize: 1 }),
  ]);

  const allPrefixes = new Set([...notesPrefixes, ...transcriptPrefixes]);
  const botIndexDocs = await getBotIndexDocs(client, bucket);
  const botIndexByPrefix = new Map(botIndexDocs.map((d) => [String(d.prefix), d]));
  const catalog = await loadMeetingCatalogMeta(botIndexDocs);

  const missingNotes: NotesCoverageReport["missingNotes"] = [];
  let withBoth = 0;

  for (const p of transcriptPrefixes) {
    const hasNotes = notesPrefixes.has(p);
    if (hasNotes) {
      withBoth += 1;
      continue;
    }
    const parsed = parsePrefix(p);
    const idx = botIndexByPrefix.get(p);
    const botId = idx?.botId ? String(idx.botId) : null;
    const title =
      (botId && catalog.titleByBotId.get(botId)) ||
      catalog.titleByPrefix.get(p) ||
      idx?.title ||
      parsed.title ||
      "Meeting";
    const schedule = resolveMeetingSchedule({
      title,
      prefix: p,
      eventAt: (botId && catalog.eventAtByBotId.get(botId)) || null,
    });
    missingNotes.push({
      prefix: p,
      botId,
      day: schedule.day,
      title,
    });
  }

  missingNotes.sort((a, b) => b.day.localeCompare(a.day));

  return {
    totalMeetings: allPrefixes.size,
    withTranscript: transcriptPrefixes.size,
    withNotes: notesPrefixes.size,
    withBoth,
    missingNotes,
  };
}

/** Meetings with notes + transcript but no tasks.json in S3. */
export async function auditTasksCoverageFromS3(): Promise<TasksCoverageReport> {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();
  const notesBase = "alyson-notetaker/meetingnotes/";
  const transcriptBase = "alyson-notetaker/transcripts/";
  const tasksBase = "alyson-notetaker/meetingtasks/";

  const [notesPrefixes, transcriptPrefixes, tasksPrefixes] = await Promise.all([
    listMeetingAssetPrefixes(client, bucket, notesBase, "notes.md", { minSize: 1 }),
    listMeetingAssetPrefixes(client, bucket, transcriptBase, "transcript.txt", { minSize: 1 }),
    listMeetingAssetPrefixes(client, bucket, tasksBase, "tasks.json", { minSize: 1 }),
  ]);

  const allPrefixes = new Set([...notesPrefixes, ...transcriptPrefixes, ...tasksPrefixes]);
  const botIndexDocs = await getBotIndexDocs(client, bucket);
  const botIndexByPrefix = new Map(botIndexDocs.map((d) => [String(d.prefix), d]));
  const catalog = await loadMeetingCatalogMeta(botIndexDocs);

  const missingTasks: TasksCoverageReport["missingTasks"] = [];
  let withBoth = 0;

  for (const p of transcriptPrefixes) {
    const hasNotes = notesPrefixes.has(p);
    if (!hasNotes) continue;
    withBoth += 1;
    if (tasksPrefixes.has(p)) continue;

    const parsed = parsePrefix(p);
    const idx = botIndexByPrefix.get(p);
    const botId = idx?.botId ? String(idx.botId) : null;
    const title =
      (botId && catalog.titleByBotId.get(botId)) ||
      catalog.titleByPrefix.get(p) ||
      idx?.title ||
      parsed.title ||
      "Meeting";
    const schedule = resolveMeetingSchedule({
      title,
      prefix: p,
      eventAt: (botId && catalog.eventAtByBotId.get(botId)) || null,
    });
    missingTasks.push({
      prefix: p,
      botId,
      day: schedule.day,
      title,
      notesKey: `${notesBase}${p}/notes.md`,
      transcriptKey: `${transcriptBase}${p}/transcript.txt`,
    });
  }

  missingTasks.sort((a, b) => b.day.localeCompare(a.day));

  return {
    totalMeetings: allPrefixes.size,
    withTranscript: transcriptPrefixes.size,
    withNotes: notesPrefixes.size,
    withBoth,
    withTasks: tasksPrefixes.size,
    missingTasks,
  };
}

export async function getNotesMdFromS3({ notesKey }: { notesKey: string }) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: notesKey }));
  const body = r.Body;
  if (!body) throw new Error("Notes not found");
  return await streamToString(body);
}

export async function getTranscriptTextFromS3({ transcriptKey }: { transcriptKey: string }) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: transcriptKey }));
  const body = r.Body;
  if (!body) throw new Error("Transcript not found");
  return await streamToString(body);
}

export async function getTasksJsonFromS3({ tasksKey }: { tasksKey: string }): Promise<string | null> {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();
  try {
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: tasksKey }));
    const body = r.Body;
    if (!body) return null;
    return await streamToString(body);
  } catch {
    return null;
  }
}

export async function putTasksJsonToS3({
  tasksKey,
  body,
  metadata,
}: {
  tasksKey: string;
  body: string;
  metadata?: Record<string, string>;
}) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: tasksKey,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("notetaker-calendar", "tasks"),
      Metadata: metadata ? buildS3Metadata(metadata) : undefined,
    }),
  );
}

