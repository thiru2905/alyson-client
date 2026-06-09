import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type { RecallCalendarPlatform } from "@/lib/recall/recall-calendar-types";

export type RecallCalendarConnection = {
  recallCalendarId: string;
  platform: RecallCalendarPlatform;
  email: string;
  connectedAt: string;
  status: "connected" | "disconnected" | "connecting";
  lastSyncTs?: string;
  lastSyncAt?: string;
  lastSyncSummary?: { scheduled: number; skipped: number; processed: number; errors: number };
};

export type RecallCalendarState = {
  version: 1;
  updatedAt: string;
  connections: RecallCalendarConnection[];
};

const STATE_KEY = "alyson-notetaker/recall-calendar/connections.json";

function s3Configured() {
  return Boolean(
    (process.env.AWS_S3_BUCKET?.trim() || process.env.S3_BUCKET?.trim()) &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary}`);
  return v;
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
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

async function streamToString(stream: unknown) {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

async function ensureBucketExists(bucket: string) {
  const client = s3();
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // create in dev
  }
  const cmd =
    region === "us-east-1"
      ? new CreateBucketCommand({ Bucket: bucket })
      : new CreateBucketCommand({ Bucket: bucket, CreateBucketConfiguration: { LocationConstraint: region } });
  await client.send(cmd);
}

function emptyState(): RecallCalendarState {
  return { version: 1, updatedAt: new Date().toISOString(), connections: [] };
}

function normalizeState(raw: unknown): RecallCalendarState {
  if (!raw || typeof raw !== "object") return emptyState();
  const o = raw as Partial<RecallCalendarState>;
  const connections = Array.isArray(o.connections) ? o.connections.filter(Boolean) : [];
  return {
    version: 1,
    updatedAt: String(o.updatedAt || new Date().toISOString()),
    connections: connections as RecallCalendarConnection[],
  };
}

export async function readRecallCalendarState(): Promise<RecallCalendarState> {
  if (!s3Configured()) return emptyState();
  const bucket = bucketName();
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: STATE_KEY }));
    if (!r.Body) return emptyState();
    return normalizeState(JSON.parse(await streamToString(r.Body)));
  } catch (e: unknown) {
    const code = (e as { name?: string })?.name;
    if (code === "NoSuchKey" || code === "NotFound") return emptyState();
    throw e;
  }
}

export async function writeRecallCalendarState(state: RecallCalendarState): Promise<void> {
  if (!s3Configured()) throw new Error("S3 is not configured for Recall calendar state");
  const bucket = bucketName();
  await ensureBucketExists(bucket);
  const body: RecallCalendarState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    connections: state.connections ?? [],
  };
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STATE_KEY,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json; charset=utf-8",
      Metadata: { kind: "alyson-recall-calendar-state" },
    }),
  );
}

export async function upsertRecallCalendarConnection(conn: RecallCalendarConnection): Promise<RecallCalendarConnection> {
  const state = await readRecallCalendarState();
  const idx = state.connections.findIndex(
    (c) => c.recallCalendarId === conn.recallCalendarId || c.email.toLowerCase() === conn.email.toLowerCase(),
  );
  if (idx >= 0) state.connections[idx] = { ...state.connections[idx]!, ...conn };
  else state.connections.push(conn);
  await writeRecallCalendarState(state);
  return conn;
}

export async function markRecallCalendarDisconnected(recallCalendarId: string): Promise<void> {
  const state = await readRecallCalendarState();
  const idx = state.connections.findIndex((c) => c.recallCalendarId === recallCalendarId);
  if (idx < 0) return;
  state.connections[idx] = { ...state.connections[idx]!, status: "disconnected" };
  await writeRecallCalendarState(state);
}

export async function removeRecallCalendarConnection(recallCalendarId: string): Promise<void> {
  const state = await readRecallCalendarState();
  state.connections = state.connections.filter((c) => c.recallCalendarId !== recallCalendarId);
  await writeRecallCalendarState(state);
}

export async function updateRecallCalendarSyncMeta(
  recallCalendarId: string,
  meta: { lastSyncTs?: string; lastSyncSummary?: RecallCalendarConnection["lastSyncSummary"] },
): Promise<void> {
  const state = await readRecallCalendarState();
  const idx = state.connections.findIndex((c) => c.recallCalendarId === recallCalendarId);
  if (idx < 0) return;
  state.connections[idx] = {
    ...state.connections[idx]!,
    lastSyncTs: meta.lastSyncTs ?? state.connections[idx]!.lastSyncTs,
    lastSyncAt: new Date().toISOString(),
    lastSyncSummary: meta.lastSyncSummary ?? state.connections[idx]!.lastSyncSummary,
  };
  await writeRecallCalendarState(state);
}

export function getConnectedRecallCalendars(state: RecallCalendarState): RecallCalendarConnection[] {
  return state.connections.filter((c) => c.status === "connected");
}
