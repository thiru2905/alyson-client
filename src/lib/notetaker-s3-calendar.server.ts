import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

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
  // Expected: <MeetingName>_<YYYY-MM-DD>_<HH-MM-SS>
  // MeetingName itself may contain underscores due to sanitization; we parse from the end.
  const parts = prefix.split("_");
  const time = parts.pop() || "";
  const date = parts.pop() || "";
  const name = parts.join("_") || "meeting";
  const iso = `${date}T${time.replaceAll("-", ":")}Z`;
  const startedAt = isFinite(Date.parse(iso)) ? iso : null;
  return { title: name.replaceAll("-", " "), date, time, startedAt };
}

export type S3Meeting = {
  prefix: string;
  day: string; // YYYY-MM-DD
  title: string;
  notesKey: string | null;
  transcriptKey: string | null;
  startedAt: string | null;
};

export async function listMeetingsFromS3({ start, end }: { start: string; end: string }) {
  const bucket = requireEnvAlias("AWS_S3_BUCKET", ["S3_BUCKET"]);
  const client = s3();

  const notesBase = "alyson-notetaker/meetingnotes/";
  const transcriptBase = "alyson-notetaker/transcripts/";

  // 1) List meeting folders by CommonPrefixes (notes + transcripts)
  const notes = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: notesBase,
      Delimiter: "/",
    }),
  );

  const transcripts = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: transcriptBase,
      Delimiter: "/",
    }),
  );

  const notesPrefixes = new Set(
    (notes.CommonPrefixes ?? [])
      .map((p) => String(p.Prefix || ""))
      .filter(Boolean)
      .map((p) => p.replace(notesBase, "").replace(/\/$/, "")),
  );

  const transcriptPrefixes = new Set(
    (transcripts.CommonPrefixes ?? [])
      .map((p) => String(p.Prefix || ""))
      .filter(Boolean)
      .map((p) => p.replace(transcriptBase, "").replace(/\/$/, "")),
  );

  const prefixes = Array.from(new Set([...notesPrefixes, ...transcriptPrefixes]));

  // 2) Build meeting rows, filter by day in [start, end]
  const rows: S3Meeting[] = [];
  for (const p of prefixes) {
    const parsed = parsePrefix(p);
    const day = parsed.date;
    if (!day || day < start || day > end) continue;
    rows.push({
      prefix: p,
      day,
      title: parsed.title || "Meeting",
      startedAt: parsed.startedAt,
      notesKey: notesPrefixes.has(p) ? `${notesBase}${p}/notes.md` : null,
      transcriptKey: transcriptPrefixes.has(p) ? `${transcriptBase}${p}/transcript.txt` : null,
    });
  }

  // Sort newest first by startedAt (fallback to day)
  rows.sort((a, b) => (b.startedAt || b.day).localeCompare(a.startedAt || a.day));
  return rows;
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

