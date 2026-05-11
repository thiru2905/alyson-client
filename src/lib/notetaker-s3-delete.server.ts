import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (required for S3 delete)`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary} (required for S3 delete)`);
  return v;
}

function s3() {
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

function bucketName() {
  return requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
}

async function streamToString(stream: any) {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

async function loadBotIndex(botId: string) {
  const bucket = bucketName();
  const client = s3();
  const key = `alyson-notetaker/bot-index/${encodeURIComponent(botId)}.json`;
  try {
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return null;
    const txt = await streamToString(r.Body);
    const parsed = JSON.parse(txt) as any;
    if (!parsed || parsed.version !== 1 || String(parsed.botId || "") !== botId) return null;
    return { key, parsed };
  } catch {
    return null;
  }
}

async function findMeetingPrefixByBotId(botId: string) {
  const bucket = bucketName();
  const client = s3();
  const notesBase = "alyson-notetaker/meetingnotes/";

  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: notesBase,
      Delimiter: "/",
    }),
  );

  const prefixes = (listed.CommonPrefixes ?? [])
    .map((p) => String(p.Prefix || ""))
    .filter(Boolean)
    .map((p) => p.replace(notesBase, "").replace(/\/$/, ""));

  // Check object metadata to match botId.
  for (const prefix of prefixes) {
    const transcriptKey = `alyson-notetaker/transcripts/${prefix}/transcript.txt`;
    const notesKey = `alyson-notetaker/meetingnotes/${prefix}/notes.md`;

    for (const key of [transcriptKey, notesKey]) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        const meta = head.Metadata ?? {};
        const metaBot = String(meta["x-amz-meta-bot-id"] || meta["bot-id"] || meta["x-amz-meta-session-id"] || "").trim();
        // NOTE: AWS SDK lowercases metadata keys, but preserves values.
        // In our uploads we set keys like "x-amz-meta-bot-id" inside Metadata (which becomes "x-amz-meta-bot-id" or "x-amz-meta-bot-id"?).
        // Some SDKs normalize; we try a few.
        if (metaBot && metaBot === botId) return prefix;

        // Fallback: if metadata was stored as "bot-id" by normalization
        const botAlt = String(meta["x-amz-meta-bot-id"] || meta["botid"] || meta["bot_id"] || "").trim();
        if (botAlt && botAlt === botId) return prefix;
      } catch {
        // ignore missing objects
      }
    }
  }

  return null;
}

export async function deletePersistedMeetingFromS3ByBotId(botId: string) {
  const bucket = bucketName();
  const client = s3();

  // Fast path: use bot-index if present.
  const idx = await loadBotIndex(botId);
  if (idx?.parsed?.prefix) {
    const transcriptKey = String(idx.parsed.transcriptKey || `alyson-notetaker/transcripts/${idx.parsed.prefix}/transcript.txt`);
    const notesKey = idx.parsed.notesKey ? String(idx.parsed.notesKey) : `alyson-notetaker/meetingnotes/${idx.parsed.prefix}/notes.md`;

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: transcriptKey }));
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: notesKey }));
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: String(idx.key) }));

    return { deleted: true, prefix: String(idx.parsed.prefix), transcriptKey, notesKey };
  }

  const prefix = await findMeetingPrefixByBotId(botId);
  if (!prefix) {
    return { deleted: false, reason: "No persisted S3 meeting found for this botId.", prefix: null };
  }

  const transcriptKey = `alyson-notetaker/transcripts/${prefix}/transcript.txt`;
  const notesKey = `alyson-notetaker/meetingnotes/${prefix}/notes.md`;

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: transcriptKey }));
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: notesKey }));

  return { deleted: true, prefix, transcriptKey, notesKey };
}

