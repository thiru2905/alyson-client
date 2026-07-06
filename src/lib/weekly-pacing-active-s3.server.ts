import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { s3CostAllocationTagging } from "@/lib/s3-cost-tags.server";
import { canonicalOfficialEmail, emailLookupKeys } from "@/lib/cintara-email";

export type WeeklyPacingActiveOverrideEntry = {
  employeeId: string;
  email: string;
  name: string;
  active: boolean;
  updatedAt: string;
  updatedBy?: string;
};

export type WeeklyPacingActiveOverridesFile = {
  version: 1;
  updatedAt: string;
  /** Time Doctor user id → override */
  byEmployeeId: Record<string, WeeklyPacingActiveOverrideEntry>;
};

/** S3 location for weekly pacing Active Yes/No overrides (not env-configurable). */
export const WEEKLY_PACING_ACTIVE_S3_BUCKET = "alyson-hr-orgchart";
export const WEEKLY_PACING_ACTIVE_S3_KEY = "pacing/active-overrides.json";

function emptyFile(): WeeklyPacingActiveOverridesFile {
  return { version: 1, updatedAt: new Date().toISOString(), byEmployeeId: {} };
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (required for S3)`);
  return v;
}

function requireEnvAlias(primary: string, aliases: string[]) {
  const v = process.env[primary] || aliases.map((a) => process.env[a]).find(Boolean);
  if (!v) throw new Error(`Missing ${primary} (required for S3)`);
  return v;
}

function s3() {
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  return new S3Client({
    region,
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

async function ensureBucketExists(bucket: string) {
  const client = s3();
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // create below
  }
  const cmd =
    region === "us-east-1"
      ? new CreateBucketCommand({ Bucket: bucket })
      : new CreateBucketCommand({
          Bucket: bucket,
          CreateBucketConfiguration: { LocationConstraint: region as never },
        });
  await client.send(cmd);
}

async function streamToString(stream: unknown) {
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const c of readable) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function isMissingObjectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.Code === "NoSuchKey" || e.$metadata?.httpStatusCode === 404;
}

let cache: { at: number; file: WeeklyPacingActiveOverridesFile } | null = null;
const CACHE_MS = 30_000;

export function invalidateWeeklyPacingActiveOverridesCache() {
  cache = null;
}

export async function readWeeklyPacingActiveOverridesFromS3(
  force = false,
): Promise<WeeklyPacingActiveOverridesFile> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.file;

  const bucket = WEEKLY_PACING_ACTIVE_S3_BUCKET;
  const key = WEEKLY_PACING_ACTIVE_S3_KEY;
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) {
      cache = { at: Date.now(), file: emptyFile() };
      return cache.file;
    }
    const parsed = JSON.parse(await streamToString(r.Body)) as WeeklyPacingActiveOverridesFile;
    const file: WeeklyPacingActiveOverridesFile = {
      version: 1,
      updatedAt: String(parsed?.updatedAt || new Date().toISOString()),
      byEmployeeId:
        parsed?.byEmployeeId && typeof parsed.byEmployeeId === "object" ? parsed.byEmployeeId : {},
    };
    cache = { at: Date.now(), file };
    return file;
  } catch (err) {
    if (isMissingObjectError(err)) {
      cache = { at: Date.now(), file: emptyFile() };
      return cache.file;
    }
    throw err;
  }
}

export async function writeWeeklyPacingActiveOverridesToS3(
  file: WeeklyPacingActiveOverridesFile,
): Promise<{ bucket: string; key: string; updatedAt: string }> {
  const bucket = WEEKLY_PACING_ACTIVE_S3_BUCKET;
  const key = WEEKLY_PACING_ACTIVE_S3_KEY;
  await ensureBucketExists(bucket);
  const updatedAt = new Date().toISOString();
  const body: WeeklyPacingActiveOverridesFile = {
    version: 1,
    updatedAt,
    byEmployeeId: file.byEmployeeId,
  };
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json; charset=utf-8",
      Tagging: s3CostAllocationTagging("weekly-pacing", "active-overrides"),
      Metadata: {
        "x-amz-meta-updated-at": updatedAt,
      },
    }),
  );
  cache = { at: Date.now(), file: body };
  return { bucket, key, updatedAt };
}

export function findWeeklyPacingActiveOverride(
  file: WeeklyPacingActiveOverridesFile,
  args: { employeeId: string; email: string },
): WeeklyPacingActiveOverrideEntry | null {
  const id = String(args.employeeId || "").trim();
  if (id && file.byEmployeeId[id]) return file.byEmployeeId[id]!;

  for (const key of emailLookupKeys(args.email)) {
    const canonical = key.includes("@") ? canonicalOfficialEmail(key) : "";
    for (const entry of Object.values(file.byEmployeeId)) {
      if (id && entry.employeeId === id) return entry;
      const entryEmail = canonicalOfficialEmail(entry.email);
      if (canonical && entryEmail === canonical) return entry;
      if (key && emailLookupKeys(entry.email).includes(key)) return entry;
    }
  }

  return null;
}

export async function upsertWeeklyPacingActiveOverride(args: {
  employeeId: string;
  email: string;
  name: string;
  active: boolean;
  updatedBy?: string;
}): Promise<WeeklyPacingActiveOverrideEntry> {
  const employeeId = String(args.employeeId || "").trim();
  if (!employeeId) throw new Error("Missing employee id");

  const file = await readWeeklyPacingActiveOverridesFromS3(true);
  const now = new Date().toISOString();
  const entry: WeeklyPacingActiveOverrideEntry = {
    employeeId,
    email: String(args.email || "").trim(),
    name: String(args.name || "").trim(),
    active: Boolean(args.active),
    updatedAt: now,
    updatedBy: args.updatedBy?.trim() || undefined,
  };

  file.byEmployeeId[employeeId] = entry;
  await writeWeeklyPacingActiveOverridesToS3(file);
  return entry;
}
