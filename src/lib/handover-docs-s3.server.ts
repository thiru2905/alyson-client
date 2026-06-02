import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

export type HandoverDocRow = {
  id: string;
  employeeName: string;
  docUrl: string;
  createdAt: string;
  updatedAt: string;
};

type HandoverDocsFile = {
  version: 1;
  updatedAt: string;
  rows: HandoverDocRow[];
};

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
  const accessKeyId = requireEnv("AWS_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("AWS_SECRET_ACCESS_KEY");
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

async function ensureBucketExists(bucket: string) {
  const client = s3();
  const region = requireEnvAlias("AWS_REGION", ["S3_REGION"]);
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // fall through to create
  }
  const cmd =
    region === "us-east-1"
      ? new CreateBucketCommand({ Bucket: bucket })
      : new CreateBucketCommand({
          Bucket: bucket,
          CreateBucketConfiguration: { LocationConstraint: region as any },
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

function bucketName() {
  // Reuse existing orgchart bucket per request.
  return process.env.ALYSON_HR_ORGCHART_S3_BUCKET || "alyson-hr-orgchart";
}

function keyName() {
  // Preserving requested directory name.
  return process.env.ALYSON_HR_HANDOVERDOCS_S3_KEY || "alyson-hr-handoverdocumetnation/index.json";
}

function normalizeRows(rows: HandoverDocRow[]) {
  return [...rows].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function getHandoverDocsFromS3(): Promise<HandoverDocRow[]> {
  const bucket = bucketName();
  const key = keyName();
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!r.Body) return [];
    const parsed = JSON.parse(await streamToString(r.Body)) as HandoverDocsFile;
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    return normalizeRows(
      rows.filter((x) => x?.id && x?.employeeName && x?.docUrl).map((x) => ({
        id: String(x.id),
        employeeName: String(x.employeeName),
        docUrl: String(x.docUrl),
        createdAt: String(x.createdAt || ""),
        updatedAt: String(x.updatedAt || ""),
      })),
    );
  } catch (err) {
    if (isMissingObjectError(err)) return [];
    throw err;
  }
}

export async function putHandoverDocsToS3(rows: HandoverDocRow[]) {
  const bucket = bucketName();
  const key = keyName();
  await ensureBucketExists(bucket);
  const updatedAt = new Date().toISOString();
  const body: HandoverDocsFile = {
    version: 1,
    updatedAt,
    rows: normalizeRows(rows),
  };
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json; charset=utf-8",
      Metadata: {
        "x-amz-meta-kind": "alyson-hr-handover-docs",
        "x-amz-meta-updated-at": updatedAt,
      },
    }),
  );
  return { bucket, key, updatedAt };
}

export async function upsertHandoverDocInS3(input: { employeeName: string; docUrl: string }) {
  const now = new Date().toISOString();
  const employeeName = input.employeeName.trim();
  const docUrl = input.docUrl.trim();
  const existing = await getHandoverDocsFromS3();
  const idx = existing.findIndex((r) => r.employeeName.toLowerCase() === employeeName.toLowerCase());
  if (idx >= 0) {
    existing[idx] = {
      ...existing[idx]!,
      employeeName,
      docUrl,
      updatedAt: now,
    };
  } else {
    existing.push({
      id: crypto.randomUUID(),
      employeeName,
      docUrl,
      createdAt: now,
      updatedAt: now,
    });
  }
  await putHandoverDocsToS3(existing);
  return normalizeRows(existing);
}

export async function deleteHandoverDocFromS3(id: string) {
  const existing = await getHandoverDocsFromS3();
  const next = existing.filter((r) => r.id !== id);
  await putHandoverDocsToS3(next);
  return normalizeRows(next);
}
