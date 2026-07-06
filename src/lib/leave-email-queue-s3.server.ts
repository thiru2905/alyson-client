import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { LEAVE_S3_BUCKET } from "@/lib/leave-s3.server";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import type {
  LeaveEmailProcessedEntry,
  LeaveEmailQueueFile,
  LeaveEmailQueueItem,
  LeaveEmailSyncState,
} from "@/lib/leave-email-schema";

export const LEAVE_EMAIL_QUEUE_S3_KEY = "leave/email-queue.json";
export const LEAVE_EMAIL_PROCESSED_S3_KEY = "leave/email-processed.jsonl";
export const LEAVE_EMAIL_SYNC_STATE_S3_KEY = "leave/email-sync-state.json";

function s3() {
  const region = process.env.AWS_REGION?.trim() || process.env.S3_REGION?.trim();
  if (!region) throw new Error("Missing AWS_REGION");
  return new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
    },
  });
}

async function streamToString(stream: unknown): Promise<string> {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: LEAVE_S3_BUCKET, Key: key }));
    if (!r.Body) return null;
    return JSON.parse(await streamToString(r.Body)) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, body: unknown, resource: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: LEAVE_S3_BUCKET,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("leave-email", resource),
    }),
  );
}

async function readProcessedTail(): Promise<string> {
  try {
    const r = await s3().send(
      new GetObjectCommand({ Bucket: LEAVE_S3_BUCKET, Key: LEAVE_EMAIL_PROCESSED_S3_KEY }),
    );
    if (!r.Body) return "";
    return await streamToString(r.Body);
  } catch {
    return "";
  }
}

export function newLeaveEmailQueueItemId(): string {
  return `leave_email_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function readLeaveEmailQueue(): Promise<LeaveEmailQueueFile> {
  const file = await readJson<LeaveEmailQueueFile>(LEAVE_EMAIL_QUEUE_S3_KEY);
  if (!file?.items) {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
  return { ...file, items: file.items ?? [] };
}

export async function writeLeaveEmailQueue(items: LeaveEmailQueueItem[]): Promise<LeaveEmailQueueFile> {
  const file: LeaveEmailQueueFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };
  await writeJson(LEAVE_EMAIL_QUEUE_S3_KEY, file, "queue");
  return file;
}

export async function upsertLeaveEmailQueueItem(item: LeaveEmailQueueItem): Promise<void> {
  const file = await readLeaveEmailQueue();
  const idx = file.items.findIndex((i) => i.id === item.id);
  if (idx >= 0) file.items[idx] = item;
  else file.items.unshift(item);
  await writeLeaveEmailQueue(file.items);
}

export async function readLeaveEmailSyncState(): Promise<LeaveEmailSyncState> {
  const s = await readJson<LeaveEmailSyncState>(LEAVE_EMAIL_SYNC_STATE_S3_KEY);
  return (
    s ?? {
      version: 1,
      lastSyncAt: null,
      lastBackfillThrough: null,
    }
  );
}

export async function writeLeaveEmailSyncState(patch: Partial<LeaveEmailSyncState>): Promise<LeaveEmailSyncState> {
  const prev = await readLeaveEmailSyncState();
  const next: LeaveEmailSyncState = { ...prev, ...patch, version: 1 };
  if (patch.lastError === null || patch.lastError === "") {
    delete next.lastError;
  }
  await writeJson(LEAVE_EMAIL_SYNC_STATE_S3_KEY, next, "sync-state");
  return next;
}

export async function appendLeaveEmailProcessed(entry: LeaveEmailProcessedEntry): Promise<void> {
  const existing = await readProcessedTail();
  const line = `${JSON.stringify(entry)}\n`;
  await s3().send(
    new PutObjectCommand({
      Bucket: LEAVE_S3_BUCKET,
      Key: LEAVE_EMAIL_PROCESSED_S3_KEY,
      Body: existing + line,
      ContentType: "application/x-ndjson; charset=utf-8",
      Tagging: s3CostAllocationTagging("leave-email", "processed"),
    }),
  );
}

export async function loadProcessedGmailIds(): Promise<Set<string>> {
  const raw = await readProcessedTail();
  const ids = new Set<string>();
  for (const line of raw.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as LeaveEmailProcessedEntry;
      if (e.gmailMessageId) ids.add(e.gmailMessageId);
    } catch {
      // skip
    }
  }
  return ids;
}
